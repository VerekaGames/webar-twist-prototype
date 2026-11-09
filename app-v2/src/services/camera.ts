import { CONFIG } from '@/lib/config';
import { IS_MOBILE, sleep } from '@/lib/utils';

/**
 * Kamera: jedna kolejka operacji (watchdog, ponów i zmiana kamery nie gryzą się),
 * limity czasu na odpowiedź przeglądarki, ponawianie przy zajętej kamerce,
 * czytelne komunikaty błędów. Obraz trafia do <video>, które jest teksturą tła w WebGL.
 */
export class CameraError extends Error {
  constructor(public kind: 'denied' | 'busy' | 'missing' | 'timeout' | 'unsupported', message: string) { super(message); }
}

const IN_FRAME = (() => { try { return window.self !== window.top; } catch { return true; } })();

export function cameraMessage(e: unknown): string {
  const k = e instanceof CameraError ? e.kind : (e as { name?: string })?.name;
  if (IN_FRAME && (k === 'denied' || k === 'NotAllowedError' || k === 'SecurityError' || k === 'unsupported'))
    return 'W tym podglądzie kamera jest zablokowana – odkręć ciastko palcem. Wersja z kamerą: verekagames.github.io/webar-twist-prototype/v2/';
  switch (k) {
    case 'denied': case 'NotAllowedError': case 'SecurityError':
      return 'Brak zgody na kamerę. Zezwól na nią w pasku adresu albo graj palcem.';
    case 'busy': case 'NotReadableError': case 'AbortError':
      return 'Kamera jest zajęta (Discord, Teams, Zoom, OBS albo inna karta). Zamknij ją i spróbuj ponownie.';
    case 'missing': case 'NotFoundError': case 'OverconstrainedError':
      return 'Nie znaleziono kamery. Graj palcem albo podłącz kamerkę.';
    case 'timeout':
      return 'Kamera nie odpowiada. Sprawdź, czy przeglądarka nie czeka na zgodę (ikona kamery w pasku adresu).';
    default:
      return 'Kamera jest niedostępna w tym widoku. Odkręć ciastko palcem.';
  }
}

function normalize(e: unknown): CameraError {
  if (e instanceof CameraError) return e;
  const n = (e as { name?: string })?.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return new CameraError('denied', String(n));
  if (n === 'NotReadableError' || n === 'AbortError') return new CameraError('busy', String(n));
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return new CameraError('missing', String(n));
  if (n === 'TimeoutError') return new CameraError('timeout', 'timeout');
  return new CameraError('unsupported', String(n ?? e));
}

function withTimeout<T>(p: Promise<T>, ms: number, onLate?: (v: T) => void): Promise<T> {
  let settled = false;
  return Promise.race([
    p.then((v) => { if (settled) { onLate?.(v); return v; } settled = true; return v; },
           (e) => { if (!settled) { settled = true; throw e; } throw e; }),
    sleep(ms).then(() => { if (!settled) { settled = true; throw new CameraError('timeout', 'timeout'); } return undefined as never; }),
  ]);
}

const stopTracks = (s: MediaStream) => s.getTracks().forEach((t) => t.stop());

class Camera {
  video: HTMLVideoElement;
  stream: MediaStream | null = null;
  mirror = false;
  facing: 'environment' | 'user' = 'environment';
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    const v = document.createElement('video');
    v.playsInline = true; v.muted = true; v.autoplay = true;
    v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
    // w DOM, ale niewidoczne: Safari dławi wideo spoza dokumentu
    Object.assign(v.style, { position: 'fixed', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none', left: '0', top: '0' });
    document.body.appendChild(v);
    this.video = v;
  }

  get ready() { return !!this.stream && this.video.videoWidth > 0; }

  start(): Promise<void> {
    const run = this.queue.then(() => this.startNow());
    this.queue = run.catch(() => {});
    return run;
  }

  flip() { this.facing = this.facing === 'environment' ? 'user' : 'environment'; return this.start(); }

  stop() {
    if (this.stream) { this.stream.getTracks().forEach((t) => { t.onended = null; t.stop(); }); this.stream = null; }
    try { this.video.pause(); } catch { /* ignore */ }
    this.video.srcObject = null;
  }

  private async getStream(video: MediaTrackConstraints) {
    let last: unknown;
    for (let i = 0; i < 3; i++) {
      try {
        return await withTimeout(navigator.mediaDevices.getUserMedia({ audio: false, video }), CONFIG.CAMERA_TIMEOUT_MS, stopTracks);
      } catch (e) {
        last = normalize(e);
        const k = (last as CameraError).kind;
        if (k === 'denied' || k === 'timeout' || k === 'unsupported') throw last;
        await sleep(400 * (i + 1)); // kamera jeszcze zwalniana
      }
    }
    throw last;
  }

  private async startNow() {
    this.stop();
    await sleep(120);
    if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported', 'no getUserMedia');
    const size = IS_MOBILE ? { width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 960 }, height: { ideal: 540 } };
    this.stream = await this.getStream(IS_MOBILE ? { facingMode: this.facing, ...size } : size);
    const track = this.stream.getVideoTracks()[0];
    const st = track.getSettings?.() ?? {};
    // przednia kamera telefonu i kamerka komputera -> lustro
    this.mirror = st.facingMode ? st.facingMode === 'user' : !IS_MOBILE;
    const v = this.video;
    v.srcObject = this.stream;
    try { await v.play(); } catch (e) { if ((e as Error).name !== 'AbortError') throw normalize(e); }
    await withTimeout(new Promise<void>((r) => { const ok = () => (v.videoWidth > 0 ? r() : requestAnimationFrame(ok)); ok(); }), 5000);
  }
}

let instance: Camera | null = null;
export const camera = () => (instance ??= new Camera());
