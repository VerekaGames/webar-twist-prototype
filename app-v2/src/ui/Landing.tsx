import { motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import oreoLogo from '@/assets/oreo-logo.png';
import lisekApp from '@/assets/lisek-app.png';
import { IN_APP_BROWSER, cn } from '@/lib/utils';
import { haptics } from '@/services/audio';
import { CodeService, type PoolStats } from '@/services/codeService';
import { enterAR, prewarm } from '@/services/session';
import { useGame } from '@/state/game';
import { Button } from './skiper/Button';
import { CountUp, rise, stagger } from './skiper/motion';

/**
 * Landing: jeden ekran, bohaterem jest żywe ciastko w scenie 3D (pod spodem).
 * Pierwszy ekran mówi, co jest do wzięcia, dla kogo i ile (twardy fakt: 300 paczek dziennie).
 * Wyjście reżyseruje AnimatePresence w App: elementy odchodzą w górę z rozmyciem,
 * a scena w tym czasie przenosi ciastko na pozycję AR i miesza tło z obrazem kamery.
 */
export function Landing({ onTerms, onDemo }: { onTerms: () => void; onDemo: () => void }) {
  const [pool, setPool] = useState<PoolStats | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [hint, setHint] = useState('');
  const [nudge, setNudge] = useState(0);
  const mine = CodeService.mine();

  useEffect(() => {
    let alive = true;
    void CodeService.availability().then((p) => {
      if (!alive) return;
      setPool(p);
      if (p.free <= 0 && !CodeService.mine()) useGame.getState().setPhase('soldout');
    });
    return () => { alive = false; };
  }, []);

  const toggle = () => {
    const v = !agreed; setAgreed(v);
    if (v) { setHint(''); prewarm(); } // rozgrzewka: model dłoni pobiera się, zanim ktoś kliknie
  };
  const play = () => {
    if (!agreed) { setHint('Najpierw zaznacz zgodę na regulamin.'); setNudge((n) => n + 1); haptics.nudge(); return; }
    void enterAR();
  };
  const showMine = () => { if (mine) { useGame.getState().setReward(mine, true); useGame.getState().setPhase('reward'); } };

  return (
    <motion.main
      key="landing" variants={stagger()} initial="hidden" animate="show" exit="exit"
      className="pointer-events-none fixed inset-0 z-10 flex flex-col gutter safe-top safe-bottom"
    >
      <motion.header variants={rise} className="pointer-events-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src={oreoLogo} alt="Oreo" className="h-7 w-auto" />
          <span className="text-muted" aria-hidden>×</span>
          <img src={lisekApp} alt="Lisek" className="h-7 w-7 rounded-[7px]" />
        </div>
        <button onClick={onDemo} className="eyebrow rounded-full border border-line px-3 py-2 text-muted transition-colors hover:text-milk">Prototyp · demo</button>
      </motion.header>

      {IN_APP_BROWSER && (
        <motion.p variants={rise} className="pointer-events-auto mt-4 rounded-2xl border border-warn/40 bg-warn/10 p-3 text-[13.5px] text-warn">
          Ta aplikacja może blokować kamerę. Otwórz stronę w Safari lub Chrome (menu ⋯ → Otwórz w przeglądarce).
        </motion.p>
      )}

      <div className="mt-[clamp(20px,5vh,64px)] flex max-w-[560px] flex-col gap-4 md:mt-[14vh]">
        <motion.span variants={rise} className="eyebrow">Codziennie od 11:00 · za 0 zł w Lisku</motion.span>
        <motion.h1 variants={rise} className="font-display text-[clamp(40px,11.5vw,96px)] font-extrabold leading-[0.9] tracking-[-0.035em] text-balance">
          Zgarnij <img src={oreoLogo} alt="Oreo" className="inline-block h-[0.82em] w-auto -translate-y-[0.06em] drop-shadow-[0_8px_24px_rgba(42,92,240,0.45)]" />
          <br />do obiadku.
        </motion.h1>
        <motion.p variants={rise} className="hidden max-w-[40ch] text-[17px] text-muted md:block">
          Odkręć ciastko gestem dłoni w AR i odbierz darmowe opakowanie w aplikacji Lisek.
        </motion.p>
      </div>

      <div className="mt-auto flex w-full max-w-[440px] flex-col gap-4 self-center md:self-start">
        <motion.div variants={rise} className="flex items-baseline gap-3" aria-live="polite">
          <span className="font-mono text-[34px] font-semibold leading-none tabular">{pool ? <CountUp to={pool.free} /> : '—'}</span>
          <span className="text-[14px] text-muted">z <span className="tabular text-milk">{pool?.poolSize ?? 300}</span> paczek zostało dziś</span>
        </motion.div>

        <motion.div variants={rise}>
        <motion.label key={nudge} initial={{ x: 0 }} animate={{ x: nudge ? [0, -7, 7, -4, 4, 0] : 0 }} transition={{ duration: 0.45 }} className="pointer-events-auto flex cursor-pointer items-start gap-3 text-[14px] text-muted">
          <span className="relative mt-[1px] grid h-6 w-6 shrink-0 place-items-center">
            <input type="checkbox" checked={agreed} onChange={toggle} className={cn('peer h-6 w-6 cursor-pointer appearance-none rounded-[7px] border-[1.5px] border-milk/70 bg-white/[0.04] transition-colors checked:border-milk checked:bg-milk', hint && 'border-warn')} />
            <Check size={16} strokeWidth={3.2} className="pointer-events-none absolute text-ink-0 opacity-0 peer-checked:opacity-100" />
          </span>
          <span>Akceptuję <button type="button" onClick={onTerms} className="link-draw text-milk">regulamin akcji</button> i chcę wziąć udział.</span>
        </motion.label>
        </motion.div>

        <motion.div variants={rise} className="pointer-events-auto flex flex-col gap-2">
          <Button onClick={play} aria-disabled={!agreed} aria-describedby="play-hint" className="w-full">
            Zagraj w AR <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
          </Button>
          <p id="play-hint" role="status" className="min-h-[18px] text-center text-[13px] font-semibold text-warn">{hint}</p>
          {mine && <Button variant="ghost" size="md" onClick={showMine}>Pokaż mój kod</Button>}
        </motion.div>

        <motion.p variants={rise} className="text-center text-[12px] text-muted/80 md:text-left">
          Obraz z kamery jest analizowany tylko na Twoim urządzeniu.
        </motion.p>
      </div>
    </motion.main>
  );
}
