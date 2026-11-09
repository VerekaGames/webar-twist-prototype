import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Hand, SwitchCamera, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { IS_MOBILE } from '@/lib/utils';
import { audio } from '@/services/audio';
import { delegate } from '@/services/handTracker';
import { exitAR, flipCamera, playWithTouch, retryCamera } from '@/services/session';
import { live, useGame } from '@/state/game';
import { IconButton } from './skiper/Button';
import { EASE } from './skiper/motion';

/**
 * Minimalna warstwa DOM w AR: instrukcje i postęp żyją w 3D (panele holo + pierścień).
 * Tu zostaje tylko to, co musi być dotykalne i dostępne: status, dźwięk, kamera, zamknij,
 * awaryjny tryb palca. Tekst panelu 3D jest powielony w aria-live dla czytników ekranu.
 */
const STATUS: Record<string, string> = {
  calibrating: 'Kalibracja', permission: 'Czekam na kamerę', 'show-hand': 'Szukam dłoni', twist: 'Dłoń wykryta',
  keep: 'Dłoń wykryta', edge: 'Dłoń przy krawędzi', lost: 'Szukam dłoni', touch: IS_MOBILE ? 'Tryb dotykowy' : 'Tryb myszy', won: 'Odkręcone',
};
const SR: Record<string, string> = {
  calibrating: 'Kalibruję śledzenie dłoni.', permission: 'Zezwól na kamerę.', 'show-hand': 'Pokaż dłoń w kadrze.', twist: 'Przekręć dłoń.',
  keep: 'Kręć dalej.', edge: 'Odsuń dłoń od krawędzi.', lost: 'Nie widzę dłoni.', touch: 'Kręć palcem dookoła ciastka.', won: 'Odkręcone!',
};

export function ArChrome() {
  const mode = useGame((s) => s.mode);
  const muted = useGame((s) => s.muted);
  const notice = useGame((s) => s.notice);
  const setMuted = useGame((s) => s.setMuted);
  const [panel, setPanel] = useState(live.panel);
  const fps = useRef<HTMLSpanElement>(null);
  const debug = typeof location !== 'undefined' && /[?&]debug/.test(location.search);

  // stan panelu 3D -> DOM co 250 ms (nie co klatkę)
  useEffect(() => {
    const id = setInterval(() => {
      setPanel(live.panel);
      if (fps.current) fps.current.textContent = `${Math.round(live.fps)} kl./s · ${useGame.getState().tier} · ${delegate}`;
    }, 250);
    return () => clearInterval(id);
  }, []);

  const ok = panel === 'twist' || panel === 'keep' || panel === 'touch' || panel === 'won';
  return (
    <motion.div key="chrome" className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between gutter safe-top safe-bottom"
      initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.5, duration: 0.6 } }} exit={{ opacity: 0, transition: { duration: 0.3 } }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-line bg-ink-0/60 px-3 py-2 text-[12.5px] font-semibold backdrop-blur-md">
            <i className={`h-2 w-2 rounded-full ${ok ? 'bg-ok shadow-[0_0_0_3px_rgba(69,224,160,0.2)]' : 'bg-warn shadow-[0_0_0_3px_rgba(255,207,74,0.2)]'}`} />
            {STATUS[panel]}
          </span>
          {debug && <span ref={fps} className="font-mono text-[11px] text-muted" />}
        </div>
        <div className="pointer-events-auto flex gap-2">
          <IconButton label={muted ? 'Włącz dźwięk' : 'Wycisz dźwięk'} aria-pressed={muted} onClick={() => { audio.unlock(); audio.setMuted(!muted); setMuted(!muted); }}>
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </IconButton>
          {IS_MOBILE && mode === 'camera' && <IconButton label="Przełącz kamerę" onClick={() => void flipCamera()}><SwitchCamera size={18} /></IconButton>}
          <IconButton label="Zamknij AR" onClick={exitAR}><X size={19} /></IconButton>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+78px)] flex justify-center gutter">
        <AnimatePresence>
          {notice && (
            <motion.p key={notice} role="alert" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: EASE }}
              className="w-full max-w-[420px] rounded-2xl border border-line bg-ink-1/90 p-3 text-center text-[13.5px] text-milk backdrop-blur-md">
              {notice}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <p className="sr-only" aria-live="polite">{SR[panel]}</p>

      <div className="pointer-events-auto flex justify-center">
        {mode === 'camera'
          ? <button onClick={playWithTouch} className="inline-flex items-center gap-2 rounded-full border border-line bg-ink-0/55 px-4 py-2.5 text-[13.5px] font-semibold text-milk backdrop-blur-md transition-transform hover:-translate-y-px active:scale-95"><Hand size={16} /> {IS_MOBILE ? 'Graj palcem' : 'Graj myszą'}</button>
          : <button onClick={() => void retryCamera()} className="inline-flex items-center gap-2 rounded-full border border-line bg-ink-0/55 px-4 py-2.5 text-[13.5px] font-semibold text-milk backdrop-blur-md transition-transform hover:-translate-y-px active:scale-95"><Camera size={16} /> Spróbuj z kamerą</button>}
      </div>
    </motion.div>
  );
}
