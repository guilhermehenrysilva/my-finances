// Compras parceladas e previsão dos próximos meses.
import { db } from './db.ts';
import { addMonths, today } from './classify.ts';

const VARIABLE_LOOKBACK = 3; // meses usados na média de gastos variáveis

export type Installment = {
  key: string;
  description: string;
  accountId: string;
  accountLabel: string;
  amount: number; // valor de cada parcela
  current: number; // última parcela vista
  total: number;
  remaining: number; // parcelas que ainda vão cair depois da última vista
  remainingAmount: number;
  lastMonth: string; // mês da fatura da última parcela vista
  endMonth: string; // mês da fatura da última parcela
  manual: boolean; // conta a pagar "por X meses", fora do banco
};

export type ForecastMonth = {
  month: string;
  income: number;
  installments: number;
  fixed: number;
  variable: number;
  committed: number; // parcelas + contas fixas
  result: number; // entradas − comprometido − variáveis
};

const cents = (n: number) => Math.round(n * 100) / 100;

function norm(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Só com a palavra "parcela": um "05/10" solto na descrição pode ser uma data.
const INSTALLMENT_RE = /(?:parcela|parc\.?)\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/i;
// Para agrupar a mesma compra, tira qualquer "x/y" (com ou sem "parcela"), que muda a cada mês.
const STRIP_RE = /(?:parcela|parc\.?)?\s*\d{1,2}\s*(?:\/|de)\s*\d{1,2}\b/gi;

/** Número da parcela pela Pluggy ou, sem isso, pela descrição ("Parcela 3/10"). */
function installmentOf(row: { description: string; installment_number: number | null; total_installments: number | null }) {
  if (row.total_installments && row.total_installments > 1 && row.installment_number) {
    return { current: row.installment_number, total: row.total_installments };
  }
  const m = row.description.match(INSTALLMENT_RE);
  if (!m) return null;
  const current = Number(m[1]);
  const total = Number(m[2]);
  return total > 1 && current >= 1 && current <= total ? { current, total } : null;
}

/** Descrição sem o pedaço da parcela: é o que identifica a mesma compra mês a mês. */
function stem(description: string): string {
  return norm(description).replace(STRIP_RE, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanDescription(description: string): string {
  return description.replace(STRIP_RE, '').replace(/[\s\-–·]+$/, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Compras parceladas no cartão. Cada parcela chega como um lançamento por mês; elas são agrupadas
 * pela compra (cartão + descrição + valor da parcela + total de parcelas) e vale a mais recente.
 * Só ficam as que ainda têm parcela a partir do mês atual.
 */
export function listInstallments(): Installment[] {
  const rows = db.prepare(`
    SELECT t.id, t.description, t.amount, t.ref_month, t.installment_number, t.total_installments,
      a.id AS account_id, COALESCE(a.label, c.label) AS account_label
    FROM transactions t JOIN accounts a ON a.id = t.account_id JOIN connections c ON c.item_id = a.item_id
    WHERE a.type = 'CREDIT' AND a.hidden = 0 AND t.flow = 'OUT'
      AND COALESCE(t.ignored_user, t.ignored_auto IS NOT NULL) = 0
    ORDER BY t.ref_month, t.date
  `).all() as {
    id: string; description: string; amount: number; ref_month: string; installment_number: number | null;
    total_installments: number | null; account_id: string; account_label: string;
  }[];

  const latest = new Map<string, Installment>();
  for (const r of rows) {
    const inst = installmentOf(r);
    if (!inst) continue;
    const key = `${r.account_id}|${stem(r.description)}|${inst.total}|${Math.round(r.amount)}`;
    const prev = latest.get(key);
    if (prev && prev.current > inst.current) continue;
    const remaining = inst.total - inst.current;
    latest.set(key, {
      key,
      description: cleanDescription(r.description) || r.description,
      accountId: r.account_id,
      accountLabel: r.account_label,
      amount: cents(r.amount),
      current: inst.current,
      total: inst.total,
      remaining,
      remainingAmount: cents(remaining * r.amount),
      lastMonth: r.ref_month,
      endMonth: addMonths(r.ref_month, remaining),
      manual: false,
    });
  }

  const thisMonth = today().slice(0, 7);
  return [...latest.values(), ...manualInstallments(thisMonth)]
    .filter((i) => i.endMonth >= thisMonth)
    .sort((a, b) => a.endMonth.localeCompare(b.endMonth) || b.amount - a.amount);
}

function monthsBetween(from: string, to: string): number {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
}

/**
 * Contas a pagar "por X meses" (compras parceladas fora do banco). A "parcela vista" é a do mês atual
 * (ou a primeira, se ainda não começou), para a previsão projetar só o que falta.
 */
function manualInstallments(thisMonth: string): Installment[] {
  const rows = db.prepare(`
    SELECT id, description, amount, start_month, end_month FROM bill_templates
    WHERE active = 1 AND end_month IS NOT NULL AND end_month >= ? AND amount > 0
  `).all(thisMonth) as { id: number; description: string; amount: number; start_month: string; end_month: string }[];
  return rows.map((t) => {
    const total = monthsBetween(t.start_month, t.end_month) + 1;
    const lastMonth = t.start_month > thisMonth ? t.start_month : thisMonth;
    const current = monthsBetween(t.start_month, lastMonth) + 1;
    const remaining = total - current;
    return {
      key: `manual-${t.id}`,
      description: t.description,
      accountId: '',
      accountLabel: 'Fora do banco',
      amount: cents(t.amount),
      current,
      total,
      remaining,
      remainingAmount: cents(remaining * t.amount),
      lastMonth,
      endMonth: t.end_month,
      manual: true,
    };
  });
}

/** Quanto cada compra parcelada pesa em cada mês, do mês da última parcela vista até a última. */
function installmentsByMonth(list: Installment[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of list) {
    for (let k = 0; k <= i.remaining; k++) {
      const m = addMonths(i.lastMonth, k);
      out.set(m, (out.get(m) ?? 0) + i.amount);
    }
  }
  return out;
}

function recurringIncome(month: string): number {
  const own = db.prepare('SELECT SUM(amount) AS s, COUNT(*) AS n FROM incomes WHERE month = ?').get(month) as { s: number | null; n: number };
  if (own.n) return own.s ?? 0;
  const last = db.prepare('SELECT month FROM incomes WHERE recurring = 1 AND month < ? ORDER BY month DESC LIMIT 1').get(month) as { month: string } | undefined;
  if (!last) return 0;
  return (db.prepare('SELECT SUM(amount) AS s FROM incomes WHERE month = ? AND recurring = 1').get(last.month) as { s: number | null }).s ?? 0;
}

/**
 * Contas a pagar do mês: as já criadas (avulsas e mensais) mais as mensais que ainda vão ser criadas
 * nos meses à frente. Ficam de fora as faturas de cartão e as contas "por X meses", que entram como parcelas.
 */
function fixedBills(month: string): number {
  const row = db.prepare(`
    SELECT
      COALESCE((SELECT SUM(b.amount) FROM bills b LEFT JOIN bill_templates bt ON bt.id = b.template_id
        WHERE b.month = ? AND b.hidden = 0 AND b.card_account_id IS NULL AND bt.end_month IS NULL), 0)
      + COALESCE((SELECT SUM(t.amount) FROM bill_templates t
        WHERE t.active = 1 AND t.end_month IS NULL AND t.start_month <= ?
          AND NOT EXISTS (SELECT 1 FROM bills b WHERE b.template_id = t.id AND b.month = ?)), 0) AS s
  `).get(month, month, month) as { s: number };
  return row.s;
}

/**
 * Média dos gastos variáveis dos últimos meses completos: tudo que contou como gasto, menos as parcelas
 * e menos os pagamentos que deram baixa em contas fixas.
 */
function variableAverage(installmentMonths: Map<string, number>): number {
  const thisMonth = today().slice(0, 7);
  const months = Array.from({ length: VARIABLE_LOOKBACK }, (_, k) => addMonths(thisMonth, -(k + 1)));
  const values: number[] = [];
  for (const m of months) {
    const spend = db.prepare(`
      SELECT SUM(CASE WHEN t.flow = 'OUT' THEN t.amount WHEN a.type = 'CREDIT' THEN -t.amount ELSE 0 END) AS s, COUNT(*) AS n
      FROM transactions t JOIN accounts a ON a.id = t.account_id
      WHERE t.ref_month = ? AND a.hidden = 0 AND COALESCE(t.ignored_user, t.ignored_auto IS NOT NULL) = 0
    `).get(m) as { s: number | null; n: number };
    if (!spend.n) continue;
    // Pagamentos de contas fixas: os que deram baixa numa conta do mês ou que batem com o texto do extrato
    // de uma conta mensal (vale também para meses anteriores ao cadastro da conta).
    const fixedPaid = (db.prepare(`
      SELECT SUM(t.amount) AS s FROM transactions t JOIN accounts a ON a.id = t.account_id
      WHERE t.ref_month = ? AND t.flow = 'OUT' AND a.hidden = 0
        AND COALESCE(t.ignored_user, t.ignored_auto IS NOT NULL) = 0
        AND (
          t.id IN (SELECT transaction_id FROM bills WHERE transaction_id IS NOT NULL AND card_account_id IS NULL)
          OR EXISTS (
            SELECT 1 FROM bill_templates bt
            WHERE bt.active = 1 AND bt.match_text IS NOT NULL AND bt.match_text <> ''
              AND lower(t.description) LIKE '%' || lower(bt.match_text) || '%'
          )
        )
    `).get(m) as { s: number | null }).s ?? 0;
    values.push(Math.max(0, (spend.s ?? 0) - (installmentMonths.get(m) ?? 0) - fixedPaid));
  }
  return values.length ? cents(values.reduce((s, v) => s + v, 0) / values.length) : 0;
}

export function forecast(monthsAhead: number, includeVariable: boolean) {
  const installments = listInstallments();
  const byMonth = installmentsByMonth(installments);
  // A média usa também as parcelas já terminadas dos meses passados.
  const variableAvg = variableAverage(installmentsByMonth(allInstallmentsForHistory()));
  const thisMonth = today().slice(0, 7);

  const months: ForecastMonth[] = Array.from({ length: monthsAhead }, (_, k) => {
    const month = addMonths(thisMonth, k);
    const income = recurringIncome(month);
    const inst = byMonth.get(month) ?? 0;
    const fixed = fixedBills(month);
    const variable = includeVariable ? variableAvg : 0;
    return {
      month,
      income: cents(income),
      installments: cents(inst),
      fixed: cents(fixed),
      variable: cents(variable),
      committed: cents(inst + fixed),
      result: cents(income - inst - fixed - variable),
    };
  });

  return {
    installments,
    months,
    variableAvg,
    totals: {
      remaining: cents(installments.reduce((s, i) => s + i.remainingAmount, 0)),
      active: installments.length,
      lastEnd: installments.reduce((m, i) => (i.endMonth > m ? i.endMonth : m), ''),
    },
  };
}

/** Todas as compras parceladas, inclusive as já terminadas, para separar parcelas dos gastos variáveis. */
function allInstallmentsForHistory(): Installment[] {
  const rows = db.prepare(`
    SELECT t.description, t.amount, t.ref_month, t.installment_number, t.total_installments, a.id AS account_id
    FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE a.type = 'CREDIT' AND a.hidden = 0 AND t.flow = 'OUT'
      AND COALESCE(t.ignored_user, t.ignored_auto IS NOT NULL) = 0
  `).all() as { description: string; amount: number; ref_month: string; installment_number: number | null; total_installments: number | null; account_id: string }[];
  // Cada lançamento parcelado conta só no próprio mês (remaining = 0), sem projeção.
  return rows.flatMap((r) => {
    const inst = installmentOf(r);
    return inst ? [{ key: '', description: '', accountId: r.account_id, accountLabel: '', amount: r.amount, current: inst.current,
      total: inst.total, remaining: 0, remainingAmount: 0, lastMonth: r.ref_month, endMonth: r.ref_month, manual: false }] : [];
  });
}
