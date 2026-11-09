import { animate, motion, useMotionValue, useTransform, type Variants } from 'framer-motion';
import { useEffect } from 'react';
import { REDUCED_MOTION } from '@/lib/utils';

/** Wspólna choreografia: wejście z rozmyciem i krótkim wzlotem, wyjście w górę (kierunek kamery). */
export const EASE = [0.16, 1, 0.3, 1] as const;

export const stagger = (gap = 0.07, delay = 0.1): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: REDUCED_MOTION ? 0 : gap, delayChildren: REDUCED_MOTION ? 0 : delay } },
  exit: { transition: { staggerChildren: REDUCED_MOTION ? 0 : 0.035, staggerDirection: -1 } },
});

export const rise: Variants = REDUCED_MOTION
  ? { hidden: { opacity: 0 }, show: { opacity: 1 }, exit: { opacity: 0 } }
  : {
      hidden: { opacity: 0, y: 22, filter: 'blur(10px)' },
      show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.9, ease: EASE } },
      exit: { opacity: 0, y: -18, filter: 'blur(8px)', transition: { duration: 0.42, ease: [0.7, 0, 0.84, 0] } },
    };

/** Liczba, która dojeżdża do wartości (np. pula paczek). Cyfry w mono, bez skakania szerokości. */
export function CountUp({ to, className }: { to: number; className?: string }) {
  const v = useMotionValue(0);
  const text = useTransform(v, (x) => String(Math.round(x)).padStart(3, '0'));
  useEffect(() => {
    const c = animate(v, to, { duration: REDUCED_MOTION ? 0 : 1.6, ease: EASE });
    return () => c.stop();
  }, [to, v]);
  return <motion.span className={className}>{text}</motion.span>;
}
