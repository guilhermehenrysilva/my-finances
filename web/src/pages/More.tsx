import type { Status } from '../api.ts';
import { relativeTime } from '../format.ts';
import { Icon, type IconName } from '../icons.tsx';
import { useInstall } from '../install.ts';
import { ThemePicker } from '../theme.tsx';
import type { PageId, PageProps } from '../App.tsx';

const LINKS: { id: PageId; icon: IconName; label: string; sub: string; tone: string }[] = [
  { id: 'entradas', icon: 'up', label: 'Entradas', sub: 'Quanto entrou no mês', tone: 'i-income' },
  { id: 'historico', icon: 'calendar', label: 'Histórico', sub: 'Mês a mês, ano a ano', tone: 'i-neutral' },
  { id: 'config', icon: 'settings', label: 'Configurações', sub: 'Bancos, contas, regras e backup', tone: 'i-neutral' },
];

type Props = PageProps & { status: Status | null; busy: boolean; onSync: () => void };

/** Tela "Mais" do celular: o que não cabe nas abas de baixo. */
export function MorePage({ pluggy, status, busy, onSync }: Props) {
  const install = useInstall();

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card more-card" aria-label="Bancos">
        {pluggy.ready ? (
          <div className="more-row">
            <span className="grow">
              <b className="status-line"><span className="status-dot" aria-hidden="true" />{status?.connections ?? 0} banco(s) conectado(s)</b>
              <small className={status?.lastError ? 'error-text' : 'muted'}>
                {status?.lastError ? 'Falha na última atualização' : `Atualizados ${relativeTime(status?.lastSyncAt ?? null)}`}
              </small>
            </span>
            <button className="btn btn-ghost" onClick={onSync} disabled={busy}>{busy ? 'Atualizando…' : 'Atualizar'}</button>
          </div>
        ) : (
          <div className="more-row">
            <span className="grow">
              <b>Nenhum banco conectado</b>
              <small className="muted">Opcional: traz cartões e Pix sozinhos</small>
            </span>
            <a className="btn btn-ghost link-as-btn" href="#/config">Conectar</a>
          </div>
        )}
      </section>

      <nav className="card more-card more-nav" aria-label="Outras telas">
        <ul className="more-links">
          {LINKS.map((l) => (
            <li key={l.id}>
              <a href={`#/${l.id}`}>
                <span className={`tile-icon ${l.tone}`}><Icon name={l.icon} size={18} stroke={2.2} /></span>
                <span className="grow"><b>{l.label}</b><small>{l.sub}</small></span>
                <Icon name="chevronRight" size={18} stroke={2.2} />
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section className="card more-card" aria-labelledby="aparencia-titulo">
        <h2 id="aparencia-titulo">Aparência</h2>
        <ThemePicker />
      </section>

      {install.state === 'available' && (
        <section className="install-card" aria-label="Instalar o app">
          <span><b>Use como app.</b> Coloque o Financeiro na tela inicial e abra sem a barra do navegador.</span>
          <button className="btn" onClick={install.install}>Instalar</button>
        </section>
      )}
      {install.state === 'ios' && (
        <section className="install-card" aria-label="Instalar o app">
          <span><b>Use como app.</b> No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.</span>
        </section>
      )}
    </div>
  );
}
