// Cliente mínimo da API da Pluggy (somente leitura).
// Documentação: https://docs.pluggy.ai

const API_URL = (process.env.PLUGGY_API_URL ?? 'https://api.pluggy.ai').replace(/\/$/, '');
const CLIENT_ID = process.env.PLUGGY_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.PLUGGY_CLIENT_SECRET ?? '';

export const pluggyConfigured = Boolean(CLIENT_ID && CLIENT_SECRET);

export type PluggyItem = {
  id: string;
  status: string;
  lastUpdatedAt: string | null;
  connector?: { name: string };
  error?: { message?: string } | null;
};

export type PluggyAccount = {
  id: string;
  type: 'BANK' | 'CREDIT';
  subtype: string;
  name: string;
  marketingName?: string | null;
  number?: string | null;
  balance: number;
  creditData?: {
    creditLimit?: number | null;
    availableCreditLimit?: number | null;
    balanceCloseDate?: string | null;
    balanceDueDate?: string | null;
  } | null;
};

export type PluggyTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  status: 'PENDING' | 'POSTED';
  paymentData?: {
    paymentMethod?: string | null;
    payer?: { documentNumber?: { value?: string } | null } | null;
    receiver?: { documentNumber?: { value?: string } | null } | null;
  } | null;
  creditCardMetadata?: {
    installmentNumber?: number | null;
    totalInstallments?: number | null;
    billId?: string | null;
  } | null;
};

export type PluggyBill = {
  id: string;
  dueDate: string;
  totalAmount: number | null;
};

type Page<T> = { results: T[]; page?: number; totalPages?: number };

let apiKey: { value: string; expiresAt: number } | null = null;

async function getApiKey(): Promise<string> {
  if (apiKey && apiKey.expiresAt > Date.now()) return apiKey.value;
  const res = await fetch(`${API_URL}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }),
  });
  if (!res.ok) throw new Error(`Pluggy /auth falhou (${res.status}). Confira PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.`);
  const body = (await res.json()) as { apiKey: string };
  // A chave vale 2h; renovamos com folga.
  apiKey = { value: body.apiKey, expiresAt: Date.now() + 100 * 60 * 1000 };
  return apiKey.value;
}

async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(API_URL + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { 'X-API-KEY': await getApiKey() } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new PluggyError(res.status, `Pluggy GET ${path} falhou (${res.status}) ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export class PluggyError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function getAllPages<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page++) {
    const body = await get<Page<T>>(path, { ...params, page, pageSize: 500 });
    all.push(...body.results);
    if (!body.totalPages || page >= body.totalPages) return all;
  }
}

export const pluggy = {
  getItem: (itemId: string) => get<PluggyItem>(`/items/${itemId}`),
  getAccounts: async (itemId: string) => (await get<Page<PluggyAccount>>('/accounts', { itemId })).results,
  getTransactions: (accountId: string, from: string) => getAllPages<PluggyTransaction>('/transactions', { accountId, from }),
  getBills: async (accountId: string) => (await get<Page<PluggyBill>>('/bills', { accountId })).results,
};
