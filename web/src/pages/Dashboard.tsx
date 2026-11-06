import { useEffect, useState } from 'react';
import { api, INVESTMENT_LABELS, type Dashboard, type Forecast, type ForecastMonth, type YearSummary } from '../api.ts';
import { dueLabel, money, shortDate, shortMonthLabel, todayStr } from '../format.ts';
import { BankAvatar, Icon, PluggyBadge } from '../icons.tsx';
import { SourceSplit, SpendBySource } from '../SpendBySource.tsx';
import { YearChart } from '../YearChart.tsx';
import type { PageProps } from '../App.tsx';

export function DashboardPage({ month, version, refresh, navigate, pluggy }: PageProps) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [year, setYear] = useState(month.slice(0, 4));
  const [yearData, setYearData] = useState<YearSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<number | null>(null);

  // Marcar como paga direto daqui, sem abrir Contas a pagar.
  async function markPaid(id: number) {
    setPaying(id);
    try {
      await api.patch(`/bills/${id}`, { paid: true });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPaying(null);
    }
  }

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
  const today = todayStr();
  const paidPct = data.bills.count ? Math.round((data.bills.paidCount / data.bills.count) * 100) : 0;

  return (
    <div className="stack">
      <section className="tiles" aria-label="Resumo do mês">
        <div className={`tile tile-hero ${positive ? 'tile-good' : 'tile-bad'}`}>
          <span className="tile-icon"><Icon name={positive ? 'trend' : 'trendDown'} stroke={2.2} /></span>
          <div>
            <span className="tile-label">Resultado do mês</span>
            <span className="tile-value">{positive ? '+ ' : ''}{money(data.result)}</span>
            <span className="tile-sub">
              {!positive ? 'Saiu mais do que entrou' : keptPct !== null ? `Sobrou ${keptPct}% do que entrou` : 'Entradas − todas as saídas'}
            </span>
          </div>
        </div>
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
            <span className="tile-label">Saídas · total</span>
            <span className="tile-value">{money(data.expenses.total)}</span>
            {data.hasBanks ? (
              <>
                <SourceSplit bank={data.expenses.bank} manual={data.expenses.manual.total} />
                <span className="tile-sub">
                  <b className="src-bank-text">Bancos {money(data.expenses.bank)}</b> + <b className="src-you-text">Você {money(data.expenses.manual.total)}</b>
                </span>
              </>
            ) : (
              <span className="tile-sub">{data.expenses.manual.items.length} conta(s) paga(s)</span>
            )}
          </div>
        </div>
        {data.hasBanks ? (
        <div className="tile tile-wide">
          <span className="tile-icon i-accent"><Icon name="bank" stroke={2.2} /></span>
          <div>
            <span className="tile-label">Saldo em contas</span>
            <span className="tile-value">{money(data.bankTotal)}</span>
            <span className="tile-sub">
              {data.investmentsTotal > 0 && <>Investimentos: {money(data.investmentsTotal)} · </>}
              Faturas abertas: {money(data.cardTotal)}
            </span>
            <PluggyBadge {...pluggy} />
          </div>
        </div>
        ) : (
        <div className="tile tile-wide">
          <span className="tile-icon i-boleto"><Icon name="check" stroke={2.2} /></span>
          <div>
            <span className="tile-label">Falta pagar</span>
            <span className="tile-value">{money(data.bills.pendingTotal)}</span>
            <span className="tile-sub">{data.bills.count ? `${data.bills.paidCount} de ${data.bills.count} contas pagas` : 'Nenhuma conta cadastrada'}</span>
          </div>
        </div>
        )}
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

      <div className="row">
        <div className="col-wide">
          <section className="card" aria-labelledby="contas-titulo">
            <div className="card-head">
              <div>
                <h2 id="contas-titulo">Para pagar</h2>
                {data.bills.count > 0 && (
                  <span className="sub">Faltam {money(data.bills.pendingTotal)} · {data.bills.paidCount} de {data.bills.count} pagas</span>
                )}
              </div>
              {data.bills.count === 0 && <button className="link-btn" onClick={() => navigate('contas')}>Cadastrar contas</button>}
            </div>
            {data.bills.count === 0 ? (
              <p className="muted">Nenhuma conta cadastrada para este mês. Cadastre aluguel, internet, condomínio… e marque aqui quando pagar.</p>
            ) : (
              <>
                <div className="progress" role="img" aria-label={`${paidPct}% das contas pagas`}><span style={{ width: `${paidPct}%` }} /></div>
                {data.bills.pending.length === 0 ? (
                  <p className="good-text" style={{ margin: 0, fontWeight: 700 }}>Tudo pago neste mês.</p>
                ) : (
                  <ul className="list pay-list">
                    {data.bills.pending.map((b) => {
                      const late = b.due_date < today;
                      return (
                        <li key={b.id}>
                          <button type="button" className="check-btn" aria-label={`Marcar ${b.description} como paga`}
                            disabled={paying !== null} onClick={() => markPaid(b.id)}>
                            <span className={`check-dot ${late ? 'late' : 'open'}`} />
                          </button>
                          <span className="grow">
                            <b>{b.description}</b>
                            <small className={late ? 'error-text' : ''}>{dueLabel(b.due_date, today)}</small>
                          </span>
                          <span className="num">{b.amount != null ? money(b.amount) : '—'}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('contas')}>Ver todas as contas</button>
              </>
            )}
          </section>
        </div>

        {data.hasBanks && (
        <div className="col-narrow">
          <BalancesCard data={data} pluggy={pluggy} navigate={navigate} />
        </div>
        )}
      </div>

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

      <section className="card" aria-labelledby="gastos-titulo">
        <div className="card-head">
          <div>
            <h2 id="gastos-titulo">Saídas do mês</h2>
            <span className="sub">{data.hasBanks ? 'De onde veio cada valor que saiu' : 'Contas que você marcou como pagas'}</span>
          </div>
          <div className="head-total">
            <span>Total do mês</span>
            <b>{money(data.expenses.total)}</b>
          </div>
        </div>
        <SpendBySource data={data} onOpen={navigate} />
      </section>
    </div>
  );
}

/** Saldos de cada banco: contas, cartões e investimentos. */
function BalancesCard({ data, pluggy, navigate }: { data: Dashboard; pluggy: PageProps['pluggy']; navigate: PageProps['navigate'] }) {
  return (
    <section className="card" aria-labelledby="saldos-titulo">
      <div className="card-head">
        <span className="title-row">
          <h2 id="saldos-titulo">Saldos</h2>
          <PluggyBadge {...pluggy} />
        </span>
      </div>
      {data.banks.length === 0 ? (
        <p className="muted">
          Nenhum banco sincronizado. <button className="link-btn" onClick={() => navigate('config')}>Conectar bancos</button>
        </p>
      ) : (
        <>
          <div>
            {data.banks.map((bank) => (
              <div key={bank.itemId} className="bank-block">
                <div className="bank-head">
                  <BankAvatar label={bank.label} />
                  <span className="grow"><b>{bank.label}</b></span>
                  <span className="num" title="Contas + investimentos">{money(bank.bankBalance + bank.investmentsTotal)}</span>
                </div>
                <ul className="bank-lines">
                  {bank.accounts.map((a) => (
                    <li key={a.id}>
                      <span className="muted">
                        {a.type === 'CREDIT'
                          ? `Cartão · fatura aberta${a.available_limit != null ? ` · disponível ${money(a.available_limit)}` : ''}`
                          : a.name}
                      </span>
                      <span className="num">{a.type === 'CREDIT' ? `− ${money(a.balance)}` : money(a.balance)}</span>
                    </li>
                  ))}
                  {bank.investments.length > 0 && (
                    <li>
                      <span className="muted">Investimentos ({bank.investments.length})</span>
                      <span className="num">{money(bank.investmentsTotal)}</span>
                    </li>
                  )}
                  {bank.investments.map((i) => (
                    <li key={i.id} className="sub">
                      <span>
                        {i.name}
                        {i.type && <span className="tag">{INVESTMENT_LABELS[i.type] ?? i.type}</span>}
                        {i.due_date && <> · vence {shortDate(i.due_date)}/{i.due_date.slice(2, 4)}</>}
                      </span>
                      <span className="num" style={{ fontWeight: 600 }}>{money(i.balance)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="balance-totals">
            <div><span>Em contas</span><b>{money(data.bankTotal)}</b></div>
            <div><span>Investimentos</span><b>{money(data.investmentsTotal)}</b></div>
            <div><span>Total</span><b>{money(data.bankTotal + data.investmentsTotal)}</b></div>
          </div>
          {data.investmentsTotal === 0 && (
            <small className="muted">Nenhum investimento veio da Pluggy para estes bancos.</small>
          )}
        </>
      )}
    </section>
  );
}
