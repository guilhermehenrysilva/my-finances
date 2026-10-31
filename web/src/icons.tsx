// Ícones de traço, herdam a cor do texto (currentColor).
import type { Method } from './api.ts';

const PATHS = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></>,
  list: <><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></>,
  check: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  up: <><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></>,
  down: <><path d="M12 5v14" /><path d="M19 12l-7 7-7-7" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3" /><path d="M12 19v3" /><path d="M2 12h3" /><path d="M19 12h3" /><path d="M4.9 4.9l2.1 2.1" /><path d="M17 17l2.1 2.1" /><path d="M4.9 19.1L7 17" /><path d="M17 7l2.1-2.1" /></>,
  trend: <><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></>,
  trendDown: <><path d="M3 7l6 6 4-4 8 8" /><path d="M14 17h7v-7" /></>,
  wallet: <><rect x="2" y="6" width="20" height="14" rx="3" /><path d="M2 10h20" /><path d="M16 15h2" /></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20" /></>,
  pix: <><path d="M12 2l4 4-4 4-4-4z" /><path d="M12 14l4 4-4 4-4-4z" /><path d="M2 12l4-4 4 4-4 4z" /><path d="M14 12l4-4 4 4-4 4z" /></>,
  barcode: <><path d="M4 5v14" /><path d="M8 5v14" /><path d="M11 5v14" /><path d="M15 5v14" /><path d="M18 5v14" /><path d="M21 5v14" /></>,
  transfer: <><path d="M7 7h13l-4-4" /><path d="M17 17H4l4 4" /></>,
  dots: <><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>,
  chevronLeft: <path d="M15 18l-6-6 6-6" />,
  chevronRight: <path d="M9 18l6-6-6-6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  tick: <path d="M20 6L9 17l-5-5" />,
  refresh: <><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>,
  close: <><path d="M18 6L6 18" /><path d="M6 6l12 12" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /><path d="M3 18l9 5 9-5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /><path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" /><path d="M8 18h.01" /><path d="M12 18h.01" /></>,
  download: <><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></>,
  upload: <><path d="M12 21V9" /><path d="M7 14l5-5 5 5" /><path d="M5 3h14" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

/** Ícone de informação: a explicação aparece ao passar o mouse ou focar com o teclado. */
export function Hint({ text }: { text: string }) {
  return (
    <span className="hint" tabIndex={0} aria-label={text}>
      <Icon name="info" size={16} stroke={2.2} />
      <span className="hint-tip" role="tooltip">{text}</span>
    </span>
  );
}

export const METHOD_ICONS: Record<Method, IconName> = {
  CARTAO: 'card',
  PIX: 'pix',
  TED: 'transfer',
  BOLETO: 'barcode',
  DEBITO: 'card',
  OUTRO: 'dots',
};

/** Ícone do meio de pagamento num quadradinho colorido. */
export function MethodBadge({ method, size = 30 }: { method: Method; size?: number }) {
  return (
    <span className={`method-badge m-${method.toLowerCase()}`} style={{ width: size, height: size }}>
      <Icon name={METHOD_ICONS[method]} size={Math.round(size * 0.53)} stroke={2.2} />
    </span>
  );
}

const AVATAR_COLORS = ['#8A2BE2', '#1F66C9', '#D03B3B', '#17163A', '#0E8F5E', '#C2410C', '#BE185D'];

/** Avatar com as iniciais do banco; a cor é fixa por nome. */
export function BankAvatar({ label }: { label: string }) {
  let hash = 0;
  for (const ch of label) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const initials = label.replace(/[^A-Za-zÀ-ú0-9 ]/g, '').split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2)
    || label.slice(0, 2);
  return (
    <span className="bank-avatar" style={{ background: AVATAR_COLORS[hash % AVATAR_COLORS.length] }} aria-hidden="true">
      {initials.length === 1 ? label.slice(0, 2) : initials}
    </span>
  );
}
