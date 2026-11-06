import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './icons.tsx';

/**
 * Painel que sobe de baixo no celular (e abre no centro na web). Usa <dialog>: o Esc, o foco preso dentro
 * e o fundo escurecido vêm do navegador. Tocar fora do painel fecha.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog ref={ref} className="sheet" aria-labelledby="sheet-titulo" onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current.close()}>
      <div className="sheet-body">
        <span className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id="sheet-titulo">{title}</h2>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={() => ref.current?.close()}>
            <Icon name="close" size={20} stroke={2.2} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
