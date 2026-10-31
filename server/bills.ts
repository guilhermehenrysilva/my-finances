// Contas a pagar: geração das recorrentes, faturas do cartão e baixa automática por transação.
import { db } from './db.ts';
import { addMonths, today } from './classify.ts';

function dueDate(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** Cria, para o mês, as contas das recorrentes ativas que ainda não existem. */
export function ensureMonthBills(month: string): void {
  const templates = db.prepare(`
    SELECT id, description, amount, due_day, match_text FROM bill_templates
    WHERE active = 1 AND start_month <= ? AND (end_month IS NULL OR end_month >= ?)
  `).all(month, month) as {
    id: number; description: string; amount: number | null; due_day: number; match_text: string | null;
  }[];
  const stmt = db.prepare('INSERT OR IGNORE INTO bills (template_id, month, description, amount, due_date, match_text) VALUES (?, ?, ?, ?, ?, ?)');
  for (const t of templates) stmt.run(t.id, month, t.description, t.amount, dueDate(month, t.due_day), t.match_text);
}

type CardFatura = { cardBillId: string | null; dueDate: string; amount: number | null; estimated: boolean };

/**
 * Uma conta a pagar por fatura de cartão, a partir das faturas da Pluggy (/bills).
 * Sem faturas futuras da Pluggy, usa a fatura aberta (saldo e vencimento do cartão) como valor estimado.
 * Só considera vencimentos a partir do mês anterior, para não encher meses antigos.
 */
export function syncCardBills(): void {
  const since = `${addMonths(today().slice(0, 7), -1)}-01`;
  const cards = db.prepare(`
    SELECT a.id, COALESCE(a.label, c.label) AS label, a.balance, a.bill_due_date
    FROM accounts a JOIN connections c ON c.item_id = a.item_id
    WHERE a.type = 'CREDIT' AND a.hidden = 0
  `).all() as { id: string; label: string; balance: number; bill_due_date: string | null }[];

  const existing = db.prepare('SELECT id, paid_at, hidden FROM bills WHERE card_account_id = ? AND month = ?');
  const insert = db.prepare(`
    INSERT INTO bills (month, description, amount, due_date, card_account_id, card_bill_id, estimated)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const update = db.prepare('UPDATE bills SET description = ?, amount = ?, due_date = ?, card_bill_id = ?, estimated = ? WHERE id = ?');

  for (const card of cards) {
    const faturas: CardFatura[] = (db.prepare('SELECT id, due_date, total_amount FROM card_bills WHERE account_id = ? AND due_date >= ? ORDER BY due_date')
      .all(card.id, since) as { id: string; due_date: string; total_amount: number | null }[])
      .map((b) => ({ cardBillId: b.id, dueDate: b.due_date, amount: b.total_amount, estimated: false }));

    const openDue = card.bill_due_date;
    if (openDue && openDue >= today() && !faturas.some((f) => f.dueDate.slice(0, 7) === openDue.slice(0, 7)) && card.balance > 0) {
      faturas.push({ cardBillId: null, dueDate: openDue, amount: card.balance, estimated: true });
    }

    for (const f of faturas) {
      const month = f.dueDate.slice(0, 7);
      const description = `Fatura ${card.label}`;
      const row = existing.get(card.id, month) as { id: number; paid_at: string | null; hidden: number } | undefined;
      if (!row) insert.run(month, description, f.amount, f.dueDate, card.id, f.cardBillId, f.estimated ? 1 : 0);
      // Fatura já paga ou ocultada pelo usuário fica como está.
      else if (!row.paid_at && !row.hidden) update.run(description, f.amount, f.dueDate, f.cardBillId, f.estimated ? 1 : 0, row.id);
    }
  }
}

/**
 * Marca como paga a conta em aberto quando o pagamento aparece:
 * - fatura de cartão: o "pagamento recebido" no próprio cartão perto do vencimento, ou um pagamento de fatura
 *   na conta corrente com o mesmo valor;
 * - demais contas: o texto de busca aparece na descrição de uma saída do mesmo mês.
 * Uma transação baixa no máximo uma conta.
 */
export function matchBills(): void {
  const open = db.prepare(`
    SELECT id, month, match_text, card_account_id, amount, due_date FROM bills
    WHERE paid_at IS NULL AND auto_match = 1 AND hidden = 0
      AND (card_account_id IS NOT NULL OR (match_text IS NOT NULL AND match_text <> ''))
  `).all() as { id: number; month: string; match_text: string | null; card_account_id: string | null; amount: number | null; due_date: string }[];

  const notLinked = 't.id NOT IN (SELECT transaction_id FROM bills WHERE transaction_id IS NOT NULL)';
  const findByText = db.prepare(`
    SELECT t.id, t.date FROM transactions t
    WHERE t.flow = 'OUT' AND substr(t.date, 1, 7) = ?
      AND lower(t.description) LIKE '%' || lower(?) || '%'
      AND ${notLinked}
    ORDER BY t.date LIMIT 1
  `);
  const findCardPayment = db.prepare(`
    SELECT t.id, t.date FROM transactions t
    WHERE t.account_id = ? AND t.flow = 'IN' AND t.ignored_auto = 'Pagamento de fatura'
      AND t.date BETWEEN date(?, '-25 days') AND date(?, '+10 days')
      AND ${notLinked}
    ORDER BY t.date LIMIT 1
  `);
  const findBankPayment = db.prepare(`
    SELECT t.id, t.date FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE a.type = 'BANK' AND t.flow = 'OUT' AND t.ignored_auto = 'Pagamento de fatura'
      AND t.date BETWEEN date(?, '-25 days') AND date(?, '+10 days')
      AND abs(t.amount - ?) <= max(1, ? * 0.02)
      AND ${notLinked}
    ORDER BY t.date LIMIT 1
  `);
  const mark = db.prepare('UPDATE bills SET paid_at = ?, transaction_id = ? WHERE id = ?');

  for (const b of open) {
    let tx: { id: string; date: string } | undefined;
    if (b.card_account_id) {
      tx = findCardPayment.get(b.card_account_id, b.due_date, b.due_date) as typeof tx;
      if (!tx && b.amount) tx = findBankPayment.get(b.due_date, b.due_date, b.amount, b.amount) as typeof tx;
    } else {
      tx = findByText.get(b.month, b.match_text) as typeof tx;
    }
    if (tx) mark.run(tx.date, tx.id, b.id);
  }

  // Contas já marcadas como pagas à mão: se o pagamento aparece depois no extrato, liga o lançamento a ela.
  // Assim a conta deixa de contar sozinha como saída e o lançamento conta uma vez só.
  const paidByHand = db.prepare(`
    SELECT id, month, match_text FROM bills
    WHERE paid_at IS NOT NULL AND transaction_id IS NULL AND card_account_id IS NULL AND hidden = 0
      AND match_text IS NOT NULL AND match_text <> ''
  `).all() as { id: number; month: string; match_text: string }[];
  const link = db.prepare('UPDATE bills SET transaction_id = ? WHERE id = ?');
  for (const b of paidByHand) {
    const tx = findByText.get(b.month, b.match_text) as { id: string } | undefined;
    if (tx) link.run(tx.id, b.id);
  }
}
