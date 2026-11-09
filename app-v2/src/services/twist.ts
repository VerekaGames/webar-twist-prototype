import { CONFIG } from '@/lib/config';
import { wrapAngle } from '@/lib/utils';

/**
 * Pomiar obrotu – czysta matematyka, bez DOM i bez alokacji w pętli.
 *
 * 1) palmRotation: obrót dłoni jako sztywnej bryły (2D Kabsch) między dwiema klatkami,
 *    liczony tylko z punktów dłoni bez palców. Przesuwanie, przybliżanie, ruch palców
 *    i zgięcie nadgarstka nie dają obrotu.
 * 2) Ratchet: wygładzanie + suma „zapadkowa” w obu kierunkach (bierzemy większą),
 *    martwa strefa liczona od stałego punktu odniesienia – wolny obrót nie ginie,
 *    drżenie ręki nie nabija postępu, a ruch powrotny nie kasuje postępu.
 */
export const PALM = [0, 1, 5, 9, 13, 17] as const;
type P = { x: number; y: number };

export function palmRotation(a: readonly P[], b: readonly P[]) {
  let ax = 0, ay = 0, bx = 0, by = 0;
  const n = a.length;
  for (let i = 0; i < n; i++) { ax += a[i].x; ay += a[i].y; bx += b[i].x; by += b[i].y; }
  ax /= n; ay /= n; bx /= n; by /= n;
  let s = 0, c = 0;
  for (let i = 0; i < n; i++) {
    const px = a[i].x - ax, py = a[i].y - ay, qx = b[i].x - bx, qy = b[i].y - by;
    s += px * qy - py * qx; c += px * qx + py * qy;
  }
  return Math.atan2(s, c);
}

const DEAD = (CONFIG.TWIST_DEADZONE_DEG * Math.PI) / 180;

export class Ratchet {
  private prev: number | null = null;
  private last: number | null = null;
  private sm: number | null = null;
  pos = 0;
  neg = 0;
  reset() { this.prev = this.last = this.sm = null; this.pos = this.neg = 0; }
  release() { this.prev = this.last = this.sm = null; }
  push(raw: number, maxStep = 0.8) {
    this.sm = this.sm === null ? raw : this.sm + wrapAngle(raw - this.sm) * 0.5;
    if (this.prev === null || this.last === null) { this.prev = this.last = this.sm; return; }
    const step = wrapAngle(this.sm - this.last); this.last = this.sm;
    if (Math.abs(step) > maxStep) { this.prev = this.sm; return; } // skok trackera
    const d = wrapAngle(this.sm - this.prev);
    if (Math.abs(d) < DEAD) return;
    if (d > 0) this.pos += d; else this.neg -= d;
    this.prev = this.sm;
  }
  get score() { return Math.max(this.pos, this.neg); }
  get signed() { return this.pos >= this.neg ? this.pos : -this.neg; }
}

/** Tryb palca/myszy: obrót kursora wokół środka ciastka. */
export class PointerTwist {
  private prev: number | null = null;
  net = 0;
  reset() { this.prev = null; this.net = 0; }
  release() { this.prev = null; }
  push(angle: number) {
    if (this.prev === null) { this.prev = angle; return; }
    const d = wrapAngle(angle - this.prev); this.prev = angle;
    if (Math.abs(d) > 1.2 || Math.abs(d) < 0.002) return;
    this.net += d;
  }
}
