import { useEffect, useState } from 'react';
import { api, type Forecast } from '../api.ts';
import { currentMonth, money, shortMonthLabel } from '../format.ts';
import { Hint, Icon, MethodBadge, SourceIcon } from '../icons.tsx';
import { useIsMobile } from '../useMedia.ts';
import type { PageProps } from '../App.tsx';

const HORIZONS = [3, 6, 12] as const;

export function ForecastPage({ version, pluggy }: PageProps) {
  const [months, setMonths] = useState<(typeof HORIZONS)[number]>(6);
  const [withVariable, setWithVariable] = useState(true);
  const [data, setData] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mobile = useIsMobile();

  useEffect(() => {
    api.get<Forecast>(`/forecast?months=${months}&variable=${withVariable}`).then(setData, (e: Error) => setError(e.message));
  }, [months, withVariable, version]);

  if (error) return <p className="error-text">{error}</p>;
  if (!data) return <p className="muted">Carregando…</p>;

  const thisMonth = currentMonth();
  const next = data.months[1];
  // Sem banco conectado (e nada vindo dos cartões), as colunas dos bancos somem.
  const banks = pluggy.ready || data.variableAvg > 0 || data.installments.some((i) => !i.manual);
  const variable = banks && withVariable;
  const groups = [
    { source: 'bank' as const, title: 'Nos cartões', list: data.installments.filter((i) => !i.manual) },
    { source: 'you' as const, title: 'Cadastradas por você', list: data.installments.filter((i) => i.manual) },
  ].filter((g) => g.source === 'you' || banks);
  const orDash = (v: number) => (v ? money(v) : '—');

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
            <span className="tile-sub">{banks ? `Na fatura de ${shortMonthLabel(thisMonth)}` : 'Cadastradas em Contas a pagar'}</span>
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
            <span className="sub">{banks ? 'Comprometido = previsto pelos bancos + cadastrado por você' : 'Entradas mensais menos as contas e parcelas que você cadastrou'}</span>
          </div>
          <div className="row" style={{ gap: 12, alignItems: 'center' }}>
            {banks && <label className="inline-check">
              <input type="checkbox" checked={withVariable} onChange={(e) => setWithVariable(e.target.checked)} />
              Incluir gastos variáveis ({money(data.variableAvg)}/mês)
              <Hint text="Média dos últimos 3 meses de tudo que contou como gasto nos bancos, tirando parcelas e contas a pagar: mercado, Pix, compras à vista…" />
            </label>}
            <div className="segmented" role="group" aria-label="Quantos meses">
              {HORIZONS.map((h) => (
                <button key={h} type="button" aria-pressed={h === months} onClick={() => setMonths(h)}>{h} meses</button>
              ))}
            </div>
          </div>
        </div>
        {mobile ? (
          // No celular, um cartão por mês no lugar da tabela larga.
          <ul className="month-cards">
            {data.months.map((m) => {
              const rest = Math.max(m.income - m.committed - m.variable, 0);
              return (
                <li key={m.month} className={`month-card${m.month === thisMonth ? ' current' : ''}`}>
                  <div className="month-card-head">
                    <b>{shortMonthLabel(m.month)}{m.month === thisMonth && <span className="tag tag-accent">este mês</span>}</b>
                    <small>sobra <b className={m.result >= 0 ? 'good-text' : 'error-text'}>{money(m.result)}</b></small>
                  </div>
                  {m.income > 0 && (
                    <span className="stack-bar" role="img"
                      aria-label={`Parcelas ${money(m.installments)}, contas ${money(m.fixed)}${variable ? `, dia a dia ${money(m.variable)}` : ''}, sobra ${money(m.result)}`}>
                      {m.installments > 0 && <span style={{ flex: m.installments, background: 'var(--src-bank)' }} />}
                      {m.fixed > 0 && <span style={{ flex: m.fixed, background: 'var(--src-you)' }} />}
                      {variable && m.variable > 0 && <span style={{ flex: m.variable, background: 'var(--expense)' }} />}
                      {rest > 0 && <span className="rest" style={{ flex: rest }} />}
                    </span>
                  )}
                  <dl className="mini-dl">
                    <div><dt>Entradas</dt><dd>{money(m.income)}</dd></div>
                    <div><dt>Comprometido</dt><dd>{money(m.committed)}</dd></div>
                    <div><dt>Parcelas</dt><dd>{orDash(m.installments)}</dd></div>
                    <div><dt>Contas a pagar</dt><dd>{orDash(m.fixed)}</dd></div>
                    {variable && <div><dt>Dia a dia (média)</dt><dd>{orDash(m.variable)}</dd></div>}
                  </dl>
                </li>
              );
            })}
          </ul>
        ) : (
        <div className="table-wrap">
          <table className="history-table" style={{ minWidth: banks ? 980 : 720 }}>
            <thead>
              {banks && (
                <tr>
                  <th colSpan={2} aria-hidden="true" />
                  <th colSpan={variable ? 2 : 1} scope="colgroup" className="group g-bank"><span><Icon name="bank" size={14} stroke={2.4} />Previsto pelos bancos</span></th>
                  <th className="g-gap" aria-hidden="true" />
                  <th colSpan={2} scope="colgroup" className="group g-you"><span><Icon name="pencil" size={14} stroke={2.4} />Cadastrado por você</span></th>
                  <th colSpan={2} aria-hidden="true" />
                </tr>
              )}
              <tr>
                <th>Mês</th>
                <th className="r">Entradas</th>
                {banks && (
                  <>
                    <th className="r g-bank">Parcelas do cartão</th>
                    {variable && <th className="r g-bank">Dia a dia (média)</th>}
                    <th className="g-gap" aria-hidden="true" />
                  </>
                )}
                <th className={`r ${banks ? 'g-you' : ''}`}>Contas a pagar</th>
                <th className={`r ${banks ? 'g-you' : ''}`}>Parcelas fora do banco</th>
                <th style={{ width: '20%' }}>Comprometido da entrada</th>
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
                    {banks && (
                      <>
                        <td className="num muted g-bank">{orDash(m.cardInstallments)}</td>
                        {variable && <td className="num muted g-bank">{orDash(m.variable)}</td>}
                        <td className="g-gap" aria-hidden="true" />
                      </>
                    )}
                    <td className={`num muted ${banks ? 'g-you' : ''}`}>{orDash(m.fixed)}</td>
                    <td className={`num muted ${banks ? 'g-you' : ''}`}>{orDash(m.manualInstallments)}</td>
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
        )}
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
          <p className="muted">Nenhuma compra parcelada em andamento{banks ? ', nos cartões ou em Contas a pagar' : '. Cadastre em Contas a pagar com a repetição "Por X meses"'}.</p>
        ) : (
          <div className="installment-groups">
            {groups.map((g) => (
              <div key={g.source} className="stack" style={{ gap: 4 }}>
                <div className="installment-group-head">
                  <h3 className={g.source === 'bank' ? 'src-bank-text' : 'src-you-text'}>
                    <SourceIcon source={g.source} size={28} />{g.title}
                  </h3>
                  <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{g.list.length} compra(s)</span>
                </div>
                {g.list.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nenhuma.</p> : (
                  <ul className="list">
                    {g.list.map((i) => {
                      const last = i.remaining === 0;
                      return (
                        <li key={i.key}>
                          <MethodBadge method={i.manual ? 'OUTRO' : 'CARTAO'} />
                          <span className="grow">
                            <b>
                              {i.description}
                              {last && <span className="tag tag-warn">última parcela</span>}
                            </b>
                            <small>{i.manual ? 'Contas a pagar' : `Cartão ${i.accountLabel}`} · parcela {i.current} de {i.total} · termina em {shortMonthLabel(i.endMonth)}</small>
                            <span className="progress" style={{ display: 'block', marginTop: 6, maxWidth: 260 }} role="img" aria-label={`${i.current} de ${i.total} parcelas`}>
                              <span style={{ width: `${(i.current / i.total) * 100}%`, background: i.manual ? 'var(--src-you)' : 'var(--src-bank)' }} />
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
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
