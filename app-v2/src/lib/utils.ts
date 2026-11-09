import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn / Skiper UI: łączenie klas Tailwind bez konfliktów. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Bezpieczny localStorage: w trybie prywatnym, podglądzie lub artefakcie potrafi rzucić. */
export const store = {
  get<T>(k: string): T | null {
    try { return JSON.parse(localStorage.getItem(k) ?? 'null') as T | null; } catch { return null; }
  },
  set(k: string, v: unknown) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* brak pamięci – działamy bez niej */ }
  },
};

export const UA = typeof navigator !== 'undefined' ? navigator.userAgent : '';
export const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(UA) || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1 && /Macintosh/.test(UA));
export const IN_APP_BROWSER = /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Bytedance/i.test(UA);
export const REDUCED_MOTION = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
