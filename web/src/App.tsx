import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Dashboard, type Status } from './api.ts';
import { currentMonth, monthLabel, monthName, relativeTime, shiftMonth, shortMonthLabel } from './format.ts';
import { Icon, type IconName } from './icons.tsx';
import { useIsMobile } from './useMedia.ts';
import { DashboardPage } from './pages/Dashboard.tsx';
import { TransactionsPage } from './pages/Transactions.tsx';
import { HistoryPage } from './pages/History.tsx';
import { ForecastPage } from './pages/Forecast.tsx';
import { BillsPage } from './pages/Bills.tsx';
import { IncomesPage } from './pages/Incomes.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { MorePage } from './pages/More.tsx';

// Na ordem do que mais se usa: ver o mês, marcar contas pagas, conferir lançamentos.
const PAGES = [
  { id: 'dashboard', label: 'Início', icon: 'home' },
  { id: 'contas', label: 'Contas a pagar', short: 'Contas', icon: 'check' },
  { id: 'lancamentos', label: 'Lançamentos', icon: 'list' },
  { id: 'previsao', label: 'Parcelas e previsão', short: 'Previsão', icon: 'layers' },
  { id: 'historico', label: 'Histórico', icon: 'calendar' },
  { id: 'entradas', label: 'Entradas', icon: 'up' },
  { id: 'config', label: 'Configurações', icon: 'settings' },
  { id: 'mais', label: 'Mais', icon: 'dots' },
] as const satisfies readonly { id: string; label: string; short?: string; icon: IconName }[];
export type PageId = (typeof PAGES)[number]['id'];

/** Abas do celular. As outras telas ficam em "Mais". */
const TABS: PageId[] = ['dashboard', 'contas', 'lancamentos', 'previsao', 'mais'];
const IN_MORE: PageId[] = ['historico', 'entradas', 'config', 'mais'];

const STATUS_POLL_MS = 30_000;

function pageFromHash(): PageId {
  const id = location.hash.replace('#/', '');
  return PAGES.some((p) => p.id === id) ? (id as PageId) : 'dashboard';
}

/** Linha de apoio e título de cada página. */
function heading(page: PageId, month: string): { eyebrow: string; title: string } {
  switch (page) {
    case 'dashboard': return { eyebrow: 'Olá! Este é o seu mês', title: monthLabel(month) };
    case 'lancamentos': return { eyebrow: 'Tudo que veio dos bancos', title: `Lançamentos de ${monthName(month)}` };
    case 'historico': return { eyebrow: 'Ano a ano, mês a mês', title: 'Histórico' };
    case 'previsao': return { eyebrow: 'O que já está comprometido nos próximos meses', title: 'Parcelas e previsão' };
    case 'contas': return { eyebrow: 'Toque no quadrado quando pagar', title: 'Contas a pagar' };
    case 'entradas': return { eyebrow: 'O único dado que você digita', title: `Entradas de ${monthName(month)}` };
    case 'config': return { eyebrow: 'Bancos, contas e regras', title: 'Configurações' };
    case 'mais': return { eyebrow: 'Outras telas e ajustes', title: 'Mais' };
  }
}

export type PageProps = {
  month: string;
  version: number;
  refresh: () => void;
  navigate: (page: PageId) => void;
  /** Troca o mês selecionado e abre a página (ex.: do Histórico para os Lançamentos). */
  openMonth: (month: string, page: PageId) => void;
  /** Meu Pluggy pronto (credenciais + ao menos um banco) — controla o selo "Funcionalidade MeuPluggy". */
  pluggy: { ready: boolean; configured: boolean };
};

export function App() {
  const [page, setPage] = useState<PageId>(pageFromHash);
  const [month, setMonth] = useState(currentMonth);
  const [status, setStatus] = useState<Status | null>(null);
  const [version, setVersion] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [overdue, setOverdue] = useState(0);
  const mobile = useIsMobile();

  useEffect(() => {
    const onHash = () => {
      setPage(pageFromHash());
      scrollTo(0, 0);
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const lastSyncSeen = useRef<string | null | undefined>(undefined);

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.get<Status>('/status');
      setStatus(s);
      // Uma sincronização terminou fora desta tela (automática ou por outra aba): recarrega os dados.
      if (lastSyncSeen.current !== undefined && s.lastSyncAt !== lastSyncSeen.current) refresh();
      lastSyncSeen.current = s.lastSyncAt;
    } catch {
      setStatus(null);
    }
  }, [refresh]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus, version, page]);

  // Mantém o "há X min" atualizado e percebe a sincronização automática do servidor.
  useEffect(() => {
    const id = setInterval(loadStatus, STATUS_POLL_MS);
    return () => clearInterval(id);
  }, [loadStatus]);

  // Contas vencidas deste mês: viram um número vermelho no menu de Contas a pagar.
  useEffect(() => {
    api.get<Dashboard>(`/dashboard?month=${currentMonth()}`).then((d) => setOverdue(d.bills.overdue), () => setOverdue(0));
  }, [version]);

  const navigate = (id: PageId) => (location.hash = `#/${id}`);

  async function sync() {
    setSyncing(true);
    try {
      await api.post('/sync');
    } finally {
      setSyncing(false);
      refresh();
    }
  }

  const openMonth = (m: string, target: PageId) => {
    setMonth(m);
    navigate(target);
  };

  // Enquanto o status não carregou, considera pronto para o selo não piscar na tela.
  const pluggy = { ready: status ? status.configured && status.connections > 0 : true, configured: status?.configured ?? true };
  const props: PageProps = { month, version, refresh, navigate, openMonth, pluggy };
  const { eyebrow, title } = heading(page, month);
  const showMonth = !['config', 'historico', 'previsao', 'mais'].includes(page);
  const busy = syncing || !!status?.syncing;
  const lastSync = relativeTime(status?.lastSyncAt ?? null);

  const badge = (id: PageId) => id === 'contas' && overdue > 0 && (
    <span className="nav-badge">{overdue}<span className="sr-only"> vencida(s)</span></span>
  );

  return (
    <div className="shell">
      {!mobile && (
        <aside className="sidebar">
          <div className="brand"><span className="brand-mark">R$</span><span className="nav-label">Financeiro</span></div>
          <nav aria-label="Navegação principal">
            {PAGES.filter((p) => p.id !== 'mais').map((p) => (
              <a key={p.id} href={`#/${p.id}`} className={p.id === page ? 'active' : ''} aria-current={p.id === page ? 'page' : undefined} title={p.label}>
                <span className="nav-icon"><Icon name={p.icon} />{badge(p.id)}</span>
                <span className="nav-label">{p.label}</span>
              </a>
            ))}
          </nav>
          {pluggy.ready ? (
            <div className="sync">
              <span className="sync-label nav-label">Bancos atualizados</span>
              <span className="sync-value nav-label">{lastSync}</span>
              {status?.lastError && <small className="error-text nav-label" title={status.lastError}>Falha na última atualização</small>}
              <button className="btn btn-ghost btn-icon" onClick={sync} disabled={busy} title={`Atualizar bancos · ${lastSync}`}>
                <Icon name="refresh" size={18} stroke={2.2} />
                <span className="nav-label">{busy ? 'Atualizando…' : 'Atualizar agora'}</span>
              </button>
            </div>
          ) : (
            // Sem banco conectado o app funciona só com o que é cadastrado; os bancos são um extra.
            <div className="sync">
              <span className="sync-label nav-label">Bancos · opcional</span>
              <span className="sync-value nav-label">Nenhum banco conectado</span>
              <a className="link-btn nav-label" href="#/config">Conectar o Meu Pluggy</a>
            </div>
          )}
        </aside>
      )}

      <main className="content">
        <header className="page-head">
          <div className="page-title">
            <span className="eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
          </div>
          <div className="head-actions">
            {showMonth && (
              <div className="month-switch">
                <button className="icon-btn" aria-label="Mês anterior" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
                  <Icon name="chevronLeft" stroke={2.2} />
                </button>
                <span>{shortMonthLabel(month)}</span>
                <button className="icon-btn" aria-label="Próximo mês" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
                  <Icon name="chevronRight" stroke={2.2} />
                </button>
                {month !== currentMonth() && (
                  <button className="link-btn" style={{ padding: '0 8px' }} onClick={() => setMonth(currentMonth())}>Hoje</button>
                )}
              </div>
            )}
            {mobile && pluggy.ready && page !== 'mais' && (
              <button type="button" className="sync-chip" onClick={sync} disabled={busy} aria-label={`Atualizar bancos. Última vez ${lastSync}`}>
                <Icon name="refresh" size={16} stroke={2.4} />{busy ? '…' : lastSync}
              </button>
            )}
          </div>
        </header>
        {page === 'dashboard' && <DashboardPage {...props} />}
        {page === 'lancamentos' && <TransactionsPage {...props} />}
        {page === 'historico' && <HistoryPage {...props} />}
        {page === 'previsao' && <ForecastPage {...props} />}
        {page === 'contas' && <BillsPage {...props} />}
        {page === 'entradas' && <IncomesPage {...props} />}
        {page === 'config' && <SettingsPage {...props} />}
        {page === 'mais' && <MorePage {...props} status={status} busy={busy} onSync={sync} />}
      </main>

      {mobile && (
        <nav className="tabbar" aria-label="Navegação principal">
          {TABS.map((id) => {
            const p = PAGES.find((x) => x.id === id)!;
            const active = id === page || (id === 'mais' && IN_MORE.includes(page));
            return (
              <a key={id} href={`#/${id}`} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
                <span className="nav-icon"><Icon name={p.icon} size={22} />{badge(id)}</span>
                {'short' in p ? p.short : p.label}
              </a>
            );
          })}
        </nav>
      )}
    </div>
  );
}
