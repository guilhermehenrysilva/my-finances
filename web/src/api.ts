export type Method = 'CARTAO' | 'PIX' | 'TED' | 'BOLETO' | 'DEBITO' | 'OUTRO';

export const METHOD_LABELS: Record<Method, string> = {
  CARTAO: 'Cartão',
  PIX: 'Pix',
  TED: 'TED/DOC',
  BOLETO: 'Boleto',
  DEBITO: 'Débito',
  OUTRO: 'Outros',
};

export type Status = { configured: boolean; syncing: boolean; lastSyncAt: string | null; lastError: string | null; connections: number };

export type Account = {
  id: string; label: string; name: string; type: 'BANK' | 'CREDIT'; subtype: string | null; balance: number;
  credit_limit: number | null; available_limit: number | null; updated_at: string | null;
};

export type Investment = {
  id: string; name: string; type: string | null; subtype: string | null; balance: number; issuer: string | null; due_date: string | null;
};

export type Bank = {
  itemId: string; label: string; accounts: Account[]; investments: Investment[];
  bankBalance: number; cardOpen: number; investmentsTotal: number;
};

export const INVESTMENT_LABELS: Record<string, string> = {
  FIXED_INCOME: 'Renda fixa',
  MUTUAL_FUND: 'Fundo',
  SECURITY: 'Previdência',
  EQUITY: 'Ações',
  ETF: 'ETF',
  COE: 'COE',
  OTHER: 'Outro',
};

export type Bill = {
  id: number; template_id: number | null; description: string; amount: number | null; due_date: string;
  match_text: string | null; paid_at: string | null; transaction_id: string | null; tx_description: string | null; tx_amount: number | null;
  card_account_id: string | null; estimated: number;
  /** Lançamento do banco ligado à conta (quando o pagamento foi identificado no extrato). */
  tx_date: string | null; tx_account: string | null; tx_account_type: 'BANK' | 'CREDIT' | null;
  /** Conta que repete por X meses: posição deste mês e total (ex.: 2 de 10). */
  repeat_index: number | null; repeat_total: number | null;
};

export type Suggestion = { key: string; description: string; amount: number; dueDay: number; matchText: string; months: string[] };

export type Income = { id: number; description: string; amount: number; recurring: number };

/** Conta a pagar marcada como paga sem lançamento do banco ligado: saída cadastrada por você. */
export type ManualPaid = { id: number; description: string; amount: number; paid_at: string; repeat_index: number | null; repeat_total: number | null };

export type Dashboard = {
  month: string;
  income: { total: number; items: Income[] };
  expenses: {
    /** Dos bancos + cadastrado por você. */
    total: number;
    bank: number;
    manual: { total: number; items: ManualPaid[] };
    /** Só os gastos dos bancos, por conta e meio. */
    groups: { account_id: string; account_label: string; account_type: string; method: Method; total: number; count: number }[];
    byMethod: { method: Method; total: number }[];
  };
  result: number;
  hasBanks: boolean;
  accounts: Account[];
  bankTotal: number;
  cardTotal: number;
  banks: Bank[];
  investmentsTotal: number;
  bills: { pending: Bill[]; paidCount: number; count: number; pendingTotal: number; overdue: number };
};

export type YearSummary = {
  year: string;
  years: string[];
  hasBanks: boolean;
  /** byMethod: só os gastos dos bancos; manual: contas pagas cadastradas por você. */
  months: { month: string; income: number; expenses: number; bank: number; manual: number; byMethod: Partial<Record<Method, number>>; hasData: boolean }[];
  totals: { income: number; expenses: number; bank: number; manual: number; result: number; avgExpenses: number };
};

export type Transaction = {
  id: string; date: string; ref_month: string; description: string; amount: number; flow: 'IN' | 'OUT'; status: string;
  installment_number: number | null; total_installments: number | null; method_auto: Method; method_user: Method | null;
  ignored_auto: string | null; ignored_user: number | null; note: string | null; account_id: string;
  method: Method; ignored: number; account_label: string; account_type: 'BANK' | 'CREDIT';
};

export type Settings = {
  configured: boolean;
  ownerNames: string;
  connections: { item_id: string; label: string; connector_name: string | null; status: string | null; last_updated_at: string | null; error: string | null }[];
  accounts: { id: string; item_id: string; name: string; label: string | null; type: string; subtype: string | null; number: string | null; close_day: number | null; due_day: number | null; hidden: number }[];
};

export type Installment = {
  key: string; description: string; accountId: string; accountLabel: string; amount: number;
  current: number; total: number; remaining: number; remainingAmount: number; lastMonth: string; endMonth: string;
  /** Conta a pagar "por X meses", fora do banco. */
  manual: boolean;
};

export type ForecastMonth = {
  month: string; income: number; installments: number; cardInstallments: number; manualInstallments: number; fixed: number; variable: number; committed: number; result: number;
};

export type Forecast = {
  installments: Installment[];
  months: ForecastMonth[];
  variableAvg: number;
  totals: { remaining: number; active: number; lastEnd: string };
};

export type ImportResult ={ ok: true; imported: Record<string, number> };

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Erro ${res.status}`);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T = unknown>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T = unknown>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T = unknown>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T = unknown>(path: string) => request<T>('DELETE', path),
};
