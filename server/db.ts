import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DB_PATH ?? 'data/financeiro.db';
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// Campos *_auto são recalculados a cada sincronização; *_user guardam a escolha
// do usuário e sempre vencem (NULL = sem escolha manual).
db.exec(`
CREATE TABLE IF NOT EXISTS connections (
  item_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  connector_name TEXT,
  status TEXT,
  last_updated_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES connections(item_id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  subtype TEXT,
  name TEXT NOT NULL,
  label TEXT,
  number TEXT,
  balance REAL NOT NULL DEFAULT 0,
  credit_limit REAL,
  available_limit REAL,
  close_day INTEGER,
  due_day INTEGER,
  hidden INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS card_bills (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  due_date TEXT NOT NULL,
  total_amount REAL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  ref_month TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  flow TEXT NOT NULL CHECK (flow IN ('IN', 'OUT')),
  status TEXT NOT NULL,
  installment_number INTEGER,
  total_installments INTEGER,
  bill_id TEXT,
  method_auto TEXT NOT NULL,
  method_user TEXT,
  ignored_auto TEXT,
  ignored_user INTEGER,
  note TEXT,
  raw TEXT
);
CREATE INDEX IF NOT EXISTS idx_tx_ref_month ON transactions(ref_month);
CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions(account_id, date);

CREATE TABLE IF NOT EXISTS incomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  recurring INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_incomes_month ON incomes(month);

CREATE TABLE IF NOT EXISTS bill_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  amount REAL,
  due_day INTEGER NOT NULL,
  match_text TEXT,
  start_month TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER REFERENCES bill_templates(id) ON DELETE SET NULL,
  month TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL,
  due_date TEXT NOT NULL,
  match_text TEXT,
  auto_match INTEGER NOT NULL DEFAULT 1,
  paid_at TEXT,
  transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
  UNIQUE (template_id, month)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS recurring_dismissed (
  key TEXT PRIMARY KEY,
  dismissed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Colunas adicionadas depois da primeira versão: bancos já existentes ganham elas aqui.
function addColumn(table: string, column: string, definition: string): void {
  const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// Último mês de uma conta que repete por X meses (NULL = repete sem fim).
addColumn('bill_templates', 'end_month', 'TEXT');
// Data de vencimento da fatura aberta do cartão, como a Pluggy informa.
addColumn('accounts', 'bill_due_date', 'TEXT');
// Contas a pagar criadas a partir das faturas do cartão.
addColumn('bills', 'card_account_id', 'TEXT');
addColumn('bills', 'card_bill_id', 'TEXT');
// 1 = valor da fatura ainda aberta (muda até o fechamento).
addColumn('bills', 'estimated', 'INTEGER NOT NULL DEFAULT 0');
// Fatura removida pelo usuário: fica oculta em vez de ser recriada na próxima sincronização.
addColumn('bills', 'hidden', 'INTEGER NOT NULL DEFAULT 0');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_bills_card_month ON bills(card_account_id, month) WHERE card_account_id IS NOT NULL');

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string | null } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string | null): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
