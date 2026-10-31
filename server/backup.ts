// Backup completo dos dados em JSON. As credenciais da Pluggy ficam no .env e não entram aqui.
import { db, transaction } from './db.ts';

export const BACKUP_FORMAT = 'financeiro-backup';
export const BACKUP_VERSION = 1;

// Ordem de inserção: quem é referenciado vem antes. A remoção usa a ordem inversa.
const TABLES = ['settings', 'recurring_dismissed', 'connections', 'accounts', 'card_bills', 'transactions', 'incomes', 'bill_templates', 'bills'] as const;
type Table = (typeof TABLES)[number];

type Row = Record<string, unknown>;
export type Backup = { format: string; version: number; exportedAt: string; tables: Record<Table, Row[]> };

export class BackupError extends Error {}

function columns(table: Table): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

export function exportBackup(): Backup {
  const tables = {} as Record<Table, Row[]>;
  for (const t of TABLES) tables[t] = db.prepare(`SELECT * FROM ${t}`).all() as Row[];
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables };
}

export type ImportSummary = Record<Table, number>;

/** Substitui todos os dados pelos do backup. Tudo ou nada: qualquer erro desfaz a importação. */
export function importBackup(input: unknown): ImportSummary {
  if (!input || typeof input !== 'object') throw new BackupError('Arquivo inválido: não é um JSON de objeto.');
  const backup = input as Partial<Backup>;
  if (backup.format !== BACKUP_FORMAT) throw new BackupError('Este arquivo não é um backup do Financeiro.');
  if (typeof backup.version !== 'number' || backup.version > BACKUP_VERSION) {
    throw new BackupError('Backup de uma versão mais nova do app. Atualize o app antes de importar.');
  }
  if (!backup.tables || typeof backup.tables !== 'object') throw new BackupError('Backup sem dados.');
  for (const t of TABLES) {
    const rows = (backup.tables as Partial<Record<Table, unknown>>)[t] ?? [];
    if (!Array.isArray(rows) || rows.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) {
      throw new BackupError(`Tabela "${t}" inválida no backup.`);
    }
  }

  const summary = {} as ImportSummary;
  transaction(() => {
    for (const t of [...TABLES].reverse()) db.prepare(`DELETE FROM ${t}`).run();
    for (const t of TABLES) {
      const known = new Set(columns(t));
      const rows = ((backup.tables as Partial<Record<Table, Row[]>>)[t] ?? []);
      for (const row of rows) {
        // Só colunas que existem hoje: um backup antigo sem alguma coluna usa o padrão dela.
        const cols = Object.keys(row).filter((k) => known.has(k));
        if (!cols.length) continue;
        const values = cols.map((k) => {
          const v = row[k];
          if (v === null || typeof v === 'string' || typeof v === 'number') return v;
          if (typeof v === 'boolean') return v ? 1 : 0;
          throw new BackupError(`Valor inválido em "${t}.${k}".`);
        });
        db.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...values);
      }
      summary[t] = rows.length;
    }
  });
  return summary;
}
