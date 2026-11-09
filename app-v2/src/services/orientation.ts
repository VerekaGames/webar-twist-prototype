import { live } from '@/state/game';

/**
 * Paralaksa z żyroskopu: kamera 3D lekko kontruje ruch telefonu, więc panele
 * i ciastko „stoją” w przestrzeni względem obrazu z kamery.
 * Prawdziwe kotwiczenie (SLAM) wymaga WebXR, którego Safari na iOS nie ma,
 * a w sesji WebXR na Androidzie nie ma dostępu do klatek kamery dla śledzenia dłoni.
 * Dlatego: obraz kamery + MediaPipe + paralaksa z żyroskopu.
 */
let base: { b: number; g: number } | null = null;
let attached = false;

function onOrient(e: DeviceOrientationEvent) {
  if (e.beta == null || e.gamma == null) return;
  if (!base) base = { b: e.beta, g: e.gamma };
  const k = Math.PI / 180;
  live.tiltX = Math.max(-0.12, Math.min(0.12, (e.beta - base.b) * k * 0.35));
  live.tiltY = Math.max(-0.12, Math.min(0.12, (e.gamma - base.g) * k * 0.35));
}

/** Woła się w obsłudze kliknięcia (iOS wymaga gestu do zgody). */
export async function enableOrientation() {
  if (attached || typeof DeviceOrientationEvent === 'undefined') return;
  const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> };
  try { if (D.requestPermission && (await D.requestPermission()) !== 'granted') return; } catch { return; }
  addEventListener('deviceorientation', onOrient);
  attached = true;
}
export function recenterOrientation() { base = null; live.tiltX = live.tiltY = 0; }
