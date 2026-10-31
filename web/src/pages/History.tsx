import { useEffect, useState } from 'react';
import { api, METHOD_LABELS, type Dashboard, type Method, type Transaction, type YearSummary } from '../api.ts';
import { currentMonth, money, monthLabel, shortDate } from '../format.ts';
import { Icon, MethodBadge, SourceIcon, type Source } from '../icons.tsx';
import { SpendBySource } from '../SpendBySource.tsx';
import { YearChart } from '../YearChart.tsx';
import type { PageProps } from '../App.tsx';

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MAIN_METHODS: Method[] = ['CARTAO', 'PIX', 'BOLETO'];
const TOP_EXPENSES = 8;

/** Mês aberto por padrão: o selecionado no app, se for deste ano; senão o último com dados. */
function defaultMonth(data: YearSummary, preferred: string): string | null {
  if (preferred.startsWith(data.year) && data.months.find((m) => m.month === preferred)?.hasData) return preferred;
  return [...data.months].reverse().find((m) => m.hasData)?.month ?? null;
}

export function HistoryPage({ month, version, openMonth }: PageProps) {
  const [year, setYear] = useState(month.slice(0, 4));
  const [data, setData] = useState<YearSummary | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<YearSummary>(`/year?year=${year}`).then((d) => {
      setData(d);
      setSelected((s) => (s?.startsWith(d.year) && d.months.find((m) => m.month === s)?.hasData ? s : defaultMonth(d, month)));
    }, (e: Error) => setError(e.message));
  }, [year, version, month]);

  if (error) return <p className="error-text">{error}</p>;
  if (!data) return <p className="muted">Carregando…</p>;

  const years = data.years;
  const idx = years.indexOf(year);
  const thisMonth = currentMonth();
  // Sem banco conectado, as colunas dos bancos somem: as saídas são só as contas pagas.
  const banks = data.hasBanks;
  const withData = data.months.filter((m) => m.hasData);
  const other = (m: YearSummary['months'][number]) =>
    Object.entries(m.byMethod).filter(([k]) => !MAIN_METHODS.includes(k as Method)).reduce((s, [, v]) => s + (v ?? 0), 0);
  const sum = (fn: (m: YearSummary['months'][number]) => number) => withData.reduce((s, m) => s + fn(m), 0);
  const orDash = (v: number) => (v ? money(v) : '—');

  return (
    <div className="stack">
      <div className="history-years">
        <button className="icon-btn" aria-label="Ano anterior" disabled={idx <= 0} onClick={() => setYear(years[idx - 1])}>
          <Icon name="chevronLeft" stroke={2.2} />
        </button>
        <div className="segmented" role="group" aria-label="Ano">
          {years.map((y) => (
            <button key={y} type="button" aria-pressed={y === year} onClick={() => setYear(y)}>{y}</button>
          ))}
        </div>
        <button className="icon-btn" aria-label="Próximo ano" disabled={idx >= years.length - 1} onClick={() => setYear(years[idx + 1])}>
          <Icon name="chevronRight" stroke={2.2} />
        </button>
      </div>

      <section className="tiles" aria-label={`Resumo de ${data.year}`}>
        <div className="tile"><span className="tile-icon i-income"><Icon name="up" stroke={2.2} /></span>
          <div><span className="tile-label">Entrou em {data.year}</span><span className="tile-value">{money(data.totals.income)}</span></div></div>
        <div className="tile"><span className="tile-icon i-expense"><Icon name="down" stroke={2.2} /></span>
          <div>
            <span className="tile-label">Saiu em {data.year}</span><span className="tile-value">{money(data.totals.expenses)}</span>
            {banks && (
              <span className="tile-sub">
                <b className="src-bank-text">Bancos {money(data.totals.bank)}</b> + <b className="src-you-text">Você {money(data.totals.manual)}</b>
              </span>
            )}
          </div></div>
        <div className={`tile ${data.totals.result >= 0 ? 'tile-good' : 'tile-bad'}`}>
          <span className="tile-icon"><Icon name={data.totals.result >= 0 ? 'trend' : 'trendDown'} stroke={2.2} /></span>
          <div><span className="tile-label">{data.totals.result >= 0 ? 'Sobrou' : 'Faltou'} no ano</span><span className="tile-value">{money(data.totals.result)}</span></div></div>
        <div className="tile"><span className="tile-icon i-accent"><Icon name="calendar" stroke={2.2} /></span>
          <div><span className="tile-label">Gasto médio por mês</span><span className="tile-value">{money(data.totals.avgExpenses)}</span></div></div>
      </section>

      <section className="card" aria-labelledby="hist-grafico">
        <div className="card-head">
          <h2 id="hist-grafico">Entradas e saídas em {data.year}</h2>
          <div className="legend" aria-hidden="true">
            <span><i style={{ background: 'var(--income)' }} />Entradas</span>
            <span><i style={{ background: 'var(--expense)' }} />Saídas</span>
          </div>
        </div>
        <YearChart data={data} highlight={selected ?? ''} />
      </section>

      <section className="card" aria-labelledby="hist-meses">
        <div className="card-head">
          <h2 id="hist-meses">Mês a mês</h2>
          <span className="sub">{banks && 'Saídas = dos bancos + por você · '}Clique num mês para ver os gastos</span>
        </div>
        <div className="table-wrap">
          <table className="history-table" style={{ minWidth: banks ? 900 : 520 }}>
            <thead>
              {banks && (
                <tr>
                  <th colSpan={4} aria-hidden="true" />
                  <th colSpan={4} scope="colgroup" className="group g-bank"><span><Icon name="bank" size={14} stroke={2.4} />Dos bancos</span></th>
                  <th className="g-gap" aria-hidden="true" />
                  <th scope="colgroup" className="group g-you"><span><Icon name="pencil" size={14} stroke={2.4} />Por você</span></th>
                </tr>
              )}
              <tr>
                <th>Mês</th>
                <th className="r">Entradas</th>
                <th className="r">Saídas</th>
                <th className="r">Resultado</th>
                {banks && (
                  <>
                    {MAIN_METHODS.map((k) => <th key={k} className="r g-bank">{METHOD_LABELS[k]}</th>)}
                    <th className="r g-bank">Outros</th>
                    <th className="g-gap" aria-hidden="true" />
                    <th className="r g-you">Contas pagas</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {data.months.map((m, i) => {
                const future = m.month > thisMonth;
                const result = m.income - m.expenses;
                const cell = (v: number) => (m.hasData ? orDash(v) : '—');
                return (
                  <tr key={m.month} className={`${m.month === selected ? 'selected' : ''} ${m.hasData ? '' : 'empty'}`}>
                    <td>
                      <button type="button" className="month-link" disabled={!m.hasData} onClick={() => setSelected(m.month)}
                        aria-pressed={m.month === selected}>
                        {MONTH_NAMES[i]}
                      </button>
                      {!m.hasData && <small className="muted"> {future ? 'por vir' : 'sem dados'}</small>}
                    </td>
                    <td className="num">{m.hasData ? money(m.income) : '—'}</td>
                    <td className="num" style={{ fontWeight: 800 }}>{m.hasData ? money(m.expenses) : '—'}</td>
                    <td className={`num ${m.hasData ? (result >= 0 ? 'good-text' : 'error-text') : ''}`}>{m.hasData ? money(result) : '—'}</td>
                    {banks && (
                      <>
                        {MAIN_METHODS.map((k) => <td key={k} className="num muted g-bank">{cell(m.byMethod[k] ?? 0)}</td>)}
                        <td className="num muted g-bank">{cell(other(m))}</td>
                        <td className="g-gap" aria-hidden="true" />
                        <td className="num muted g-you">{cell(m.manual)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{money(data.totals.income)}</td>
                <td className="num">{money(data.totals.expenses)}</td>
                <td className={`num ${data.totals.result >= 0 ? 'good-text' : 'error-text'}`}>{money(data.totals.result)}</td>
                {banks && (
                  <>
                    {MAIN_METHODS.map((k) => <td key={k} className="num g-bank">{orDash(sum((m) => m.byMethod[k] ?? 0))}</td>)}
                    <td className="num g-bank">{orDash(sum(other))}</td>
                    <td className="g-gap" aria-hidden="true" />
                    <td className="num g-you">{orDash(data.totals.manual)}</td>
                  </>
                )}
              </tr>
              {banks && (
                <tr className="group-totals">
                  <td colSpan={4} />
                  <td colSpan={4} className="g-bank">{money(data.totals.bank)} dos bancos</td>
                  <td className="g-gap" aria-hidden="true" />
                  <td className="g-you">{money(data.totals.manual)} por você</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </section>

      {selected && <MonthDetail month={selected} version={version} openMonth={openMonth} />}
    </div>
  );
}

type TopItem = { key: string; description: string; amount: number; date: string; where: string; source: Source; method?: Method };

function MonthDetail({ month, version, openMonth }: { month: string; version: number; openMonth: PageProps['openMonth'] }) {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);

  useEffect(() => {
    api.get<Dashboard>(`/dashboard?month=${month}`).then(setDash, () => setDash(null));
    api.get<Transaction[]>(`/transactions?month=${month}&flow=OUT&ignored=hide`).then(setTxs, () => setTxs([]));
  }, [month, version]);

  if (!dash) return null;
  // Maiores gastos das duas origens juntas, cada um com a sua etiqueta.
  const top: TopItem[] = [
    ...txs.map((t): TopItem => ({ key: t.id, description: t.description, amount: t.amount, date: t.date, where: t.account_label, source: 'bank', method: t.method })),
    ...dash.expenses.manual.items.map((b): TopItem => ({ key: `b${b.id}`, description: b.description, amount: b.amount, date: b.paid_at, where: 'Contas a pagar', source: 'you' })),
  ].sort((a, b) => b.amount - a.amount).slice(0, TOP_EXPENSES);

  return (
    <section className="card" aria-labelledby="hist-detalhe">
      <div className="card-head">
        <div>
          <h2 id="hist-detalhe" className="cap">{monthLabel(month)}</h2>
          <span className="sub">
            Entradas {money(dash.income.total)} · Saídas {money(dash.expenses.total)} ·{' '}
            <b className={dash.result >= 0 ? 'good-text' : 'error-text'}>Resultado {money(dash.result)}</b>
          </span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => openMonth(month, 'dashboard')}>Abrir no dashboard</button>
          {dash.hasBanks && <button className="btn" onClick={() => openMonth(month, 'lancamentos')}>Ver todos os lançamentos</button>}
        </div>
      </div>

      <SpendBySource data={dash} />

      <div className="stack" style={{ gap: 4 }}>
        <h3>Maiores gastos</h3>
        {top.length === 0 ? <p className="muted">Nenhum gasto neste mês.</p> : (
          <ul className="list">
            {top.map((t) => (
              <li key={t.key}>
                {t.method ? <MethodBadge method={t.method} /> : <SourceIcon source="you" size={30} />}
                <span className="grow">
                  <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</b>
                  <small>
                    {shortDate(t.date)} ·{' '}
                    <span className={t.source === 'bank' ? 'src-bank-text' : 'src-you-text'}>
                      {t.source === 'bank' ? `Banco · ${t.where}` : `Por você · ${t.where}`}
                    </span>
                  </small>
                </span>
                <span className="num">{money(t.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
