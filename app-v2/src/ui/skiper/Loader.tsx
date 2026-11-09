import { motion } from 'framer-motion';
import oreoLogo from '@/assets/oreo-logo.png';
import { EASE } from './motion';

/**
 * Loader (Skiper-style): duży licznik w mono i włosowa linia postępu.
 * Postęp jest prawdziwy: fonty -> mapy PBR ciastka (generowane w paczkach) ->
 * kompilacja shaderów i upload tekstur. Strona pokazuje się dopiero, gdy scena
 * jest gotowa, więc start AR nie zacina się na kompilacji.
 * Wyjście: kurtyna odjeżdża w górę (clip-path), pod nią już świeci scena.
 */
export function Loader({ progress, label }: { progress: number; label: string }) {
  const pct = Math.round(progress * 100);
  return (
    <motion.div
      className="fixed inset-0 z-40 flex flex-col justify-between bg-ink-0 gutter safe-top safe-bottom"
      initial={{ clipPath: 'inset(0 0 0% 0)' }}
      exit={{ clipPath: 'inset(0 0 100% 0)', transition: { duration: 0.9, ease: EASE } }}
      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Ładowanie"
    >
      <div className="flex items-center justify-between">
        <img src={oreoLogo} alt="Oreo" className="h-7 w-auto opacity-90" />
        <span className="eyebrow text-muted">WebAR · Oreo × Lisek</span>
      </div>
      <div className="flex flex-col gap-5">
        <div className="flex items-end justify-between gap-4">
          <span className="font-mono text-[clamp(72px,22vw,168px)] font-semibold leading-[0.8] tracking-tight tabular">
            {String(pct).padStart(3, '0')}
          </span>
          <span className="eyebrow mb-2 text-right text-muted">{label}</span>
        </div>
        <div className="h-px w-full bg-line">
          <motion.div className="h-px origin-left bg-milk" style={{ scaleX: progress }} transition={{ ease: 'linear' }} />
        </div>
      </div>
    </motion.div>
  );
}
