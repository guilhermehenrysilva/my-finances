import { Hono } from 'hono';
import { db, getSetting, setSetting, transaction } from './db.ts';
import { pluggyConfigured } from './pluggy.ts';
import { runSync, reclassifyAll, syncState } from './sync.ts';
import { dueDate, ensureMonthBills, matchBills } from './bills.ts';
import { BackupError, exportBackup, importBackup } from './backup.ts';
import { dismissSuggestion, findSuggestions } from './recurring.ts';
import { forecast } from './forecast.ts';
import { addMonths, METHOD_LABELS, today, type Method } from './classify.ts';

function monthsBetween(from: string, to: string): number {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
}

export const api = new Hono();

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const METHODS = Object.keys(METHOD_LABELS) as Method[];

// Valores efetivos: a escolha manual sempre vence a regra automática.
const EFFECTIVE = `
  COALESCE(t.method_user, t.method_auto) AS method,
  COALESCE(t.ignored_user, t.ignored_auto IS NOT NULL) AS ignored,
  COALESCE(a.label, c.label) AS account_label, a.type AS account_type
`;
const FROM_TX = 'FROM transactions t JOIN accounts a ON a.id = t.account_id JOIN connections c ON c.item_id = a.item_id';
// Gasto: saídas somam; no cartão, estornos (entradas não ignoradas) abatem. Entradas na conta corrente não são gasto.
const SPEND = `CASE WHEN t.flow = 'OUT' THEN t.amount WHEN a.type = 'CREDIT' THEN -t.amount ELSE 0 END`;
const COUNTED = `a.hidden = 0 AND COALESCE(t.ignored_user, t.ignored_auto IS NOT NULL) = 0`;
// Conta marcada como paga à mão sem nenhum lançamento do banco ligado a ela (ex.: paga no dinheiro, ou antes de
// conectar a Pluggy): conta como saída do mês. Quando um lançamento aparece e é ligado à conta, ela deixa de contar
// sozinha, para não somar duas vezes. Faturas de cartão nunca contam assim: as compras do cartão já contam.
const MANUAL_PAID = `paid_at IS NOT NULL AND transaction_id IS NULL AND card_account_id IS NULL AND hidden = 0 AND amount > 0`;

class BadRequest extends Error {}

/** Nomes pelos quais o app é acessado nesta máquina (com qualquer porta). */
function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost');
}

function hostnameOf(hostHeader: string): string {
  return hostHeader.startsWith('[') ? hostHeader.slice(0, hostHeader.indexOf(']') + 1) : hostHeader.split(':')[0];
}

/**
 * Proteção contra outros sites abertos no navegador:
 * - Host precisa ser um nome local (bloqueia DNS rebinding, em que um domínio externo passa a apontar para 127.0.0.1);
 * - pedidos que alteram dados precisam vir da própria origem e em JSON. Um formulário ou fetch "no-cors" de outro
 *   site não consegue mandar Content-Type application/json sem o navegador pedir permissão (CORS), e o app não dá.
 */
api.use('*', async (c, next) => {
  const host = c.req.header('host') ?? '';
  if (!isLocalHost(hostnameOf(host))) return c.json({ error: 'Host não permitido' }, 403);
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const origin = c.req.header('origin');
    if (origin) {
      let originHost = '';
      try { originHost = new URL(origin).hostname; } catch { /* origem inválida */ }
      // URL.hostname já traz o IPv6 entre colchetes ("[::1]").
      if (!isLocalHost(originHost)) return c.json({ error: 'Origem não permitida' }, 403);
    }
    const type = c.req.header('content-type') ?? '';
    const hasBody = c.req.method === 'POST' || c.req.method === 'PUT' || c.req.method === 'PATCH';
    if (hasBody && !type.toLowerCase().startsWith('application/json')) return c.json({ error: 'Envie JSON (Content-Type: application/json)' }, 415);
  }
  await next();
});

function month(value: string | undefined): string {
  const m = value ?? today().slice(0, 7);
  if (!MONTH_RE.test(m)) throw new BadRequest('Mês inválido (use AAAA-MM)');
  return m;
}

function text(value: unknown, field: string, required = true): string | null {
  if (value !== undefined && value !== null && typeof value !== 'string') throw new BadRequest(`Campo inválido: ${field}`);
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    if (required) throw new BadRequest(`Campo obrigatório: ${field}`);
    return null;
  }
  return trimmed;
}

function money(value: unknown, field: string, required = true): number | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new BadRequest(`Campo obrigatório: ${field}`);
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new BadRequest(`Valor inválido: ${field}`);
  return Math.round(n * 100) / 100;
}

const cents = (n: number) => Math.round(n * 100) / 100;

function day(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 31) throw new BadRequest(`Dia inválido: ${field}`);
  return n;
}

api.onError((err, c) => {
  if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
  // c.req.json() com corpo que não é JSON.
  if (err instanceof SyntaxError) return c.json({ error: 'Corpo da requisição não é um JSON válido' }, 400);
  console.error(err);
  return c.json({ error: 'Erro interno' }, 500);
});

// ---- Status e sincronização ----

api.get('/status', (c) =>
  c.json({
    configured: pluggyConfigured,
    syncing: syncState.running,
    lastSyncAt: getSetting('last_sync_at'),
    lastError: syncState.lastError,
    connections: (db.prepare('SELECT COUNT(*) AS n FROM connections').get() as { n: number }).n,
  }),
);

api.post('/sync', async (c) => {
  await runSync();
  return c.json({ ok: !syncState.lastError, error: syncState.lastError });
});

// ---- Dashboard ----

api.get('/dashboard', (c) => {
  const m = month(c.req.query('month'));
  ensureMonthBills(m);

  const incomes = db.prepare('SELECT id, description, amount, recurring FROM incomes WHERE month = ? ORDER BY id').all(m) as { amount: number }[];
  const incomeTotal = incomes.reduce((s, i) => s + i.amount, 0);

  const groups = db.prepare(`
    SELECT a.id AS account_id, COALESCE(a.label, c.label) AS account_label, a.type AS account_type,
      COALESCE(t.method_user, t.method_auto) AS method, ROUND(SUM(${SPEND}), 2) AS total, COUNT(*) AS count
    ${FROM_TX}
    WHERE t.ref_month = ? AND ${COUNTED}
    GROUP BY a.id, method
    HAVING total <> 0
    ORDER BY total DESC
  `).all(m) as { account_id: string; account_label: string; account_type: string; method: Method; total: number; count: number }[];

  // Cadastrado por você: contas a pagar marcadas como pagas sem lançamento do banco ligado.
  const manualItems = db.prepare(`
    SELECT b.id, b.description, b.amount, b.paid_at, bt.start_month, bt.end_month
    FROM bills b LEFT JOIN bill_templates bt ON bt.id = b.template_id
    WHERE b.id IN (SELECT id FROM bills WHERE month = ? AND ${MANUAL_PAID})
    ORDER BY b.amount DESC, b.id
  `).all(m) as { id: number; description: string; amount: number; paid_at: string; start_month: string | null; end_month: string | null }[];
  const manual = manualItems.map(({ start_month, end_month, ...b }) => ({
    ...b,
    repeat_index: start_month && end_month ? monthsBetween(start_month, m) + 1 : null,
    repeat_total: start_month && end_month ? monthsBetween(start_month, end_month) + 1 : null,
  }));

  const byMethod = new Map<Method, number>();
  for (const g of groups) byMethod.set(g.method, (byMethod.get(g.method) ?? 0) + g.total);
  const bankSpend = groups.reduce((s, g) => s + g.total, 0);
  const manualSpend = manual.reduce((s, b) => s + b.amount, 0);
  const expenseTotal = bankSpend + manualSpend;

  const accounts = db.prepare(`
    SELECT a.id, COALESCE(a.label, c.label) AS label, a.name, a.type, a.subtype, a.balance,
      a.credit_limit, a.available_limit, a.updated_at
    FROM accounts a JOIN connections c ON c.item_id = a.item_id
    WHERE a.hidden = 0 ORDER BY a.type DESC, a.balance DESC
  `).all() as { type: string; balance: number }[];

  // Saldos por banco: contas, cartões e investimentos de cada conexão.
  const connections = db.prepare('SELECT item_id, label FROM connections ORDER BY created_at').all() as { item_id: string; label: string }[];
  const accountRows = db.prepare(`
    SELECT a.id, a.item_id, COALESCE(a.label, c.label) AS label, a.name, a.type, a.subtype, a.balance,
      a.credit_limit, a.available_limit
    FROM accounts a JOIN connections c ON c.item_id = a.item_id WHERE a.hidden = 0
    ORDER BY a.type DESC, a.balance DESC
  `).all() as { id: string; item_id: string; label: string; name: string; type: string; balance: number }[];
  const investmentRows = db.prepare('SELECT id, item_id, name, type, subtype, balance, issuer, due_date FROM investments ORDER BY balance DESC')
    .all() as { item_id: string; balance: number }[];
  const banks = connections.map((cn) => {
    const accs = accountRows.filter((a) => a.item_id === cn.item_id);
    const invs = investmentRows.filter((i) => i.item_id === cn.item_id);
    return {
      itemId: cn.item_id,
      label: cn.label,
      accounts: accs,
      investments: invs,
      bankBalance: cents(accs.filter((a) => a.type === 'BANK').reduce((s, a) => s + a.balance, 0)),
      cardOpen: cents(accs.filter((a) => a.type === 'CREDIT').reduce((s, a) => s + a.balance, 0)),
      investmentsTotal: cents(invs.reduce((s, i) => s + i.balance, 0)),
    };
  }).filter((b) => b.accounts.length || b.investments.length);
  const investmentsTotal = cents(investmentRows.reduce((s, i) => s + i.balance, 0));

  const bills = db.prepare('SELECT id, description, amount, due_date, paid_at, card_account_id, estimated FROM bills WHERE month = ? AND hidden = 0 ORDER BY due_date, id').all(m) as {
    amount: number | null; due_date: string; paid_at: string | null;
  }[];
  const pending = bills.filter((b) => !b.paid_at);

  return c.json({
    month: m,
    income: { total: cents(incomeTotal), items: incomes },
    expenses: {
      total: cents(expenseTotal),
      bank: cents(bankSpend),
      manual: { total: cents(manualSpend), items: manual },
      groups,
      byMethod: [...byMethod].map(([method, total]) => ({ method, total: cents(total) })).sort((a, b) => b.total - a.total),
    },
    result: cents(incomeTotal - expenseTotal),
    // Sem banco conectado e sem gasto de banco no mês, a tela esconde a parte "Dos bancos".
    hasBanks: connections.length > 0 || groups.length > 0,
    accounts,
    bankTotal: cents(accounts.filter((a) => a.type === 'BANK').reduce((s, a) => s + a.balance, 0)),
    cardTotal: cents(accounts.filter((a) => a.type === 'CREDIT').reduce((s, a) => s + a.balance, 0)),
    banks,
    investmentsTotal,
    bills: {
      pending,
      paidCount: bills.length - pending.length,
      count: bills.length,
      pendingTotal: cents(pending.reduce((s, b) => s + (b.amount ?? 0), 0)),
      overdue: pending.filter((b) => b.due_date < today()).length,
    },
  });
});

// ---- Visão anual ----

api.get('/year', (c) => {
  const year = c.req.query('year') ?? today().slice(0, 4);
  if (!/^\d{4}$/.test(year)) throw new BadRequest('Ano inválido (use AAAA)');

  const income = db.prepare(`
    SELECT month, SUM(amount) AS total FROM incomes WHERE substr(month, 1, 4) = ? GROUP BY month
  `).all(year) as { month: string; total: number }[];
  const expenses = db.prepare(`
    SELECT t.ref_month AS month, COALESCE(t.method_user, t.method_auto) AS method, SUM(${SPEND}) AS total
    ${FROM_TX}
    WHERE substr(t.ref_month, 1, 4) = ? AND ${COUNTED}
    GROUP BY t.ref_month, method
  `).all(year) as { month: string; method: Method; total: number }[];
  const manualPaid = db.prepare(`
    SELECT month, SUM(amount) AS total FROM bills WHERE substr(month, 1, 4) = ? AND ${MANUAL_PAID} GROUP BY month
  `).all(year) as { month: string; total: number }[];

  const incomeBy = new Map(income.map((r) => [r.month, r.total]));
  const manualBy = new Map(manualPaid.map((r) => [r.month, r.total]));
  const expenseBy = new Map<string, number>(manualPaid.map((r) => [r.month, r.total]));
  const bankBy = new Map<string, number>();
  const methodsBy = new Map<string, Partial<Record<Method, number>>>();
  for (const r of expenses) {
    expenseBy.set(r.month, (expenseBy.get(r.month) ?? 0) + r.total);
    bankBy.set(r.month, (bankBy.get(r.month) ?? 0) + r.total);
    const m = methodsBy.get(r.month) ?? {};
    m[r.method] = cents((m[r.method] ?? 0) + r.total);
    methodsBy.set(r.month, m);
  }
  const thisMonth = today().slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`;
    const inc = incomeBy.get(month);
    const exp = expenseBy.get(month);
    return {
      month,
      income: cents(inc ?? 0),
      expenses: cents(exp ?? 0),
      bank: cents(bankBy.get(month) ?? 0),
      manual: cents(manualBy.get(month) ?? 0),
      byMethod: methodsBy.get(month) ?? {},
      // Mês sem nenhum dado, ou ainda por vir (ex.: fatura futura do cartão), fica fora das linhas
      // do gráfico em vez de aparecer como zero.
      hasData: month <= thisMonth && (inc !== undefined || exp !== undefined),
    };
  });
  const withData = months.filter((m) => m.hasData);
  const totalIncome = withData.reduce((s, m) => s + m.income, 0);
  const totalExpenses = withData.reduce((s, m) => s + m.expenses, 0);
  const hasConnections = (db.prepare('SELECT COUNT(*) AS n FROM connections').get() as { n: number }).n > 0;

  const years = db.prepare(`
    SELECT DISTINCT substr(month, 1, 4) AS y FROM incomes
    UNION SELECT DISTINCT substr(ref_month, 1, 4) FROM transactions
    ORDER BY y
  `).all() as { y: string }[];
  const yearList = [...new Set([...years.map((r) => r.y), today().slice(0, 4)])].sort();

  return c.json({
    year,
    years: yearList,
    hasBanks: hasConnections || expenses.length > 0,
    months,
    totals: {
      income: cents(totalIncome),
      expenses: cents(totalExpenses),
      bank: cents(withData.reduce((s, m) => s + m.bank, 0)),
      manual: cents(withData.reduce((s, m) => s + m.manual, 0)),
      result: cents(totalIncome - totalExpenses),
      avgExpenses: cents(withData.length ? totalExpenses / withData.length : 0),
    },
  });
});

// ---- Parcelas e previsão ----

api.get('/forecast', (c) => {
  const months = Number(c.req.query('months') ?? 6);
  if (![3, 6, 12].includes(months)) throw new BadRequest('Use 3, 6 ou 12 meses');
  return c.json(forecast(months, c.req.query('variable') !== 'false'));
});

// ---- Lançamentos ----

api.get('/transactions', (c) => {
  const q = c.req.query();
  const where = ['t.ref_month = ?', 'a.hidden = 0'];
  const params: (string | number)[] = [month(q.month)];
  if (q.accountId) { where.push('a.id = ?'); params.push(q.accountId); }
  if (q.method) { where.push('COALESCE(t.method_user, t.method_auto) = ?'); params.push(q.method); }
  if (q.flow === 'IN' || q.flow === 'OUT') { where.push('t.flow = ?'); params.push(q.flow); }
  if (q.ignored === 'only') where.push(`NOT (${COUNTED})`);
  if (q.ignored === 'hide') where.push(COUNTED);
  if (q.q) { where.push("(lower(t.description) LIKE '%' || lower(?) || '%' OR lower(COALESCE(t.note, '')) LIKE '%' || lower(?) || '%')"); params.push(q.q, q.q); }

  const rows = db.prepare(`
    SELECT t.id, t.date, t.ref_month, t.description, t.amount, t.flow, t.status, t.installment_number, t.total_installments,
      t.method_auto, t.method_user, t.ignored_auto, t.ignored_user, t.note, a.id AS account_id, ${EFFECTIVE}
    ${FROM_TX}
    WHERE ${where.join(' AND ')}
    ORDER BY t.date DESC, t.id
  `).all(...params);
  return c.json(rows);
});

api.patch('/transactions/:id', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if ('ignored' in body) {
    // true/false fixa a escolha; null volta para a regra automática.
    if (body.ignored !== null && typeof body.ignored !== 'boolean') throw new BadRequest('Campo inválido: ignored');
    sets.push('ignored_user = ?');
    params.push(body.ignored === null ? null : body.ignored ? 1 : 0);
  }
  if ('method' in body) {
    if (body.method !== null && !METHODS.includes(body.method as Method)) throw new BadRequest('Meio de pagamento inválido');
    sets.push('method_user = ?');
    params.push(body.method as string | null);
  }
  if ('note' in body) {
    sets.push('note = ?');
    params.push(text(body.note, 'note', false));
  }
  if (!sets.length) throw new BadRequest('Nada para alterar');
  const res = db.prepare(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ?`).run(...params, c.req.param('id'));
  if (!res.changes) return c.json({ error: 'Lançamento não encontrado' }, 404);
  return c.json({ ok: true });
});

// ---- Entradas (manual) ----

api.get('/incomes', (c) => {
  const m = month(c.req.query('month'));
  const items = db.prepare('SELECT id, description, amount, recurring FROM incomes WHERE month = ? ORDER BY id').all(m);
  const prev = db.prepare(`
    SELECT month FROM incomes WHERE recurring = 1 AND month < ? ORDER BY month DESC LIMIT 1
  `).get(m) as { month: string } | undefined;
  return c.json({ items, repeatFrom: items.length ? null : prev?.month ?? null });
});

api.post('/incomes', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const res = db.prepare('INSERT INTO incomes (month, description, amount, recurring) VALUES (?, ?, ?, ?)').run(
    month(body.month as string), text(body.description, 'description'), money(body.amount, 'amount'), body.recurring ? 1 : 0,
  );
  return c.json({ id: Number(res.lastInsertRowid) }, 201);
});

api.patch('/incomes/:id', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  db.prepare('UPDATE incomes SET description = ?, amount = ?, recurring = ? WHERE id = ?').run(
    text(body.description, 'description'), money(body.amount, 'amount'), body.recurring ? 1 : 0, Number(c.req.param('id')),
  );
  return c.json({ ok: true });
});

api.delete('/incomes/:id', (c) => {
  db.prepare('DELETE FROM incomes WHERE id = ?').run(Number(c.req.param('id')));
  return c.json({ ok: true });
});

/** Copia as entradas recorrentes do último mês que tem alguma para o mês pedido. */
api.post('/incomes/repeat', async (c) => {
  const m = month((await c.req.json<{ month?: string }>()).month);
  const prev = db.prepare('SELECT month FROM incomes WHERE recurring = 1 AND month < ? ORDER BY month DESC LIMIT 1').get(m) as { month: string } | undefined;
  if (!prev) return c.json({ copied: 0 });
  // Não copia o que o mês já tem (ex.: clicar em Repetir duas vezes).
  const res = db.prepare(`
    INSERT INTO incomes (month, description, amount, recurring)
    SELECT ?, p.description, p.amount, 1 FROM incomes p
    WHERE p.month = ? AND p.recurring = 1
      AND NOT EXISTS (SELECT 1 FROM incomes x WHERE x.month = ? AND x.description = p.description)
  `).run(m, prev.month, m);
  return c.json({ copied: res.changes });
});

// ---- Contas a pagar ----

api.get('/bills', (c) => {
  const m = month(c.req.query('month'));
  ensureMonthBills(m);
  matchBills();
  const rows = db.prepare(`
    SELECT b.id, b.template_id, b.description, b.amount, b.due_date, b.match_text, b.paid_at, b.transaction_id,
      b.card_account_id, b.estimated, t.description AS tx_description, t.amount AS tx_amount, t.date AS tx_date,
      COALESCE(ta.label, tc.label) AS tx_account, ta.type AS tx_account_type,
      bt.start_month, bt.end_month
    FROM bills b LEFT JOIN transactions t ON t.id = b.transaction_id LEFT JOIN bill_templates bt ON bt.id = b.template_id
      LEFT JOIN accounts ta ON ta.id = t.account_id LEFT JOIN connections tc ON tc.item_id = ta.item_id
    WHERE b.month = ? AND b.hidden = 0 ORDER BY b.paid_at IS NOT NULL, b.due_date, b.id
  `).all(m) as ({ start_month: string | null; end_month: string | null } & Record<string, unknown>)[];
  // Conta que repete por X meses: em qual delas este mês está ("parcela 2 de 10").
  return c.json(rows.map(({ start_month, end_month, ...r }) => ({
    ...r,
    repeat_index: start_month && end_month ? monthsBetween(start_month, m) + 1 : null,
    repeat_total: start_month && end_month ? monthsBetween(start_month, end_month) + 1 : null,
  })));
});

/** Saídas que se repetem todo mês e ainda não são contas a pagar. */
api.get('/bills/suggestions', (c) => c.json(findSuggestions()));

api.post('/bills/suggestions/dismiss', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  dismissSuggestion(text(body.key, 'key')!);
  return c.json({ ok: true });
});

/**
 * Cria uma conta avulsa no mês ou, com recurring=true, uma recorrente que começa nesse mês.
 * Com times=N (2 a 120), a recorrente para depois de N meses (ex.: compra parcelada fora do banco).
 */
api.post('/bills', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const m = month(body.month as string);
  const description = text(body.description, 'description');
  const amount = money(body.amount, 'amount', false);
  const dueDay = day(body.dueDay, 'dueDay');
  const matchText = text(body.matchText, 'matchText', false);
  let endMonth: string | null = null;
  if (body.times !== undefined && body.times !== null && body.times !== '') {
    const times = Number(body.times);
    if (!Number.isInteger(times) || times < 2 || times > 120) throw new BadRequest('Repetir por: use de 2 a 120 meses');
    endMonth = addMonths(m, times - 1);
  }
  if (body.recurring || endMonth) {
    db.prepare('INSERT INTO bill_templates (description, amount, due_day, match_text, start_month, end_month) VALUES (?, ?, ?, ?, ?, ?)')
      .run(description, amount, dueDay, matchText, m, endMonth);
    ensureMonthBills(m);
  } else {
    db.prepare('INSERT INTO bills (month, description, amount, due_date, match_text) VALUES (?, ?, ?, ?, ?)')
      .run(m, description, amount, dueDate(m, dueDay), matchText);
  }
  matchBills();
  return c.json({ ok: true }, 201);
});

api.patch('/bills/:id', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const id = Number(c.req.param('id'));
  if ('paid' in body) {
    // Desmarcar à mão desliga a baixa automática dessa conta, senão ela voltaria a ser marcada.
    db.prepare('UPDATE bills SET paid_at = ?, transaction_id = CASE WHEN ? THEN transaction_id ELSE NULL END, auto_match = ? WHERE id = ?')
      .run(body.paid ? today() : null, body.paid ? 1 : 0, body.paid ? 1 : 0, id);
  }
  if ('amount' in body) db.prepare('UPDATE bills SET amount = ? WHERE id = ?').run(money(body.amount, 'amount', false), id);
  return c.json({ ok: true });
});

/**
 * Edita descrição, valor, dia do vencimento e texto do extrato de uma conta.
 * Numa conta que se repete, applyTo='future' também muda a recorrente e as contas em aberto dos meses seguintes;
 * sem isso, só este mês muda. Faturas de cartão vêm do banco e não são editáveis.
 */
api.put('/bills/:id', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const id = Number(c.req.param('id'));
  const bill = db.prepare('SELECT template_id, month, card_account_id FROM bills WHERE id = ?').get(id) as {
    template_id: number | null; month: string; card_account_id: string | null;
  } | undefined;
  if (!bill) return c.json({ error: 'Conta não encontrada' }, 404);
  if (bill.card_account_id) throw new BadRequest('Faturas de cartão vêm do banco e não podem ser editadas');
  const description = text(body.description, 'description');
  const amount = money(body.amount, 'amount', false);
  const dueDay = day(body.dueDay, 'dueDay');
  const matchText = text(body.matchText, 'matchText', false);

  const update = db.prepare('UPDATE bills SET description = ?, amount = ?, due_date = ?, match_text = ? WHERE id = ?');
  transaction(() => {
    update.run(description, amount, dueDate(bill.month, dueDay), matchText, id);
    if (bill.template_id && body.applyTo === 'future') {
      db.prepare('UPDATE bill_templates SET description = ?, amount = ?, due_day = ?, match_text = ? WHERE id = ?')
        .run(description, amount, dueDay, matchText, bill.template_id);
      // Meses seguintes já abertos: as contas em aberto acompanham; as já pagas ficam como foram pagas.
      const later = db.prepare('SELECT id, month FROM bills WHERE template_id = ? AND month > ? AND paid_at IS NULL')
        .all(bill.template_id, bill.month) as { id: number; month: string }[];
      for (const b of later) update.run(description, amount, dueDate(b.month, dueDay), matchText, b.id);
    }
  });
  matchBills();
  return c.json({ ok: true });
});

/** Remove a conta do mês; com stopRecurring=true também encerra a recorrente a partir deste mês. */
api.delete('/bills/:id', (c) => {
  const id = Number(c.req.param('id'));
  const bill = db.prepare('SELECT template_id, month, card_account_id FROM bills WHERE id = ?').get(id) as {
    template_id: number | null; month: string; card_account_id: string | null;
  } | undefined;
  if (!bill) return c.json({ error: 'Conta não encontrada' }, 404);
  if (bill.card_account_id) {
    // Fatura de cartão: apagar faria a próxima sincronização recriá-la; ocultar mantém a escolha.
    db.prepare('UPDATE bills SET hidden = 1 WHERE id = ?').run(id);
    return c.json({ ok: true });
  }
  if (bill.template_id && c.req.query('stopRecurring') === 'true') {
    db.prepare('UPDATE bill_templates SET active = 0 WHERE id = ?').run(bill.template_id);
    db.prepare('DELETE FROM bills WHERE template_id = ? AND month >= ? AND paid_at IS NULL').run(bill.template_id, bill.month);
    db.prepare('DELETE FROM bills WHERE id = ?').run(id);
  } else if (bill.template_id) {
    // Conta mensal removida só deste mês: apagar faria a recorrente recriá-la ao abrir o mês de novo.
    db.prepare('UPDATE bills SET hidden = 1 WHERE id = ?').run(id);
  } else {
    db.prepare('DELETE FROM bills WHERE id = ?').run(id);
  }
  return c.json({ ok: true });
});

// ---- Configurações ----

api.get('/settings', (c) => {
  const connections = db.prepare('SELECT item_id, label, connector_name, status, last_updated_at, error FROM connections ORDER BY created_at').all();
  const accounts = db.prepare(`
    SELECT a.id, a.item_id, a.name, a.label, a.type, a.subtype, a.number, a.close_day, a.due_day, a.hidden
    FROM accounts a ORDER BY a.item_id, a.type DESC
  `).all();
  return c.json({ connections, accounts, ownerNames: getSetting('owner_names') ?? '', configured: pluggyConfigured });
});

api.put('/settings', async (c) => {
  const body = await c.req.json<{ ownerNames?: string }>();
  setSetting('owner_names', text(body.ownerNames ?? '', 'ownerNames', false) ?? '');
  reclassifyAll();
  return c.json({ ok: true });
});

// ---- Backup ----

api.get('/backup', (c) => {
  const backup = exportBackup();
  c.header('Content-Disposition', `attachment; filename="financeiro-backup-${today()}.json"`);
  return c.json(backup);
});

api.post('/backup', async (c) => {
  if (syncState.running) return c.json({ error: 'Aguarde a sincronização terminar antes de importar.' }, 409);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new BadRequest('O arquivo não é um JSON válido.');
  }
  try {
    return c.json({ ok: true, imported: importBackup(body) });
  } catch (err) {
    if (err instanceof BackupError) throw new BadRequest(err.message);
    throw err;
  }
});

api.post('/connections', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const itemId = text(body.itemId, 'itemId')!;
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) throw new BadRequest('O itemId da Pluggy é um UUID (ex.: 0f1e2d3c-...)');
  const count = (db.prepare('SELECT COUNT(*) AS n FROM connections WHERE item_id <> ?').get(itemId) as { n: number }).n;
  if (count >= 5) throw new BadRequest('O Meu Pluggy gratuito permite até 5 conexões');
  db.prepare('INSERT INTO connections (item_id, label) VALUES (?, ?) ON CONFLICT(item_id) DO UPDATE SET label = excluded.label')
    .run(itemId, text(body.label, 'label'));
  return c.json({ ok: true }, 201);
});

api.delete('/connections/:itemId', (c) => {
  const itemId = c.req.param('itemId');
  transaction(() => {
    // As faturas dos cartões desse banco não têm chave estrangeira: saem junto, senão ficariam órfãs.
    db.prepare('DELETE FROM bills WHERE card_account_id IN (SELECT id FROM accounts WHERE item_id = ?)').run(itemId);
    db.prepare('DELETE FROM connections WHERE item_id = ?').run(itemId);
  });
  return c.json({ ok: true });
});

api.patch('/accounts/:id', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const id = c.req.param('id');
  if ('label' in body) db.prepare('UPDATE accounts SET label = ? WHERE id = ?').run(text(body.label, 'label', false), id);
  if ('hidden' in body) db.prepare('UPDATE accounts SET hidden = ? WHERE id = ?').run(body.hidden ? 1 : 0, id);
  if ('closeDay' in body || 'dueDay' in body) {
    db.prepare('UPDATE accounts SET close_day = ?, due_day = ? WHERE id = ?').run(day(body.closeDay, 'closeDay'), day(body.dueDay, 'dueDay'), id);
    reclassifyAll();
  }
  return c.json({ ok: true });
});
