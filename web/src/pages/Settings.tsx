import { useEffect, useState, type FormEvent } from 'react';
import { api, type ImportResult, type Settings } from '../api.ts';
import { relativeTime } from '../format.ts';
import { BankAvatar, Icon, PluggyBadge } from '../icons.tsx';
import { ThemePicker } from '../theme.tsx';
import type { PageProps } from '../App.tsx';

export function SettingsPage({ version, refresh, pluggy }: PageProps) {
  const [data, setData] = useState<Settings | null>(null);
  const [conn, setConn] = useState({ itemId: '', label: '' });
  const [owner, setOwner] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<Settings>('/settings').then((d) => {
      setData(d);
      setOwner(d.ownerNames);
    }, (e: Error) => setError(e.message));
  }, [version]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function addConnection(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      await api.post('/connections', conn);
      setConn({ itemId: '', label: '' });
      await api.post('/sync');
    });
  }

  function saveOwner(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      await api.put('/settings', { ownerNames: owner });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  if (!data) return error ? <p className="error-text">{error}</p> : <p className="muted">Carregando…</p>;

  return (
    <div className="stack">
      {error && <p className="error-text">{error}</p>}

      {!data.configured && (
        <section className="callout callout-warn">
          <div>
            <strong>Pluggy não configurada.</strong> Preencha <code>PLUGGY_CLIENT_ID</code> e <code>PLUGGY_CLIENT_SECRET</code> no
            arquivo <code>.env</code> e reinicie o container (<code>docker compose up -d</code>).
          </div>
        </section>
      )}

      <section className="card" aria-labelledby="aparencia-config">
        <div className="card-head">
          <div>
            <h2 id="aparencia-config">Aparência</h2>
            <span className="sub">Vale só para este navegador</span>
          </div>
          <div style={{ flex: '0 1 360px' }}><ThemePicker /></div>
        </div>
      </section>

      <section className="card">
        <span className="title-row"><h2>Bancos conectados</h2><PluggyBadge {...pluggy} /></span>
        <p className="muted">
          Para cada banco: conecte em meu.pluggy.ai, autorize o conector MeuPluggy na sua aplicação em dashboard.pluggy.ai e
          cole aqui o <em>itemId</em> gerado. O plano gratuito permite até 5.
        </p>
        {data.connections.length > 0 && (
          <ul className="list">
            {data.connections.map((c) => (
              <li key={c.item_id}>
                <BankAvatar label={c.label} />
                <span className="grow">
                  <b>{c.label} <span className="muted mono" style={{ fontWeight: 400 }}>{c.item_id}</span></b>
                  <small>{c.status ?? 'ainda não sincronizado'} · dados da Pluggy {relativeTime(c.last_updated_at)}</small>
                  {c.error && <small className="error-text">{c.error}</small>}
                </span>
                <button
                  className="icon-btn"
                  aria-label={`Remover ${c.label}`}
                  onClick={() => confirm(`Remover ${c.label} e todos os lançamentos dele?`) && run(() => api.del(`/connections/${c.item_id}`))}
                ><Icon name="close" size={18} /></button>
              </li>
            ))}
          </ul>
        )}
        {data.connections.length < 5 && (
          <form className="form-grid" onSubmit={addConnection}>
            <label>Nome do banco<input required value={conn.label} onChange={(e) => setConn({ ...conn, label: e.target.value })} placeholder="Nubank" /></label>
            <label>itemId<input required className="mono" value={conn.itemId} onChange={(e) => setConn({ ...conn, itemId: e.target.value.trim() })} placeholder="0f1e2d3c-4b5a-..." /></label>
            <button className="btn" type="submit">Conectar e sincronizar</button>
          </form>
        )}
      </section>

      {data.accounts.length > 0 && (
        <section className="card">
          <h2>Contas e cartões</h2>
          <p className="muted">Nos cartões, os dias de fechamento e vencimento decidem em qual fatura (mês) cada compra entra.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Conta</th><th>Nome no app</th><th>Fechamento</th><th>Vencimento</th><th>Ocultar</th></tr>
              </thead>
              <tbody>
                {data.accounts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}<div className="muted">{a.type === 'CREDIT' ? 'Cartão' : 'Conta'}{a.number ? ` · ${a.number}` : ''}</div></td>
                    <td>
                      <input
                        defaultValue={a.label ?? ''}
                        placeholder={data.connections.find((c) => c.item_id === a.item_id)?.label}
                        onBlur={(e) => e.target.value !== (a.label ?? '') && run(() => api.patch(`/accounts/${a.id}`, { label: e.target.value }))}
                      />
                    </td>
                    {a.type === 'CREDIT' ? (
                      <CardDays id={a.id} closeDay={a.close_day} dueDay={a.due_day} onSave={(body) => run(() => api.patch(`/accounts/${a.id}`, body))} />
                    ) : (
                      <><td className="muted">—</td><td className="muted">—</td></>
                    )}
                    <td><input type="checkbox" checked={!!a.hidden} onChange={(e) => run(() => api.patch(`/accounts/${a.id}`, { hidden: e.target.checked }))} aria-label="Ocultar conta" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <h2>Transferências entre suas contas</h2>
        <p className="muted">
          Pix e TED para você mesmo não são gasto. Informe como seu nome aparece nos extratos (separe variações por vírgula).
        </p>
        <form className="form-grid" onSubmit={saveOwner}>
          <label>Seu nome<input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Fulano de Tal, FULANO T" /></label>
          <button className="btn" type="submit">{saved ? 'Salvo ✓' : 'Salvar e reaplicar regras'}</button>
        </form>
      </section>

      <BackupSection onImported={refresh} />
    </div>
  );
}

const TABLE_LABELS: Record<string, string> = {
  connections: 'bancos',
  accounts: 'contas e cartões',
  transactions: 'lançamentos',
  incomes: 'entradas',
  bills: 'contas a pagar',
};

function BackupSection({ onImported }: { onImported: () => void }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function importFile(file: File) {
    setMessage(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setMessage({ ok: false, text: 'O arquivo não é um JSON válido.' });
      return;
    }
    if (!confirm(`Importar "${file.name}"?\n\nTodos os dados atuais do app serão substituídos pelos do backup. Exporte um backup antes, se quiser guardar o estado atual.`)) return;
    setBusy(true);
    try {
      const res = await api.post<ImportResult>('/backup', parsed);
      const parts = Object.entries(TABLE_LABELS).map(([k, label]) => `${res.imported[k] ?? 0} ${label}`);
      setMessage({ ok: true, text: `Backup importado: ${parts.join(', ')}.` });
      onImported();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Backup do histórico</h2>
      <p className="muted" style={{ margin: 0 }}>
        Um arquivo JSON com bancos, contas, lançamentos (e suas notas e ajustes), entradas, contas a pagar e regras.
        As credenciais da Pluggy ficam no <code>.env</code> e não entram no backup.
      </p>
      <div className="backup-actions">
        <a className="btn btn-icon" href="/api/backup" download style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          <Icon name="download" size={18} stroke={2.2} />Exportar backup
        </a>
        <label className={`btn btn-ghost btn-icon file-btn${busy ? ' disabled' : ''}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
          <Icon name="upload" size={18} stroke={2.2} />{busy ? 'Importando…' : 'Importar backup'}
          <input type="file" accept="application/json,.json" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importFile(f); }} />
        </label>
      </div>
      {message && <p className={message.ok ? 'good-text' : 'error-text'} style={{ margin: 0, fontWeight: 600 }}>{message.text}</p>}
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Importar substitui todos os dados atuais pelos do arquivo.</p>
    </section>
  );
}

function CardDays({ closeDay, dueDay, onSave }: { id: string; closeDay: number | null; dueDay: number | null; onSave: (body: { closeDay: number; dueDay: number }) => void }) {
  const [close, setClose] = useState(closeDay?.toString() ?? '');
  const [due, setDue] = useState(dueDay?.toString() ?? '');
  const save = () => {
    if (close && due && (Number(close) !== closeDay || Number(due) !== dueDay)) onSave({ closeDay: Number(close), dueDay: Number(due) });
  };
  return (
    <>
      <td><input className="day" type="number" min={1} max={31} value={close} onChange={(e) => setClose(e.target.value)} onBlur={save} aria-label="Dia de fechamento" /></td>
      <td><input className="day" type="number" min={1} max={31} value={due} onChange={(e) => setDue(e.target.value)} onBlur={save} aria-label="Dia de vencimento" /></td>
    </>
  );
}
