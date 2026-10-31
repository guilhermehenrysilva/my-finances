const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const money = (n: number) => brl.format(n);

/** Aceita "20.000,00", "20.000", "79,90" ou "79.90". */
export function parseMoney(value: string): number {
  const v = value.trim().replace(/^R\$\s*/, '');
  if (v.includes(',')) return Number(v.replace(/\./g, '').replace(',', '.'));
  // Só pontos de milhar ("20.000", "1.250.000"): no Brasil o ponto separa milhares.
  if (/^\d{1,3}(\.\d{3})+$/.test(v)) return Number(v.replace(/\./g, ''));
  return Number(v);
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}

export function monthName(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1];
}

/** "2026-10" -> "Out 2026" */
export function shortMonthLabel(month: string): string {
  const name = monthName(month);
  return `${name[0].toUpperCase()}${name.slice(1, 3)} ${month.slice(0, 4)}`;
}

/** Valor curto para eixos: 9500 -> "9,5 mil" */
export function compactMoney(n: number): string {
  if (n === 0) return '0';
  if (Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** YYYY-MM-DD -> DD/MM */
export const shortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

export function relativeTime(iso: string | null): string {
  if (!iso) return 'nunca';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `há ${hours} h`;
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
