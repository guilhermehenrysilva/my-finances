import { useSyncExternalStore } from 'react';

/** true enquanto a media query casar; acompanha giro de tela e redimensionamento. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = matchMedia(query);
      m.addEventListener('change', onChange);
      return () => m.removeEventListener('change', onChange);
    },
    () => matchMedia(query).matches,
  );
}

/** Celular: abas embaixo, listas no lugar das tabelas largas. Mesmo corte do CSS (767px). */
export const useIsMobile = () => useMedia('(max-width: 767px)');
