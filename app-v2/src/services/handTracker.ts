import type { HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { CONFIG } from '@/lib/config';
import { clamp } from '@/lib/utils';
import { live } from '@/state/game';
import { PALM, palmRotation, Ratchet } from './twist';

/**
 * Śledzenie dłoni (MediaPipe Hand Landmarker, WASM + GPU).
 * - Model (~7,5 MB) pobierany z postępem, może ruszyć już po zaznaczeniu zgody (rozgrzewka).
 * - Detekcja w requestVideoFrameCallback: tylko przy nowej klatce kamery (~30 kl./s),
 *   niezależnie od renderu 3D (60 kl./s). Gdy klatka detekcji jest droga, co druga jest pomijana.
 * - Bez alokacji w gorącej ścieżce: bufory punktów są ponownie używane.
 */
let landmarker: HandLandmarker | null = null;
let loading: Promise<void> | null = null;
export let delegate: 'GPU' | 'CPU' | '' = '';

async function fetchWithProgress(url: string, onProgress: (p: number) => void) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
  const total = Number(res.headers.get('content-length')) || 7.8e6;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length; onProgress(Math.min(0.99, got / total));
  }
  const out = new Uint8Array(got); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  onProgress(1);
  return out;
}

export function loadHandModel(): Promise<void> {
  if (landmarker) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks(CONFIG.MP_BASE);
    let buf: Uint8Array | null = null;
    try { buf = await fetchWithProgress(CONFIG.MODEL_URL, (p) => { live.loadProgress = p; }); } catch { /* fallback: ścieżka */ }
    const opts = (d: 'GPU' | 'CPU') => ({
      baseOptions: buf ? { modelAssetBuffer: buf.slice(), delegate: d } : { modelAssetPath: CONFIG.MODEL_URL, delegate: d },
      runningMode: 'VIDEO' as const, numHands: 1,
      minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.4,
    });
    try { landmarker = await vision.HandLandmarker.createFromOptions(fileset, opts('GPU')); delegate = 'GPU'; }
    catch { landmarker = await vision.HandLandmarker.createFromOptions(fileset, opts('CPU')); delegate = 'CPU'; }
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

/* ---------- stan gestu ---------- */
const ratchet = new Ratchet();
const ptsA = PALM.map(() => ({ x: 0, y: 0 }));
const ptsB = PALM.map(() => ({ x: 0, y: 0 }));
let prev: typeof ptsA | null = null;
let cur = ptsA;
let orient = 0;
let handSince = 0;
let palmX = NaN, palmY = NaN;

export function resetTwist() {
  ratchet.reset(); prev = null; orient = 0; handSince = 0; palmX = palmY = NaN;
  live.progress = 0; live.signed = 0; live.seenHand = false; live.hand = false; live.proximity = 0;
}

/** znormalizowany punkt z kamery -> piksele ekranu (wideo w trybie „cover”, z lustrem) */
function toScreen(v: HTMLVideoElement, mirror: boolean, nx: number, ny: number, out: { x: number; y: number }) {
  const W = innerWidth, H = innerHeight, vw = v.videoWidth || 1, vh = v.videoHeight || 1;
  const s = Math.max(W / vw, H / vh), dw = vw * s, dh = vh * s;
  out.x = (W - dw) / 2 + nx * dw; out.y = (H - dh) / 2 + ny * dh;
  if (mirror) out.x = W - out.x;
}

function process(res: HandLandmarkerResult, now: number, v: HTMLVideoElement, mirror: boolean) {
  const lm = res.landmarks?.[0];
  if (!lm) {
    const lost = now - live.lastHandAt;
    if (lost > 250) { ratchet.release(); prev = null; handSince = 0; palmX = NaN; live.hand = false; }
    live.proximity *= 0.9;
    if (live.panel !== 'won') live.panel = !live.seenHand ? 'show-hand' : lost > 600 ? 'lost' : live.panel;
    return;
  }
  cur = prev === ptsA ? ptsB : ptsA;
  for (let i = 0; i < PALM.length; i++) toScreen(v, mirror, lm[PALM[i]].x, lm[PALM[i]].y, cur[i]);
  const w = cur[0], m9 = cur[3];
  const handPx = Math.hypot(m9.x - w.x, m9.y - w.y);
  if (handPx < 35) return; // za mała / fałszywa dłoń

  live.lastHandAt = now; live.hand = true; live.seenHand = true;
  if (!handSince) handSince = now;
  let cx = 0, cy = 0;
  for (const p of cur) { cx += p.x; cy += p.y; }
  cx /= cur.length; cy /= cur.length;
  const speed = Number.isNaN(palmX) ? 0 : Math.hypot(cx - palmX, cy - palmY) / handPx;
  palmX = cx; palmY = cy;

  const minDim = Math.min(innerWidth, innerHeight);
  live.proximity += (clamp((handPx / minDim - 0.1) / 0.22) - live.proximity) * 0.3;
  live.leanX = clamp((cx / innerWidth) * 2 - 1, -1, 1);
  live.leanY = clamp((cy / innerHeight) * 2 - 1, -1, 1);

  let dA = prev ? palmRotation(prev, cur) : 0;
  prev = cur;
  if (Math.abs(dA) > 0.6) dA = 0;
  orient += dA;
  const counting = now - handSince > CONFIG.HAND_SETTLE_MS && speed < CONFIG.HAND_MAX_SPEED;
  if (counting) ratchet.push(orient); else ratchet.release();

  live.progress = Math.min(1, ratchet.score / ((CONFIG.TWIST_TARGET_DEG * Math.PI) / 180));
  live.signed = ratchet.signed;

  const edge = lm.some((q) => q.x < 0.02 || q.x > 0.98 || q.y < 0.02 || q.y > 0.98);
  live.panel = edge ? 'edge' : live.progress < 0.08 ? 'twist' : 'keep';
}

/* ---------- estymacja światła z obrazu kamery ---------- */
const lc = typeof document !== 'undefined' ? document.createElement('canvas') : null;
if (lc) { lc.width = 24; lc.height = 14; }
const lctx = lc?.getContext('2d', { willReadFrequently: true }) ?? null;
const toLin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
function estimateLight(v: HTMLVideoElement) {
  if (!lctx || !lc) return;
  lctx.drawImage(v, 0, 0, lc.width, lc.height);
  const d = lctx.getImageData(0, 0, lc.width, lc.height).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += toLin(d[i]); g += toLin(d[i + 1]); b += toLin(d[i + 2]); }
  const n = d.length / 4; r /= n; g /= n; b /= n;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const m = Math.max(r, g, b, 1e-4);
  const L = live.light, k = 0.25;
  L.lum += (lum - L.lum) * k; L.r += (r / m - L.r) * k; L.g += (g / m - L.g) * k; L.b += (b / m - L.b) * k;
}

/* ---------- pętla: requestVideoFrameCallback ---------- */
type RVFC = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number; cancelVideoFrameCallback?: (h: number) => void };
let running = false, handle = 0, lastLight = 0, skip = false, cost = 0;

export function startTracking(v: HTMLVideoElement, isMirror: () => boolean) {
  stopTracking();
  running = true;
  const vv = v as RVFC;
  const step = () => {
    if (!running) return;
    const now = performance.now();
    if (landmarker && v.readyState >= 2 && v.videoWidth > 0) {
      if (!skip) {
        const t0 = performance.now();
        try { process(landmarker.detectForVideo(v, now), now, v, isMirror()); } catch { /* klatka pominięta */ }
        cost = cost * 0.9 + (performance.now() - t0) * 0.1;
      }
      skip = cost > 22 ? !skip : false; // słabe urządzenie: detekcja co drugą klatkę
      if (now - lastLight > 300) { lastLight = now; estimateLight(v); }
    }
    handle = vv.requestVideoFrameCallback ? vv.requestVideoFrameCallback(step) : requestAnimationFrame(step);
  };
  step();
}

export function stopTracking() {
  running = false;
  const vv = document.querySelector('video') as RVFC | null;
  if (handle) { vv?.cancelVideoFrameCallback?.(handle); cancelAnimationFrame(handle); handle = 0; }
}
