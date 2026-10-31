// Sugestões de contas a pagar: saídas da conta corrente que se repetem todo mês.
// Mesmo critério do "Recurring Payments" da Pluggy, feito localmente e com um pouco mais de folga no valor.
import { db } from './db.ts';
import { addMonths, today } from './classify.ts';

const LOOKBACK_MONTHS = 6;
const MIN_MONTHS = 3;
const MAX_AMOUNT_SPREAD = 0.2; // (maior − menor) / mediana
const MAX_DAY_SPREAD = 5; // dias em torno do dia típico
const STILL_ACTIVE_DAYS = 45; // a última ocorrência precisa ser recente

export type Suggestion = {
  key: string;
  description: string;
  amount: number;
  dueDay: number;
  matchText: string;
  months: string[];
};

function norm(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const LEADING = /^(pix enviado|pagamento de boleto efetuado|pagamento de boleto|pagamento de titulo|pagto|debito automatico|compra no debito|transferencia enviada( pelo pix)?)\b[\s:-]*/;

/** "Pagamento de boleto efetuado - VIVO FIBRA" -> "VIVO FIBRA": o que identifica quem recebeu. */
function payee(description: string): string {
  const parts = description.split(' - ');
  const tail = parts.length > 1 ? parts[parts.length - 1] : description;
  const cleaned = norm(tail).replace(LEADING, '');
  // Mesmo tamanho do texto original: dá para recortar a versão com acentos.
  return tail.slice(tail.length - cleaned.length).trim();
}

/** Chave de agrupamento: sem acentos, números e pontuação ("Parcela 3/10", datas, códigos). */
function keyOf(text: string): string {
  return norm(text).replace(/[0-9]/g, ' ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function findSuggestions(): Suggestion[] {
  const since = `${addMonths(today().slice(0, 7), -LOOKBACK_MONTHS)}-01`;
  const rows = db.prepare(`
    SELECT t.date, t.description, t.amount FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE a.type = 'BANK' AND a.hidden = 0 AND t.flow = 'OUT' AND t.date >= ?
      AND COALESCE(t.ignored_user, t.ignored_auto IS NOT NULL) = 0
    ORDER BY t.date
  `).all(since) as { date: string; description: string; amount: number }[];

  const groups = new Map<string, { date: string; description: string; amount: number }[]>();
  for (const r of rows) {
    const key = keyOf(payee(r.description));
    if (key.length < 3) continue;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const dismissed = new Set((db.prepare('SELECT key FROM recurring_dismissed').all() as { key: string }[]).map((r) => r.key));
  const covered = (db.prepare(`
    SELECT lower(match_text) AS t FROM bill_templates WHERE active = 1 AND match_text IS NOT NULL AND match_text <> ''
  `).all() as { t: string }[]).map((r) => keyOf(r.t)).filter(Boolean);

  const out: Suggestion[] = [];
  for (const [key, txs] of groups) {
    if (dismissed.has(key) || covered.some((c) => key.includes(c) || c.includes(key))) continue;

    // Uma ocorrência por mês (a maior, se houver mais de uma no mesmo mês).
    const byMonth = new Map<string, (typeof txs)[number]>();
    for (const t of txs) {
      const m = t.date.slice(0, 7);
      if (!byMonth.has(m) || byMonth.get(m)!.amount < t.amount) byMonth.set(m, t);
    }
    const monthly = [...byMonth.values()];
    if (monthly.length < MIN_MONTHS) continue;
    const last = monthly[monthly.length - 1];
    if (daysBetween(last.date, today()) > STILL_ACTIVE_DAYS) continue;

    const amounts = monthly.map((t) => t.amount);
    const amount = median(amounts);
    if ((Math.max(...amounts) - Math.min(...amounts)) / amount > MAX_AMOUNT_SPREAD) continue;

    const days = monthly.map((t) => Number(t.date.slice(8, 10)));
    const dueDay = Math.round(median(days));
    if (days.some((d) => Math.abs(d - dueDay) > MAX_DAY_SPREAD)) continue;

    const name = payee(last.description);
    out.push({
      key,
      description: titleCase(name),
      amount: Math.round(amount * 100) / 100,
      dueDay,
      matchText: name.toLowerCase(),
      months: [...byMonth.keys()],
    });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

export function dismissSuggestion(key: string): void {
  db.prepare('INSERT OR IGNORE INTO recurring_dismissed (key) VALUES (?)').run(key);
}
