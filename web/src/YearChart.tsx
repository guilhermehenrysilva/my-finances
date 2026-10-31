import { useState } from 'react';
import type { YearSummary } from './api.ts';
import { compactMoney, money } from './format.ts';

const W = 1000;
const H = 290;
const X0 = 64;
const X1 = 980;
const TOP = 20;
const BASE = 250;
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const STEP_X = (X1 - X0) / 11;

/** Topo do eixo com 4 divisões "redondas" (1, 2, 2,5 ou 5 × 10^n). */
function niceMax(v: number): number {
  if (v <= 0) return 1000;
  const raw = v / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return step * 4;
}

type Pt = { i: number; x: number; y: number };

/** Meses com dados viram trechos contínuos; um mês vazio quebra a linha. */
function segments(points: (Pt | null)[]): Pt[][] {
  const out: Pt[][] = [];
  let run: Pt[] = [];
  for (const p of points) {
    if (p) run.push(p);
    else if (run.length) { out.push(run); run = []; }
  }
  if (run.length) out.push(run);
  return out;
}

const toPath = (pts: Pt[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

export function YearChart({ data, highlight }: { data: YearSummary; highlight: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const top = niceMax(Math.max(...data.months.filter((m) => m.hasData).flatMap((m) => [m.income, m.expenses]), 0));
  const y = (v: number) => BASE - (v / top) * (BASE - TOP);
  const x = (i: number) => X0 + i * STEP_X;

  const inc = data.months.map((m, i) => (m.hasData ? { i, x: x(i), y: y(m.income) } : null));
  const exp = data.months.map((m, i) => (m.hasData ? { i, x: x(i), y: y(m.expenses) } : null));
  const incSegs = segments(inc);
  const expSegs = segments(exp);
  const ticks = [0, 1, 2, 3, 4].map((k) => (top / 4) * k);
  const hasAny = data.months.some((m) => m.hasData);

  const last = [...data.months.keys()].filter((i) => data.months[i].hasData).pop();
  const lastInc = last !== undefined ? inc[last]! : null;
  const lastExp = last !== undefined ? exp[last]! : null;
  const showDirect = lastInc && lastExp && last! < 11 && Math.abs(lastInc.y - lastExp.y) >= 16;

  const hovered = hover !== null && data.months[hover].hasData ? data.months[hover] : null;
  // Ao lado da linha do mês (à esquerda perto da borda direita), na altura média dos dois pontos.
  const tipLeft = hover !== null ? (x(hover) / W) * 100 : 0;
  const tipSide = tipLeft > 70 ? 'translate(calc(-100% - 14px), -50%)' : 'translate(14px, -50%)';
  const tipTop = hovered ? (((y(hovered.income) + y(hovered.expenses)) / 2) / H) * 100 : 0;

  return (
    <figure className="year-chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Gráfico de linhas de ${data.year}: entradas e saídas de cada mês. A tabela com os valores está logo abaixo para leitores de tela.`}>
        <g className="grid">
          {ticks.slice(1).map((t) => <line key={t} x1={X0} x2={X1} y1={y(t)} y2={y(t)} />)}
        </g>
        <line x1={X0} x2={X1} y1={BASE} y2={BASE} stroke="#D4D5E3" />
        {ticks.map((t) => (
          <text key={t} className="axis-label" x={X0 - 12} y={y(t) + 4} textAnchor="end">{compactMoney(t)}</text>
        ))}
        {MONTHS.map((label, i) => (
          <text key={label} className={`axis-label${data.months[i].month === highlight ? ' current' : ''}`} x={x(i)} y={276} textAnchor="middle">
            {label}
          </text>
        ))}

        {incSegs.map((seg, k) => {
          const below = expSegs[k] ?? [];
          if (seg.length < 2 || below.length !== seg.length) return null;
          return <polygon key={k} points={`${toPath(seg)} ${toPath([...below].reverse())}`} fill="var(--good)" fillOpacity="0.08" />;
        })}

        {hover !== null && data.months[hover].hasData && (
          <line x1={x(hover)} x2={x(hover)} y1={TOP} y2={BASE} stroke="#B9BAD0" strokeDasharray="3 4" />
        )}

        {incSegs.map((seg, k) => seg.length > 1 && (
          <polyline key={k} points={toPath(seg)} fill="none" stroke="var(--income)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {expSegs.map((seg, k) => seg.length > 1 && (
          <polyline key={k} points={toPath(seg)} fill="none" stroke="var(--expense)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {inc.map((p) => p && <circle key={`i${p.i}`} cx={p.x} cy={p.y} r={p.i === hover ? 6.5 : 4.5} fill="var(--income)" stroke="#fff" strokeWidth="2" />)}
        {exp.map((p) => p && <circle key={`e${p.i}`} cx={p.x} cy={p.y} r={p.i === hover ? 6.5 : 4.5} fill="var(--expense)" stroke="#fff" strokeWidth="2" />)}

        {showDirect && (
          <g fontSize="13" fontWeight="700">
            <text x={lastInc!.x + 14} y={lastInc!.y + 5} fill="var(--income-ink)">Entradas</text>
            <text x={lastExp!.x + 14} y={lastExp!.y + 5} fill="var(--expense-ink)">Saídas</text>
          </g>
        )}

        {MONTHS.map((label, i) => (
          <rect key={label} className="hit" x={x(i) - STEP_X / 2} y={TOP - 10} width={STEP_X} height={BASE - TOP + 40}
            onMouseEnter={() => setHover(i)} />
        ))}
      </svg>

      {!hasAny && <div className="year-empty">Sem dados em {data.year} ainda. As linhas aparecem conforme os meses tiverem entradas e lançamentos.</div>}

      {hovered && (
        <div className="chart-tip" style={{ left: `${tipLeft}%`, top: `${tipTop}%`, transform: tipSide }}>
          <strong>{MONTHS[hover!]} {data.year}</strong>
          <div><span>Entradas</span><b>{money(hovered.income)}</b></div>
          <div><span>Saídas</span><b>{money(hovered.expenses)}</b></div>
          <div><span>Sobra</span><b>{money(hovered.income - hovered.expenses)}</b></div>
        </div>
      )}

      <table className="sr-only">
        <caption>Entradas e saídas por mês em {data.year}</caption>
        <thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th></tr></thead>
        <tbody>
          {data.months.filter((m) => m.hasData).map((m) => (
            <tr key={m.month}><td>{MONTHS[Number(m.month.slice(5)) - 1]}</td><td>{money(m.income)}</td><td>{money(m.expenses)}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
