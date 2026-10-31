import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Status } from './api.ts';
import { currentMonth, monthLabel, monthName, relativeTime, shiftMonth, shortMonthLabel } from './format.ts';
import { Icon, type IconName } from './icons.tsx';
import { DashboardPage } from './pages/Dashboard.tsx';
import { TransactionsPage } from './pages/Transactions.tsx';
import { HistoryPage } from './pages/History.tsx';
import { ForecastPage } from './pages/Forecast.tsx';
import { BillsPage } from './pages/Bills.tsx';
import { IncomesPage } from './pages/Incomes.tsx';
import { SettingsPage } from './pages/Settings.tsx';

const PAGES = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'lancamentos', label: 'Lançamentos', icon: 'list' },
  { id: 'historico', label: 'Histórico', icon: 'calendar' },
  { id: 'previsao', label: 'Parcelas e previsão', icon: 'layers' },
  { id: 'contas', label: 'Contas a pagar', icon: 'check' },
  { id: 'entradas', label: 'Entradas', icon: 'up' },
  { id: 'config', label: 'Configurações', icon: 'settings' },
] as const satisfies readonly { id: string; label: string; icon: IconName }[];
type PageId = (typeof PAGES)[number]['id'];

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
    case 'contas': return { eyebrow: 'Checklist do mês', title: 'Contas a pagar' };
    case 'entradas': return { eyebrow: 'O único dado que você digita', title: `Entradas de ${monthName(month)}` };
    case 'config': return { eyebrow: 'Bancos, contas e regras', title: 'Configurações' };
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

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
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

  // Mantém o rodapé atualizado ("há X min") e percebe a sincronização automática do servidor.
  useEffect(() => {
    const id = setInterval(loadStatus, STATUS_POLL_MS);
    return () => clearInterval(id);
  }, [loadStatus]);

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
  const showMonth = page !== 'config' && page !== 'historico' && page !== 'previsao';
  const busy = syncing || !!status?.syncing;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">R$</span>Financeiro</div>
        <nav aria-label="Navegação principal">
          {PAGES.map((p) => (
            <a key={p.id} href={`#/${p.id}`} className={p.id === page ? 'active' : ''} aria-current={p.id === page ? 'page' : undefined}>
              <Icon name={p.icon} />
              {p.label}
            </a>
          ))}
        </nav>
        {pluggy.ready ? (
          <div className="sync">
            <span className="sync-label">Última sincronização</span>
            <span className="sync-value">{relativeTime(status?.lastSyncAt ?? null)}</span>
            {status?.lastError && <small className="error-text" title={status.lastError}>Falha na última sincronização</small>}
            <button className="btn" onClick={sync} disabled={busy}>
              {busy ? 'Sincronizando…' : 'Sincronizar agora'}
            </button>
          </div>
        ) : (
          // Sem banco conectado o app funciona só com o que é cadastrado; os bancos são um extra.
          <div className="sync">
            <span className="sync-label">Bancos · opcional</span>
            <span className="sync-value">Nenhum banco conectado</span>
            <a className="link-btn" href="#/config">Conectar o Meu Pluggy</a>
          </div>
        )}
      </aside>

      <main className="content">
        <header className="page-head">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
          </div>
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
        </header>
        {page === 'dashboard' && <DashboardPage {...props} />}
        {page === 'lancamentos' && <TransactionsPage {...props} />}
        {page === 'historico' && <HistoryPage {...props} />}
        {page === 'previsao' && <ForecastPage {...props} />}
        {page === 'contas' && <BillsPage {...props} />}
        {page === 'entradas' && <IncomesPage {...props} />}
        {page === 'config' && <SettingsPage {...props} />}
      </main>
    </div>
  );
}
