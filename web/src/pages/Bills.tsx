import { useEffect, useState, type FormEvent } from 'react';
import { api, type Bill, type Suggestion } from '../api.ts';
import { money, monthName, parseMoney, shortDate, todayStr } from '../format.ts';
import { Hint, Icon } from '../icons.tsx';
import type { PageProps } from '../App.tsx';

type Repeat = 'once' | 'monthly' | 'times';
const EMPTY = { description: '', amount: '', dueDay: '', matchText: '', repeat: 'monthly' as Repeat, times: '' };

export function BillsPage({ month, version, refresh }: PageProps) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Bill[]>(`/bills?month=${month}`).then(setBills, (e: Error) => setError(e.message));
  }, [month, version]);

  useEffect(() => {
    api.get<Suggestion[]>('/bills/suggestions').then(setSuggestions, () => setSuggestions([]));
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

  function submit(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      await api.post('/bills', {
        month,
        description: form.description,
        amount: form.amount === '' ? null : parseMoney(form.amount),
        dueDay: form.dueDay,
        matchText: form.matchText,
        recurring: form.repeat === 'monthly',
        times: form.repeat === 'times' ? Number(form.times) : undefined,
      });
      setForm(EMPTY);
    });
  }

  function remove(b: Bill) {
    if (b.card_account_id) {
      if (confirm(`Ocultar "${b.description}" deste mês?\n\nAs faturas dos próximos meses continuam aparecendo.`)) run(() => api.del(`/bills/${b.id}`));
      return;
    }
    const repeats = b.repeat_total != null ? `repete por ${b.repeat_total} meses (esta é a ${b.repeat_index}ª)` : 'se repete todo mês';
    const stop = b.template_id != null && confirm(`"${b.description}" ${repeats}.\n\nOK = parar de repetir a partir deste mês\nCancelar = remover só deste mês`);
    run(() => api.del(`/bills/${b.id}${stop ? '?stopRecurring=true' : ''}`));
  }

  // Sugestões viram contas mensais a partir do mês aberto na tela.
  const accept = (s: Suggestion) =>
    run(() => api.post('/bills', { month, description: s.description, amount: s.amount, dueDay: s.dueDay, matchText: s.matchText, recurring: true }));
  const dismiss = (s: Suggestion) => run(() => api.post('/bills/suggestions/dismiss', { key: s.key }));

  const paid = bills.filter((b) => b.paid_at).length;
  const pendingTotal = bills.filter((b) => !b.paid_at).reduce((s, b) => s + (b.amount ?? 0), 0);

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>Contas do mês</h2>
          <span className="muted">{paid} de {bills.length} pagas · faltam {money(pendingTotal)}</span>
        </div>
        {error && <p className="error-text">{error}</p>}
        {bills.length === 0 ? (
          <p className="muted">Nenhuma conta neste mês. Cadastre abaixo, por exemplo internet, condomínio ou IPTU.</p>
        ) : (
          <ul className="checklist">
            {bills.map((b) => {
              const overdue = !b.paid_at && b.due_date < todayStr();
              const auto = b.card_account_id ? ' · baixa automática pelo pagamento da fatura'
                : b.match_text ? ` · baixa automática ao achar “${b.match_text}”` : '';
              return (
                <li key={b.id} className={b.paid_at ? 'done' : ''}>
                  <label>
                    <input type="checkbox" checked={!!b.paid_at} onChange={(e) => run(() => api.patch(`/bills/${b.id}`, { paid: e.target.checked }))} />
                    <span className="check-text">
                      <span>
                        {b.description}
                        {b.repeat_total != null
                          ? <span className="tag tag-accent">parcela {b.repeat_index}/{b.repeat_total}</span>
                          : b.template_id != null && <span className="tag">mensal</span>}
                        {b.card_account_id && <span className="tag tag-accent">fatura do cartão</span>}
                        {b.estimated ? <span className="tag tag-warn" title="Fatura ainda aberta: o valor muda até o fechamento">valor parcial</span> : null}
                      </span>
                      <small className={overdue ? 'error-text' : 'muted'}>
                        {b.paid_at
                          ? b.transaction_id ? `Paga em ${shortDate(b.paid_at)} · encontrada: ${b.tx_description}` : `Marcada como paga em ${shortDate(b.paid_at)}`
                          : `${overdue ? 'Venceu' : 'Vence'} ${shortDate(b.due_date)}${auto}`}
                      </small>
                    </span>
                  </label>
                  <span className="num">{b.amount != null ? money(b.amount) : '—'}</span>
                  <button className="icon-btn" aria-label={`Remover ${b.description}`} onClick={() => remove(b)}><Icon name="close" size={18} /></button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {suggestions.length > 0 && (
        <section className="card" aria-labelledby="sugestoes-titulo">
          <div className="card-head">
            <div>
              <h2 id="sugestoes-titulo">Encontramos contas que se repetem</h2>
              <span className="sub">Saídas da conta corrente que aparecem todo mês, com valor e dia parecidos</span>
            </div>
          </div>
          <ul className="list">
            {suggestions.map((s) => (
              <li key={s.key}>
                <span className="tile-icon i-accent" style={{ width: 36, height: 36 }}><Icon name="refresh" size={18} stroke={2.2} /></span>
                <span className="grow">
                  <b>{s.description}</b>
                  <small>Todo dia {s.dueDay} · visto em {s.months.map((m) => monthName(m).slice(0, 3)).join(', ')}</small>
                </span>
                <span className="num">{money(s.amount)}</span>
                <button className="btn" onClick={() => accept(s)}>Adicionar</button>
                <button className="btn btn-ghost" onClick={() => dismiss(s)}>Ignorar</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Nova conta</h2>
        <form className="form-grid" onSubmit={submit}>
          <label>Descrição<input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Internet" /></label>
          <label>Valor<input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="79,90" /></label>
          <label>Dia do vencimento<input required type="number" min={1} max={31} value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} placeholder="10" /></label>
          <label>
            <span className="label-row">
              Texto no extrato (opcional)
              <Hint text="Se esse texto aparecer numa saída do mês, a conta é marcada como paga sozinha." />
            </span>
            <input value={form.matchText} onChange={(e) => setForm({ ...form, matchText: e.target.value })} placeholder="G6 Internet" />
          </label>
          <label>
            <span className="label-row">
              Repetição
              <Hint text="Por X meses: para compras parceladas fora do banco (ex.: no dinheiro ou no carnê). A conta aparece em cada mês com a parcela da vez e some depois da última." />
            </span>
            <select value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value as Repeat })}>
              <option value="monthly">Todo mês</option>
              <option value="times">Por X meses</option>
              <option value="once">Só este mês</option>
            </select>
          </label>
          {form.repeat === 'times' && (
            <label>
              Quantos meses
              <input required type="number" min={2} max={120} value={form.times} onChange={(e) => setForm({ ...form, times: e.target.value })} placeholder="10" />
            </label>
          )}
          <button className="btn" type="submit">Adicionar</button>
        </form>
      </section>
    </div>
  );
}
