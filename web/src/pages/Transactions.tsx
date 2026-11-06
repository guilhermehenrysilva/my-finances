import { useEffect, useMemo, useState } from 'react';
import { api, METHOD_LABELS, type Method, type Transaction } from '../api.ts';
import { dayLabel, money, monthName, shortDate } from '../format.ts';
import { Icon, MethodBadge, PluggyBadge } from '../icons.tsx';
import { Sheet } from '../Sheet.tsx';
import { useIsMobile } from '../useMedia.ts';
import type { PageProps } from '../App.tsx';

const METHODS = Object.keys(METHOD_LABELS) as Method[];

const signed = (r: Transaction) => (r.flow === 'OUT' ? r.amount : -r.amount);
const amountText = (r: Transaction) => `${r.flow === 'IN' ? '+' : '−'} ${money(r.amount)}`;
const ignoredText = (r: Transaction) => (r.ignored_user != null ? 'Ignorado por você' : r.ignored_auto);

/** Etiquetas de um lançamento: pendente, parcela, fatura de outro mês, ignorado. */
function Tags({ r }: { r: Transaction }) {
  return (
    <div className="tags">
      {r.status === 'PENDING' && <span className="tag tag-warn">Pendente</span>}
      {r.total_installments && <span className="tag tag-accent">Parcela {r.installment_number}/{r.total_installments}</span>}
      {r.ref_month !== r.date.slice(0, 7) && <span className="tag tag-income">Fatura de {monthName(r.ref_month)}</span>}
      {r.ignored ? <span className="tag">{ignoredText(r)} · não conta</span> : null}
    </div>
  );
}

export function TransactionsPage({ month, version, refresh, pluggy }: PageProps) {
  const [rows, setRows] = useState<Transaction[]>([]);
  const [account, setAccount] = useState('');
  const [method, setMethod] = useState<Method | ''>('');
  const [flow, setFlow] = useState('OUT');
  const [ignored, setIgnored] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const mobile = useIsMobile();

  // O filtro de meio é aplicado aqui, para os botões mostrarem o total de cada meio.
  useEffect(() => {
    const params = new URLSearchParams({ month });
    if (account) params.set('accountId', account);
    if (flow) params.set('flow', flow);
    if (ignored) params.set('ignored', ignored);
    if (q) params.set('q', q);
    api.get<Transaction[]>(`/transactions?${params}`).then(setRows, (e: Error) => setError(e.message));
  }, [month, version, account, flow, ignored, q]);

  const accounts = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.account_id, `${r.account_label} · ${r.account_type === 'CREDIT' ? 'Cartão' : 'Conta'}`);
    return [...map];
  }, [rows]);

  const totals = useMemo(() => {
    const byMethod = new Map<Method, number>();
    let all = 0;
    for (const r of rows) {
      if (r.ignored) continue;
      all += signed(r);
      byMethod.set(r.method, (byMethod.get(r.method) ?? 0) + signed(r));
    }
    return { all, byMethod };
  }, [rows]);

  const visible = method ? rows.filter((r) => r.method === method) : rows;
  const countedVisible = visible.filter((r) => !r.ignored);

  // No celular: um bloco por dia, na ordem em que os lançamentos vêm.
  const days = useMemo(() => {
    const out: { date: string; rows: Transaction[] }[] = [];
    for (const r of visible) {
      const last = out[out.length - 1];
      if (last?.date === r.date) last.rows.push(r);
      else out.push({ date: r.date, rows: [r] });
    }
    return out;
  }, [visible]);

  const open = openId ? rows.find((r) => r.id === openId) ?? null : null;

  async function update(id: string, body: Record<string, unknown>) {
    try {
      await api.patch(`/transactions/${id}`, body);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const setCounted = (r: Transaction, counted: boolean) => {
    const wantIgnored = !counted;
    const autoIgnored = r.ignored_auto != null;
    update(r.id, { ignored: wantIgnored === autoIgnored ? null : wantIgnored });
  };

  const methodSelect = (r: Transaction) => (
    <select value={r.method} aria-label="Meio de pagamento"
      onChange={(e) => update(r.id, { method: e.target.value === r.method_auto ? null : e.target.value })}>
      {METHODS.filter((m) => m !== 'CARTAO').map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
    </select>
  );

  return (
    <div className="stack" style={{ gap: 16 }}>
      <label className="search">
        <Icon name="search" size={18} stroke={2.2} />
        <span className="sr-only">Buscar</span>
        <input type="search" placeholder="Buscar descrição ou nota" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>

      <div className="chips" role="group" aria-label="Filtrar por meio">
        <button type="button" className="chip" aria-pressed={method === ''} onClick={() => setMethod('')}>
          Tudo · {money(totals.all)}
        </button>
        {METHODS.filter((m) => totals.byMethod.has(m)).map((m) => (
          <button key={m} type="button" className="chip" aria-pressed={method === m} onClick={() => setMethod(method === m ? '' : m)}>
            {METHOD_LABELS[m]} · {money(totals.byMethod.get(m)!)}
          </button>
        ))}
      </div>

      <div className="filters">
        <select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Conta">
          <option value="">Todas as contas</option>
          {accounts.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select value={flow} onChange={(e) => setFlow(e.target.value)} aria-label="Tipo">
          <option value="OUT">Saídas</option>
          <option value="IN">Entradas e estornos</option>
          <option value="">Tudo</option>
        </select>
        <select value={ignored} onChange={(e) => setIgnored(e.target.value)} aria-label="Ignorados">
          <option value="">Com ignorados</option>
          <option value="hide">Só o que conta</option>
          <option value="only">Só ignorados</option>
        </select>
      </div>

      {error && <p className="error-text">{error}</p>}

      <section className="card" style={mobile ? undefined : { padding: '16px 24px' }}>
        <div className="title-row">
          <p className="muted" style={{ margin: 0 }}>
            {visible.length} lançamento(s) · {countedVisible.length} contam no mês ·
            total <b style={{ color: 'var(--text)' }}>{money(countedVisible.reduce((s, r) => s + signed(r), 0))}</b>
          </p>
          <PluggyBadge {...pluggy} />
        </div>
        {visible.length === 0 ? (
          <p className="muted">Nada encontrado com esses filtros.</p>
        ) : mobile ? (
          <div>
            {days.map((d) => (
              <div key={d.date} className="day-group">
                <h3 className="day-label cap">{dayLabel(d.date)}</h3>
                <ul className="tx-list">
                  {d.rows.map((r) => (
                    <li key={r.id}>
                      <button type="button" className={`tx-row${r.ignored ? ' ignored' : ''}`} onClick={() => setOpenId(r.id)}>
                        <MethodBadge method={r.method} size={36} />
                        <span className="grow">
                          <b>{r.description}</b>
                          <small>{r.account_label} · {r.account_type === 'CREDIT' ? 'cartão' : METHOD_LABELS[r.method].toLowerCase()}{r.note ? ` · ${r.note}` : ''}</small>
                          {(r.status === 'PENDING' || r.total_installments || r.ignored || r.ref_month !== r.date.slice(0, 7)) && <Tags r={r} />}
                        </span>
                        <span className={`amount ${r.flow === 'IN' ? 'good-text' : ''}`}>{amountText(r)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Conta</th>
                  <th>Meio</th>
                  <th style={{ textAlign: 'right' }}>Valor</th>
                  <th style={{ textAlign: 'center' }} title="Desmarque para não contar como gasto">Conta no mês</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className={r.ignored ? 'row-ignored' : ''}>
                    <td className="muted" style={{ fontWeight: 600 }}>{shortDate(r.date)}</td>
                    <td>
                      <div className="desc">{r.description}</div>
                      <Tags r={r} />
                      <input
                        className="note"
                        placeholder="Adicionar nota"
                        aria-label={`Nota de ${r.description}`}
                        defaultValue={r.note ?? ''}
                        onBlur={(e) => e.target.value !== (r.note ?? '') && update(r.id, { note: e.target.value })}
                      />
                    </td>
                    <td>{r.account_label}<div className="muted" style={{ fontSize: 13 }}>{r.account_type === 'CREDIT' ? 'Cartão' : 'Conta'}</div></td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <MethodBadge method={r.method} size={28} />
                        {r.account_type === 'CREDIT' ? METHOD_LABELS[r.method] : methodSelect(r)}
                      </span>
                    </td>
                    <td className={`amount ${r.flow === 'IN' ? 'good-text' : ''}`}>{amountText(r)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!r.ignored}
                        aria-label={`Contar ${r.description} no mês`}
                        onChange={(e) => setCounted(r, e.target.checked)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open && (
        <Sheet title={open.description} onClose={() => setOpenId(null)}>
          <div className={`big-amount${open.ignored ? ' off' : ''}${open.flow === 'IN' ? ' good-text' : ''}`}>{amountText(open)}</div>
          <Tags r={open} />
          <dl className="detail-list">
            <div><dt>Data</dt><dd className="cap">{dayLabel(open.date)}</dd></div>
            <div><dt>Conta</dt><dd>{open.account_label} · {open.account_type === 'CREDIT' ? 'Cartão' : 'Conta'}</dd></div>
            {open.ref_month !== open.date.slice(0, 7) && <div><dt>Entra na fatura de</dt><dd>{monthName(open.ref_month)}</dd></div>}
            {open.account_type === 'CREDIT' && <div><dt>Meio</dt><dd>{METHOD_LABELS[open.method]}</dd></div>}
          </dl>
          {open.account_type !== 'CREDIT' && <label className="field">Meio de pagamento{methodSelect(open)}</label>}
          <label className="switch-row">
            <span className="grow">
              <b>Conta como gasto do mês</b>
              <small>{open.ignored ? `${ignoredText(open)}: não entra nas saídas` : 'Desligue para transferências entre suas contas'}</small>
            </span>
            <input type="checkbox" role="switch" className="switch" checked={!open.ignored} onChange={(e) => setCounted(open, e.target.checked)} />
          </label>
          <label className="field">
            Observação
            <input key={open.id} placeholder="Para o trabalho" defaultValue={open.note ?? ''}
              onBlur={(e) => e.target.value !== (open.note ?? '') && update(open.id, { note: e.target.value })} />
          </label>
          <button className="btn" onClick={(e) => (e.currentTarget.closest('dialog') as HTMLDialogElement | null)?.close()}>Pronto</button>
        </Sheet>
      )}
    </div>
  );
}
