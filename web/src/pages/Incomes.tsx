import { useEffect, useState, type FormEvent } from 'react';
import { api, type Income } from '../api.ts';
import { money, monthLabel, parseMoney } from '../format.ts';
import { Icon } from '../icons.tsx';
import type { PageProps } from '../App.tsx';

const EMPTY = { description: '', amount: '', recurring: true };

export function IncomesPage({ month, version, refresh }: PageProps) {
  const [items, setItems] = useState<Income[]>([]);
  const [repeatFrom, setRepeatFrom] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ items: Income[]; repeatFrom: string | null }>(`/incomes?month=${month}`).then((d) => {
      setItems(d.items);
      setRepeatFrom(d.repeatFrom);
    }, (e: Error) => setError(e.message));
  }, [month, version]);

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
      await api.post('/incomes', { month, description: form.description, amount: parseMoney(form.amount), recurring: form.recurring });
      setForm(EMPTY);
    });
  }

  const total = items.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>Entradas do mês</h2>
          <span className="tile-value small">{money(total)}</span>
        </div>
        {error && <p className="error-text">{error}</p>}
        {repeatFrom && (
          <div className="callout">
            <span>Repetir as entradas mensais de {monthLabel(repeatFrom)}?</span>
            <button className="btn" onClick={() => run(() => api.post('/incomes/repeat', { month }))}>Repetir</button>
          </div>
        )}
        {items.length === 0 ? (
          <p className="muted">Nenhuma entrada informada. É só isso que você digita: quanto entrou no mês.</p>
        ) : (
          <ul className="list">
            {items.map((i) => (
              <li key={i.id}>
                <span className="tile-icon i-income" style={{ width: 36, height: 36 }}><Icon name="up" size={18} stroke={2.2} /></span>
                <span className="grow"><b>{i.description}{i.recurring ? <span className="tag tag-accent">mensal</span> : null}</b></span>
                <span className="num">{money(i.amount)}</span>
                <button className="icon-btn" aria-label={`Remover ${i.description}`} onClick={() => run(() => api.del(`/incomes/${i.id}`))}><Icon name="close" size={18} /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Nova entrada</h2>
        <form className="form-grid" onSubmit={submit}>
          <label>Descrição<input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Salário" /></label>
          <label>Valor<input required inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="20.000,00" /></label>
          <label className="inline">
            <input type="checkbox" checked={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} />
            Entrada mensal (sugerir no próximo mês)
          </label>
          <button className="btn" type="submit">Adicionar</button>
        </form>
      </section>
    </div>
  );
}
