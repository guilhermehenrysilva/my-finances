import { useState } from 'react';
import type { YearSummary } from './api.ts';
import { compactMoney, money } from './format.ts';
import { useIsMobile } from './useMedia.ts';

const TOP = 20;
const BASE = 250;
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// No celular o desenho é mais estreito (600 em vez de 1000): ao encolher para a tela, letras e pontos
// continuam legíveis.
const GEOMETRY = {
  wide: { W: 1000, H: 290, X0: 64, X1: 980, font: 13, labelY: 276, r: 4.5, rOn: 6.5, line: 2.5 },
  narrow: { W: 600, H: 300, X0: 92, X1: 580, font: 22, labelY: 290, r: 6.5, rOn: 9, line: 4 },
};

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
  const g = useIsMobile() ? GEOMETRY.narrow : GEOMETRY.wide;
  const stepX = (g.X1 - g.X0) / 11;
  const top = niceMax(Math.max(...data.months.filter((m) => m.hasData).flatMap((m) => [m.income, m.expenses]), 0));
  const y = (v: number) => BASE - (v / top) * (BASE - TOP);
  const x = (i: number) => g.X0 + i * stepX;
  const font = { fontSize: g.font };

  const inc = data.months.map((m, i) => (m.hasData ? { i, x: x(i), y: y(m.income) } : null));
  const exp = data.months.map((m, i) => (m.hasData ? { i, x: x(i), y: y(m.expenses) } : null));
  const incSegs = segments(inc);
  const expSegs = segments(exp);
  const ticks = [0, 1, 2, 3, 4].map((k) => (top / 4) * k);
  const hasAny = data.months.some((m) => m.hasData);

  const last = [...data.months.keys()].filter((i) => data.months[i].hasData).pop();
  const lastInc = last !== undefined ? inc[last]! : null;
  const lastExp = last !== undefined ? exp[last]! : null;
  // O rótulo ao lado da linha só cabe no desenho largo.
  const showDirect = g === GEOMETRY.wide && lastInc && lastExp && last! < 11 && Math.abs(lastInc.y - lastExp.y) >= 16;

  const hovered = hover !== null && data.months[hover].hasData ? data.months[hover] : null;
  // Ao lado da linha do mês (à esquerda perto da borda direita), na altura média dos dois pontos.
  const tipLeft = hover !== null ? (x(hover) / g.W) * 100 : 0;
  const tipSide = tipLeft > 55 ? 'translate(calc(-100% - 14px), -50%)' : 'translate(14px, -50%)';
  const tipTop = hovered ? (((y(hovered.income) + y(hovered.expenses)) / 2) / g.H) * 100 : 0;

  return (
    <figure className="year-chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img"
        aria-label={`Gráfico de linhas de ${data.year}: entradas e saídas de cada mês. A tabela com os valores está logo abaixo para leitores de tela.`}>
        <g className="grid">
          {ticks.slice(1).map((t) => <line key={t} x1={g.X0} x2={g.X1} y1={y(t)} y2={y(t)} />)}
        </g>
        <line x1={g.X0} x2={g.X1} y1={BASE} y2={BASE} stroke="var(--border)" />
        {ticks.map((t) => (
          <text key={t} className="axis-label" style={font} x={g.X0 - 12} y={y(t) + g.font * 0.3} textAnchor="end">{compactMoney(t)}</text>
        ))}
        {MONTHS.map((label, i) => (
          <text key={label} className={`axis-label${data.months[i].month === highlight ? ' current' : ''}`} style={font} x={x(i)} y={g.labelY} textAnchor="middle">
            {label}
          </text>
        ))}

        {incSegs.map((seg, k) => {
          const below = expSegs[k] ?? [];
          if (seg.length < 2 || below.length !== seg.length) return null;
          return <polygon key={k} points={`${toPath(seg)} ${toPath([...below].reverse())}`} fill="var(--good)" fillOpacity="0.1" />;
        })}

        {hover !== null && data.months[hover].hasData && (
          <line x1={x(hover)} x2={x(hover)} y1={TOP} y2={BASE} stroke="var(--muted)" strokeDasharray="3 4" />
        )}

        {incSegs.map((seg, k) => seg.length > 1 && (
          <polyline key={k} points={toPath(seg)} fill="none" stroke="var(--income)" strokeWidth={g.line} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {expSegs.map((seg, k) => seg.length > 1 && (
          <polyline key={k} points={toPath(seg)} fill="none" stroke="var(--expense)" strokeWidth={g.line} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {inc.map((p) => p && <circle key={`i${p.i}`} cx={p.x} cy={p.y} r={p.i === hover ? g.rOn : g.r} fill="var(--income)" stroke="var(--surface)" strokeWidth="2" />)}
        {exp.map((p) => p && <circle key={`e${p.i}`} cx={p.x} cy={p.y} r={p.i === hover ? g.rOn : g.r} fill="var(--expense)" stroke="var(--surface)" strokeWidth="2" />)}

        {showDirect && (
          <g fontSize="13" fontWeight="700">
            <text x={lastInc!.x + 14} y={lastInc!.y + 5} fill="var(--income-ink)">Entradas</text>
            <text x={lastExp!.x + 14} y={lastExp!.y + 5} fill="var(--expense-ink)">Saídas</text>
          </g>
        )}

        {MONTHS.map((label, i) => (
          <rect key={label} className="hit" x={x(i) - stepX / 2} y={TOP - 10} width={stepX} height={BASE - TOP + 40}
            onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
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
