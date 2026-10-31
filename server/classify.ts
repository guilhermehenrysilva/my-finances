// Regras automáticas: meio de pagamento, o que não é gasto e mês de referência.
import type { PluggyTransaction } from './pluggy.ts';

export type Method = 'CARTAO' | 'PIX' | 'TED' | 'BOLETO' | 'DEBITO' | 'OUTRO';

export const METHOD_LABELS: Record<Method, string> = {
  CARTAO: 'Cartão',
  PIX: 'Pix',
  TED: 'TED/DOC',
  BOLETO: 'Boleto',
  DEBITO: 'Débito',
  OUTRO: 'Outros',
};

const TZ = 'America/Sao_Paulo';
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Data ISO da Pluggy (UTC) -> YYYY-MM-DD no fuso de São Paulo. */
export function localDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

// Só para os testes automáticos: fixa o "hoje" (AAAA-MM-DD) para os dados do simulador não envelhecerem.
const FIXED_TODAY = process.env.FINANCEIRO_TODAY;

export function today(): string {
  return FIXED_TODAY ?? dateFmt.format(new Date());
}

function norm(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function detectMethod(accountType: string, tx: PluggyTransaction): Method {
  if (accountType === 'CREDIT') return 'CARTAO';
  const pm = tx.paymentData?.paymentMethod?.toUpperCase();
  if (pm === 'PIX') return 'PIX';
  if (pm === 'TED' || pm === 'DOC') return 'TED';
  if (pm === 'BOLETO') return 'BOLETO';

  const d = norm(tx.description);
  if (/\bpix\b/.test(d)) return 'PIX';
  if (/\b(ted|doc)\b/.test(d)) return 'TED';
  if (/boleto|pagamento de titulo|pag(to)?\.? titulo|convenio/.test(d)) return 'BOLETO';
  if (/debito|compra no cartao|cartao/.test(d)) return 'DEBITO';
  return 'OUTRO';
}

export type IgnoreContext = { ownerNames: string[] };

/** Motivo para não contar como gasto/estorno, ou null. */
export function detectIgnored(accountType: string, flow: 'IN' | 'OUT', tx: PluggyTransaction, ctx: IgnoreContext): string | null {
  const d = norm(tx.description);

  if (/pagamento.*fatura|fatura.*(cartao|paga)|pgto.*fatura|pag fatura/.test(d)) return 'Pagamento de fatura';
  if (accountType === 'CREDIT' && flow === 'IN' && /pagamento|pgto|pagto/.test(d)) return 'Pagamento de fatura';

  if (accountType === 'BANK' && /aplicacao|resgate|\bcdb\b|\brdb\b|tesouro|caixinha|investimento|poupanca/.test(d)) {
    return 'Investimento';
  }

  const payer = tx.paymentData?.payer?.documentNumber?.value;
  const receiver = tx.paymentData?.receiver?.documentNumber?.value;
  if (payer && receiver && payer === receiver) return 'Transferência entre suas contas';
  if (accountType === 'BANK' && ctx.ownerNames.some((name) => name && d.includes(norm(name)))) {
    return 'Transferência entre suas contas';
  }
  return null;
}

function ym(year: number, month: number): string {
  const y = year + Math.floor((month - 1) / 12);
  const m = ((((month - 1) % 12) + 12) % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Mês da fatura de uma compra no cartão, a partir dos dias de fechamento e vencimento.
 * Compras no dia do fechamento ou depois caem na fatura seguinte.
 */
export function cardRefMonth(date: string, closeDay: number, dueDay: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const closeMonth = d >= closeDay ? m + 1 : m;
  const dueMonth = dueDay <= closeDay ? closeMonth + 1 : closeMonth;
  return ym(y, dueMonth);
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return ym(y, m + delta);
}
