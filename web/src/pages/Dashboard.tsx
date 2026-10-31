import { useEffect, useState } from 'react';
import { api, METHOD_LABELS, type Dashboard, type Forecast, type ForecastMonth, type YearSummary } from '../api.ts';
import { money, shortDate, shortMonthLabel, todayStr } from '../format.ts';
import { BankAvatar, Icon, MethodBadge } from '../icons.tsx';
import { YearChart } from '../YearChart.tsx';
import type { PageProps } from '../App.tsx';

export function DashboardPage({ month, version, navigate }: PageProps) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [year, setYear] = useState(month.slice(0, 4));
  const [yearData, setYearData] = useState<YearSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Dashboard>(`/dashboard?month=${month}`).then(setData, (e: Error) => setError(e.message));
  }, [month, version]);

  // Trocar de mês para outro ano leva o gráfico junto.
  useEffect(() => setYear(month.slice(0, 4)), [month]);

  useEffect(() => {
    api.get<YearSummary>(`/year?year=${year}`).then(setYearData, (e: Error) => setError(e.message));
  }, [year, version]);

  // O mês seguinte ao atual, sem a média de gastos variáveis: só o que já está certo.
  const [next, setNext] = useState<ForecastMonth | null>(null);
  useEffect(() => {
    api.get<Forecast>('/forecast?months=3&variable=false').then((f) => setNext(f.months[1] ?? null), () => setNext(null));
  }, [version]);

  if (error) return <p className="error-text">{error}</p>;
  if (!data) return <p className="muted">Carregando…</p>;

  const positive = data.result >= 0;
  const income = data.income.total;
  const keptPct = income > 0 ? Math.round((data.result / income) * 100) : null;
  const maxGroup = Math.max(...data.expenses.groups.map((g) => g.total), 1);
  const byMethod = new Map(data.expenses.byMethod.map((m) => [m.method, m.total]));
  const today = todayStr();
  const paidPct = data.bills.count ? Math.round((data.bills.paidCount / data.bills.count) * 100) : 0;

  return (
    <div className="stack">
      <section className="tiles" aria-label="Resumo do mês">
        <div className="tile">
          <span className="tile-icon i-income"><Icon name="up" stroke={2.2} /></span>
          <div>
            <span className="tile-label">Entradas</span>
            <span className="tile-value">{money(income)}</span>
            {data.income.items.length === 0
              ? <button className="link-btn" onClick={() => navigate('entradas')}>Informar entradas do mês</button>
              : <span className="tile-sub">{data.income.items.map((i) => i.description).join(' · ')}</span>}
          </div>
        </div>
        <div className="tile">
          <span className="tile-icon i-expense"><Icon name="down" stroke={2.2} /></span>
          <div>
            <span className="tile-label">Saídas</span>
            <span className="tile-value">{money(data.expenses.total)}</span>
            <span className="tile-sub">Cartões, Pix e boletos</span>
          </div>
        </div>
        <div className={`tile ${positive ? 'tile-good' : 'tile-bad'}`}>
          <span className="tile-icon"><Icon name={positive ? 'trend' : 'trendDown'} stroke={2.2} /></span>
          <div>
            <span className="tile-label">Resultado do mês</span>
            <span className="tile-value">{positive ? '+ ' : ''}{money(data.result)}</span>
            <span className="tile-sub">
              {positive ? 'Positivo' : 'Negativo'}
              {keptPct !== null && positive && ` · sobrou ${keptPct}% da entrada`}
            </span>
          </div>
        </div>
        <div className="tile">
          <span className="tile-icon i-accent"><Icon name="wallet" stroke={2.2} /></span>
          <div>
            <span className="tile-label">Saldo em contas</span>
            <span className="tile-value">{money(data.bankTotal)}</span>
            <span className="tile-sub">Faturas abertas: {money(data.cardTotal)}</span>
          </div>
        </div>
      </section>

      {next && next.committed > 0 && (
        <section className="callout committed-callout" aria-label="Próximo mês">
          <span>
            Em <b>{shortMonthLabel(next.month)}</b> já estão comprometidos <b>{money(next.committed)}</b>
            {' '}(parcelas {money(next.installments)} + contas a pagar {money(next.fixed)})
            {next.income > 0 && <> · sobram {money(next.income - next.committed)} da entrada</>}
          </span>
          <button className="link-btn" onClick={() => navigate('previsao')}>Ver previsão</button>
        </section>
      )}

      {yearData && (
        <section className="card" aria-labelledby="ano-titulo">
          <div className="card-head">
            <div>
              <h2 id="ano-titulo">Seu ano em {yearData.year}</h2>
              <span className="sub">Entradas e saídas de cada mês</span>
            </div>
            <div className="row" style={{ gap: 16, alignItems: 'center' }}>
              <div className="legend" aria-hidden="true">
                <span><i style={{ background: 'var(--income)' }} />Entradas</span>
                <span><i style={{ background: 'var(--expense)' }} />Saídas</span>
              </div>
              {yearData.years.length > 1 && (
                <div className="segmented" role="group" aria-label="Ano">
                  {yearData.years.map((y) => (
                    <button key={y} type="button" aria-pressed={y === year} onClick={() => setYear(y)}>{y}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="year-body">
            <YearChart data={yearData} highlight={month} />
            <div className="year-totals">
              <div className="year-total"><span>Entrou no ano</span><b>{money(yearData.totals.income)}</b></div>
              <div className="year-total"><span>Saiu no ano</span><b>{money(yearData.totals.expenses)}</b></div>
              <div className={`year-total ${yearData.totals.result >= 0 ? 'good' : 'bad'}`}>
                <span>{yearData.totals.result >= 0 ? 'Sobrou no ano' : 'Faltou no ano'}</span>
                <b>{money(yearData.totals.result)}</b>
              </div>
              <div className="year-total"><span>Gasto médio por mês</span><b>{money(yearData.totals.avgExpenses)}</b></div>
            </div>
          </div>
        </section>
      )}

      <div className="row">
        <section className="card col-wide" aria-labelledby="gastos-titulo">
          <div className="card-head">
            <h2 id="gastos-titulo">Gastos por cartão e Pix</h2>
            <button className="link-btn" onClick={() => navigate('lancamentos')}>Ver lançamentos</button>
          </div>
          {data.expenses.groups.length === 0 ? (
            <p className="muted">Nenhum gasto neste mês.</p>
          ) : (
            <ul className="bars">
              {data.expenses.groups.map((g) => (
                <li key={`${g.account_id}-${g.method}`} title={`${g.count} lançamento(s)`}>
                  <span className="bar-label"><MethodBadge method={g.method} />{METHOD_LABELS[g.method]} {g.account_label}</span>
                  <span className="bar-track"><span className="bar-fill" style={{ width: `${(Math.max(g.total, 0) / maxGroup) * 100}%` }} /></span>
                  <span className="bar-value">{money(g.total)}</span>
                </li>
              ))}
            </ul>
          )}
          {data.expenses.byMethod.length > 0 && (
            <div className="totals-row">
              <div><span>Todo o cartão</span><b>{money(byMethod.get('CARTAO') ?? 0)}</b></div>
              <div><span>Todo o Pix</span><b>{money(byMethod.get('PIX') ?? 0)}</b></div>
              <div><span>Boletos</span><b>{money(byMethod.get('BOLETO') ?? 0)}</b></div>
              {data.expenses.byMethod.filter((m) => !['CARTAO', 'PIX', 'BOLETO'].includes(m.method)).map((m) => (
                <div key={m.method}><span>{METHOD_LABELS[m.method]}</span><b>{money(m.total)}</b></div>
              ))}
            </div>
          )}
        </section>

        <div className="col-narrow">
          <section className="card" aria-labelledby="contas-titulo">
            <div className="card-head">
              <h2 id="contas-titulo">Contas a pagar</h2>
              {data.bills.count > 0
                ? <span className="muted" style={{ fontWeight: 700 }}>{data.bills.paidCount} de {data.bills.count} pagas</span>
                : <button className="link-btn" onClick={() => navigate('contas')}>Cadastrar</button>}
            </div>
            {data.bills.count === 0 ? (
              <p className="muted">Nenhuma conta cadastrada para este mês.</p>
            ) : (
              <>
                <div className="progress" role="img" aria-label={`${paidPct}% das contas pagas`}><span style={{ width: `${paidPct}%` }} /></div>
                {data.bills.pending.length === 0 ? (
                  <p className="good-text" style={{ margin: 0, fontWeight: 700 }}>Tudo pago neste mês.</p>
                ) : (
                  <ul className="list">
                    {data.bills.pending.map((b) => {
                      const late = b.due_date < today;
                      return (
                        <li key={b.id}>
                          <span className={`check-dot ${late ? 'late' : 'open'}`} />
                          <span className="grow">
                            <b>{b.description}</b>
                            <small className={late ? 'error-text' : ''}>{late ? 'Venceu' : 'Vence'} {shortDate(b.due_date)}</small>
                          </span>
                          <span className="num">{b.amount != null ? money(b.amount) : '—'}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('contas')}>Ver todas</button>
              </>
            )}
          </section>

          <section className="card" aria-labelledby="saldos-titulo">
            <h2 id="saldos-titulo">Contas e cartões</h2>
            {data.accounts.length === 0 ? (
              <p className="muted">
                Nenhuma conta sincronizada. <button className="link-btn" onClick={() => navigate('config')}>Conectar bancos</button>
              </p>
            ) : (
              <ul className="list">
                {data.accounts.map((a) => (
                  <li key={a.id}>
                    <BankAvatar label={a.label} />
                    <span className="grow">
                      <b>{a.type === 'CREDIT' ? `Cartão ${a.label}` : a.label}</b>
                      <small>
                        {a.type === 'CREDIT'
                          ? a.available_limit != null ? `Fatura aberta · disponível ${money(a.available_limit)}` : 'Fatura aberta'
                          : a.name}
                      </small>
                    </span>
                    <span className="num">{money(a.balance)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
