import { useSyncExternalStore } from 'react';

// Instalar como app (PWA). O navegador avisa uma vez, logo ao abrir, que dá para instalar: o aviso é guardado
// aqui para o botão "Instalar" da tela Mais. Por isso este arquivo é importado cedo, no main.tsx.

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPrompt;
  notify();
});
addEventListener('appinstalled', () => {
  deferred = null;
  notify();
});

const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export type InstallState = 'installed' | 'available' | 'ios' | 'unavailable';

function state(): InstallState {
  if (standalone()) return 'installed';
  if (deferred) return 'available';
  // O Safari do iPhone não tem o aviso: instala-se pelo menu Compartilhar.
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return 'ios';
  return 'unavailable';
}

export function useInstall(): { state: InstallState; install: () => Promise<void> } {
  const s = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, state);
  return {
    state: s,
    install: async () => {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      notify();
    },
  };
}
