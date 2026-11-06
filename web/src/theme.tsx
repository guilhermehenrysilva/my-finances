import { useState } from 'react';

/** Aparência do app: escuro (padrão), claro ou automático (segue o sistema). Fica guardada só neste navegador. */
export type ThemeChoice = 'escuro' | 'claro' | 'auto';

const KEY = 'financeiro.tema';
const systemDark = matchMedia('(prefers-color-scheme: dark)');

export function getTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'escuro' || v === 'claro' || v === 'auto') return v;
  } catch { /* sem acesso ao armazenamento: fica no padrão */ }
  return 'escuro';
}

/** Põe data-theme no <html> (o CSS troca as cores por ele) e ajusta a cor da barra do navegador no celular. */
export function applyTheme(choice: ThemeChoice = getTheme()) {
  const dark = choice === 'escuro' || (choice === 'auto' && systemDark.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0E1110' : '#F3F5F4');
}

systemDark.addEventListener('change', () => getTheme() === 'auto' && applyTheme());

const OPTIONS: { id: ThemeChoice; label: string }[] = [
  { id: 'escuro', label: 'Escuro' },
  { id: 'claro', label: 'Claro' },
  { id: 'auto', label: 'Automático' },
];

export function ThemePicker() {
  const [choice, setChoice] = useState(getTheme);
  function pick(c: ThemeChoice) {
    try { localStorage.setItem(KEY, c); } catch { /* vale só até fechar a aba */ }
    setChoice(c);
    applyTheme(c);
  }
  return (
    <div className="segmented segmented-full" role="group" aria-label="Aparência">
      {OPTIONS.map((o) => (
        <button key={o.id} type="button" aria-pressed={choice === o.id} onClick={() => pick(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}
