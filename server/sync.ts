import { db, getSetting, setSetting, transaction } from './db.ts';
import { pluggy, pluggyConfigured, PluggyError, type PluggyAccount, type PluggyTransaction } from './pluggy.ts';
import { cardRefMonth, detectIgnored, detectMethod, localDate, today, type IgnoreContext } from './classify.ts';
import { matchBills, syncCardBills } from './bills.ts';

const DAYS_BACK = Number(process.env.SYNC_DAYS_BACK ?? 90);
// Margem para pegar transações pendentes que viraram lançadas e ajustes tardios.
const OVERLAP_DAYS = 10;

type AccountRow = { id: string; type: string; close_day: number | null; due_day: number | null };

export const syncState = {
  running: false,
  lastError: null as string | null,
};

function daysAgo(n: number): string {
  const d = new Date(`${today()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function dayOf(iso: string | null | undefined): number | null {
  return iso ? Number(localDate(iso).slice(8, 10)) : null;
}

function ownerContext(): IgnoreContext {
  const names = (getSetting('owner_names') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return { ownerNames: names };
}

function upsertAccount(itemId: string, a: PluggyAccount): void {
  db.prepare(`
    INSERT INTO accounts (id, item_id, type, subtype, name, number, balance, credit_limit, available_limit, close_day, due_day, bill_due_date, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type, subtype = excluded.subtype, name = excluded.name, number = excluded.number,
      balance = excluded.balance, credit_limit = excluded.credit_limit, available_limit = excluded.available_limit,
      close_day = COALESCE(accounts.close_day, excluded.close_day),
      due_day = COALESCE(accounts.due_day, excluded.due_day),
      bill_due_date = excluded.bill_due_date,
      updated_at = excluded.updated_at
  `).run(
    a.id, itemId, a.type, a.subtype ?? null, a.marketingName || a.name, a.number ?? null, a.balance ?? 0,
    a.creditData?.creditLimit ?? null, a.creditData?.availableCreditLimit ?? null,
    dayOf(a.creditData?.balanceCloseDate), dayOf(a.creditData?.balanceDueDate),
    a.creditData?.balanceDueDate ? localDate(a.creditData.balanceDueDate) : null,
  );
}

function refMonthFor(account: AccountRow, date: string, billId: string | null): string {
  if (account.type === 'CREDIT') {
    if (billId) {
      const bill = db.prepare('SELECT due_date FROM card_bills WHERE id = ?').get(billId) as { due_date: string } | undefined;
      if (bill) return bill.due_date.slice(0, 7);
    }
    if (account.close_day && account.due_day) return cardRefMonth(date, account.close_day, account.due_day);
  }
  return date.slice(0, 7);
}

function upsertTransactions(account: AccountRow, txs: PluggyTransaction[], ctx: IgnoreContext): void {
  const stmt = db.prepare(`
    INSERT INTO transactions (id, account_id, date, ref_month, description, amount, flow, status,
      installment_number, total_installments, bill_id, method_auto, ignored_auto, raw)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      date = excluded.date, ref_month = excluded.ref_month, description = excluded.description,
      amount = excluded.amount, flow = excluded.flow, status = excluded.status,
      installment_number = excluded.installment_number, total_installments = excluded.total_installments,
      bill_id = excluded.bill_id, method_auto = excluded.method_auto, ignored_auto = excluded.ignored_auto,
      raw = excluded.raw
  `);
  for (const tx of txs) {
    const date = localDate(tx.date);
    // Conta corrente: DEBIT é saída. Cartão: valor positivo é compra, negativo é pagamento/estorno.
    const flow = account.type === 'CREDIT' ? (tx.amount >= 0 ? 'OUT' : 'IN') : tx.type === 'DEBIT' ? 'OUT' : 'IN';
    const billId = tx.creditCardMetadata?.billId ?? null;
    stmt.run(
      tx.id, account.id, date, refMonthFor(account, date, billId), tx.description, Math.abs(tx.amount), flow, tx.status,
      tx.creditCardMetadata?.installmentNumber ?? null, tx.creditCardMetadata?.totalInstallments ?? null, billId,
      detectMethod(account.type, tx), detectIgnored(account.type, flow, tx, ctx), JSON.stringify(tx),
    );
  }
}

async function syncItem(itemId: string, ctx: IgnoreContext): Promise<void> {
  const item = await pluggy.getItem(itemId);
  db.prepare('UPDATE connections SET connector_name = ?, status = ?, last_updated_at = ?, error = ? WHERE item_id = ?')
    .run(item.connector?.name ?? null, item.status, item.lastUpdatedAt, item.error?.message ?? null, itemId);

  await syncInvestments(itemId);

  const accounts = await pluggy.getAccounts(itemId);
  for (const a of accounts) {
    upsertAccount(itemId, a);
    const row = db.prepare('SELECT id, type, close_day, due_day FROM accounts WHERE id = ?').get(a.id) as AccountRow;

    if (a.type === 'CREDIT') {
      try {
        const bills = await pluggy.getBills(a.id);
        const stmt = db.prepare('INSERT INTO card_bills (id, account_id, due_date, total_amount) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET due_date = excluded.due_date, total_amount = excluded.total_amount');
        for (const b of bills) stmt.run(b.id, a.id, localDate(b.dueDate), b.totalAmount ?? null);
      } catch (err) {
        // Faturas nem sempre estão disponíveis; seguimos com os dias de fechamento/vencimento.
        if (!(err instanceof PluggyError)) throw err;
      }
    }

    const last = db.prepare('SELECT MAX(date) AS d FROM transactions WHERE account_id = ?').get(a.id) as { d: string | null };
    const from = last.d ? daysAgo(Math.max(OVERLAP_DAYS, daysBetween(last.d, today()) + OVERLAP_DAYS)) : daysAgo(DAYS_BACK);
    const txs = await pluggy.getTransactions(a.id, from);

    transaction(() => {
      // Pendentes podem trocar de id quando são lançadas; removemos as da janela e regravamos.
      db.prepare("DELETE FROM transactions WHERE account_id = ? AND status = 'PENDING' AND date >= ?").run(a.id, from);
      upsertTransactions(row, txs, ctx);
    });
  }
}

/**
 * Investimentos do banco. Nem toda conexão (ou plano) da Pluggy entrega esse dado: se a API recusar,
 * o banco fica sem investimentos e a sincronização segue normalmente.
 */
async function syncInvestments(itemId: string): Promise<void> {
  let list;
  try {
    list = await pluggy.getInvestments(itemId);
  } catch (err) {
    if (err instanceof PluggyError) return;
    throw err;
  }
  const upsert = db.prepare(`
    INSERT INTO investments (id, item_id, name, type, subtype, balance, issuer, due_date, rate, rate_type, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, type = excluded.type, subtype = excluded.subtype, balance = excluded.balance,
      issuer = excluded.issuer, due_date = excluded.due_date, rate = excluded.rate, rate_type = excluded.rate_type,
      updated_at = excluded.updated_at
  `);
  const active = list.filter((i) => !i.status || i.status === 'ACTIVE');
  transaction(() => {
    // Resgatados, vencidos ou que sumiram da Pluggy saem daqui também.
    const ids = active.map((i) => i.id);
    db.prepare(`DELETE FROM investments WHERE item_id = ? AND id NOT IN (${ids.map(() => '?').join(',') || "''"})`).run(itemId, ...ids);
    for (const i of active) {
      upsert.run(i.id, itemId, i.name, i.type ?? null, i.subtype ?? null, i.balance ?? 0, i.issuer ?? null,
        i.dueDate ? localDate(i.dueDate) : null, i.rate ?? null, i.rateType ?? null);
    }
  });
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export async function runSync(): Promise<void> {
  if (syncState.running) return;
  if (!pluggyConfigured) {
    syncState.lastError = 'Credenciais da Pluggy não configuradas no .env';
    return;
  }
  syncState.running = true;
  syncState.lastError = null;
  const ctx = ownerContext();
  const errors: string[] = [];
  try {
    const items = db.prepare('SELECT item_id, label FROM connections').all() as { item_id: string; label: string }[];
    for (const { item_id, label } of items) {
      try {
        await syncItem(item_id, ctx);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        db.prepare('UPDATE connections SET error = ? WHERE item_id = ?').run(msg, item_id);
        errors.push(`${label}: ${msg}`);
      }
    }
    syncCardBills();
    matchBills();
    setSetting('last_sync_at', new Date().toISOString());
  } finally {
    syncState.running = false;
    syncState.lastError = errors.length ? errors.join(' | ') : null;
  }
}

/** Reaplica as regras automáticas em tudo que já está salvo (ex.: depois de mudar seu nome nas configurações). */
export function reclassifyAll(): void {
  const ctx = ownerContext();
  const rows = db.prepare(`
    SELECT t.id, t.raw, t.date, t.flow, t.bill_id, a.id AS account_id, a.type, a.close_day, a.due_day
    FROM transactions t JOIN accounts a ON a.id = t.account_id
  `).all() as { id: string; raw: string; date: string; flow: 'IN' | 'OUT'; bill_id: string | null; account_id: string; type: string; close_day: number | null; due_day: number | null }[];
  const stmt = db.prepare('UPDATE transactions SET method_auto = ?, ignored_auto = ?, ref_month = ? WHERE id = ?');
  transaction(() => {
    for (const r of rows) {
      const tx = JSON.parse(r.raw) as PluggyTransaction;
      const account = { id: r.account_id, type: r.type, close_day: r.close_day, due_day: r.due_day };
      stmt.run(detectMethod(r.type, tx), detectIgnored(r.type, r.flow, tx, ctx), refMonthFor(account, r.date, r.bill_id), r.id);
    }
  });
  matchBills();
}
