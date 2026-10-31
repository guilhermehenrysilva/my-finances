import { useEffect, useState } from 'react';
import { api, type Forecast } from '../api.ts';
import { currentMonth, money, shortMonthLabel } from '../format.ts';
import { Hint, Icon, MethodBadge } from '../icons.tsx';
import type { PageProps } from '../App.tsx';

const HORIZONS = [3, 6, 12] as const;

export function ForecastPage({ version }: PageProps) {
  const [months, setMonths] = useState<(typeof HORIZONS)[number]>(6);
  const [withVariable, setWithVariable] = useState(true);
  const [data, setData] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Forecast>(`/forecast?months=${months}&variable=${withVariable}`).then(setData, (e: Error) => setError(e.message));
  }, [months, withVariable, version]);

  if (error) return <p className="error-text">{error}</p>;
  if (!data) return <p className="muted">Carregando…</p>;

  const thisMonth = currentMonth();
  const next = data.months[1];

  return (
    <div className="stack">
      <section className="tiles" aria-label="Resumo das parcelas">
        <div className="tile">
          <span className="tile-icon i-accent"><Icon name="layers" stroke={2.2} /></span>
          <div>
            <span className="tile-label">Falta pagar em parcelas</span>
            <span className="tile-value">{money(data.totals.remaining)}</span>
            <span className="tile-sub">{data.totals.active} compra(s) parcelada(s)</span>
          </div>
        </div>
        <div className="tile">
          <span className="tile-icon i-expense"><Icon name="card" stroke={2.2} /></span>
          <div>
            <span className="tile-label">Parcelas neste mês</span>
            <span className="tile-value">{money(data.months[0]?.installments ?? 0)}</span>
            <span className="tile-sub">Na fatura de {shortMonthLabel(thisMonth)}</span>
          </div>
        </div>
        <div className="tile">
          <span className="tile-icon i-income"><Icon name="calendar" stroke={2.2} /></span>
          <div>
            <span className="tile-label">Já comprometido em {next ? shortMonthLabel(next.month) : '—'}</span>
            <span className="tile-value">{money(next?.committed ?? 0)}</span>
            <span className="tile-sub">Parcelas + contas a pagar</span>
          </div>
        </div>
        <div className="tile">
          <span className="tile-icon i-accent"><Icon name="tick" stroke={2.2} /></span>
          <div>
            <span className="tile-label">Livre de parcelas em</span>
            <span className="tile-value">{data.totals.lastEnd ? shortMonthLabel(data.totals.lastEnd) : 'Já está'}</span>
            <span className="tile-sub">Mês da última parcela</span>
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="previsao-titulo">
        <div className="card-head">
          <div>
            <h2 id="previsao-titulo">Previsão dos próximos meses</h2>
            <span className="sub">Entradas mensais menos parcelas, contas a pagar e, se marcado, a média de gastos variáveis</span>
          </div>
          <div className="row" style={{ gap: 12, alignItems: 'center' }}>
            <label className="inline-check">
              <input type="checkbox" checked={withVariable} onChange={(e) => setWithVariable(e.target.checked)} />
              Incluir gastos variáveis ({money(data.variableAvg)}/mês)
              <Hint text="Média dos últimos 3 meses de tudo que contou como gasto, tirando parcelas e contas a pagar: mercado, Pix, compras à vista…" />
            </label>
            <div className="segmented" role="group" aria-label="Quantos meses">
              {HORIZONS.map((h) => (
                <button key={h} type="button" aria-pressed={h === months} onClick={() => setMonths(h)}>{h} meses</button>
              ))}
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="history-table" style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th>Mês</th>
                <th className="r">Entradas</th>
                <th className="r">Parcelas</th>
                <th className="r">Contas a pagar</th>
                {withVariable && <th className="r">Variáveis</th>}
                <th style={{ width: '22%' }}>Comprometido da entrada</th>
                <th className="r">Sobra prevista</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((m) => {
                const spent = m.committed + m.variable;
                const pct = m.income > 0 ? Math.min(100, Math.round((spent / m.income) * 100)) : null;
                return (
                  <tr key={m.month} className={m.month === thisMonth ? 'selected' : ''}>
                    <td style={{ fontWeight: 700 }}>{shortMonthLabel(m.month)}{m.month === thisMonth && <span className="tag tag-accent">este mês</span>}</td>
                    <td className="num">{money(m.income)}</td>
                    <td className="num muted">{m.installments ? money(m.installments) : '—'}</td>
                    <td className="num muted">{m.fixed ? money(m.fixed) : '—'}</td>
                    {withVariable && <td className="num muted">{m.variable ? money(m.variable) : '—'}</td>}
                    <td>
                      {pct === null ? <span className="muted">sem entrada prevista</span> : (
                        <span className="commit-bar" title={`${pct}% da entrada`}>
                          <span className="bar-track"><span className="bar-fill" style={{ width: `${pct}%` }} /></span>
                          <span className="muted">{pct}%</span>
                        </span>
                      )}
                    </td>
                    <td className={`num ${m.result >= 0 ? 'good-text' : 'error-text'}`}>{money(m.result)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Entradas: as do mês, se já informadas; senão, as mensais do último mês. Contas a pagar: as já cadastradas no mês (avulsas e mensais) e, nos meses à frente, as mensais (sem as faturas de cartão, que já entram como parcelas).
          Parcelamentos aparecem a partir da primeira parcela na fatura.
        </p>
      </section>

      <section className="card" aria-labelledby="parcelas-titulo">
        <div className="card-head">
          <h2 id="parcelas-titulo">Compras parceladas</h2>
          <span className="sub">Ordenadas pelo fim do parcelamento</span>
        </div>
        {data.installments.length === 0 ? (
          <p className="muted">Nenhuma compra parcelada em andamento, nos cartões ou em Contas a pagar.</p>
        ) : (
          <ul className="list">
            {data.installments.map((i) => {
              const last = i.remaining === 0;
              return (
                <li key={i.key}>
                  <MethodBadge method={i.manual ? 'OUTRO' : 'CARTAO'} />
                  <span className="grow">
                    <b>
                      {i.description}
                      {i.manual && <span className="tag">fora do banco</span>}
                      {last && <span className="tag tag-warn">última parcela</span>}
                    </b>
                    <small>{i.manual ? 'Contas a pagar' : `Cartão ${i.accountLabel}`} · parcela {i.current} de {i.total} · termina em {shortMonthLabel(i.endMonth)}</small>
                    <span className="progress" style={{ display: 'block', marginTop: 6, maxWidth: 260 }} role="img" aria-label={`${i.current} de ${i.total} parcelas`}>
                      <span style={{ width: `${(i.current / i.total) * 100}%`, background: 'var(--accent)' }} />
                    </span>
                  </span>
                  <span className="installment-values">
                    <b className="num">{money(i.amount)}<small className="muted">/mês</small></b>
                    <small className="muted">{last ? 'nada depois desta' : `faltam ${money(i.remainingAmount)}`}</small>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
