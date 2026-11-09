import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { EASE } from './motion';

/** Arkusz od dołu: pułapka fokusu, Escape zamyka, fokus wraca do przycisku, który go otworzył. */
export function Sheet({ open, onClose, title, eyebrow, children }: { open: boolean; onClose: () => void; title: string; eyebrow?: string; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>('button, [href], input')?.focus(), 60);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    addEventListener('keydown', key);
    return () => { clearTimeout(t); removeEventListener('keydown', key); (opener.current as HTMLElement | null)?.focus?.(); };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button aria-label="Zamknij" className="absolute inset-0 bg-ink-0/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            ref={panel} role="dialog" aria-modal="true" aria-label={title}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ duration: 0.5, ease: EASE }}
            className="gutter safe-bottom relative max-h-[86%] w-full max-w-[560px] overflow-y-auto rounded-t-[28px] border border-line bg-ink-1 pt-6"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex flex-col gap-2">
                {eyebrow && <span className="eyebrow">{eyebrow}</span>}
                <h2 className="font-display text-[28px] font-extrabold leading-none tracking-tight">{title}</h2>
              </div>
              <button onClick={onClose} aria-label="Zamknij" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-muted hover:text-milk"><X size={18} /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
