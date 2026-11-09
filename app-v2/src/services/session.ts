import { CONFIG } from '@/lib/config';
import { sleep } from '@/lib/utils';
import { live, useGame } from '@/state/game';
import { audio, haptics } from './audio';
import { camera, cameraMessage } from './camera';
import { CodeService } from './codeService';
import { loadHandModel, resetTwist, startTracking, stopTracking } from './handTracker';
import { enableOrientation, recenterOrientation } from './orientation';
import { PointerTwist } from './twist';

/**
 * Reżyser sesji AR: przejścia między fazami, start kamery i modelu równolegle,
 * awaryjny tryb palca, wygrana i rezerwacja kodu. Każde wejście ma numer pokolenia,
 * więc spóźnione odpowiedzi (np. kamera po wyjściu z AR) są ignorowane i sprzątane.
 */
export const pointer = new PointerTwist();
let gen = 0;
let startedAt = 0;
let nonce = '';

const g = () => useGame.getState();

export function prewarm() { void loadHandModel().catch(() => {}); }

function resetRound() {
  resetTwist(); pointer.reset();
  live.progress = 0; live.signed = 0; live.burstAt = 0; live.crumbBudget = 0;
  startedAt = Date.now(); nonce = crypto.randomUUID?.() ?? String(Math.random());
}

export async function enterAR() {
  const my = ++gen;
  audio.unlock(); audio.whoosh();
  void enableOrientation(); recenterOrientation();
  resetRound();
  live.panel = 'calibrating'; live.cameraMix = 0;
  g().setNotice(null);
  g().setMode('camera');
  g().setPhase('entering');

  const askHint = setTimeout(() => { if (my === gen && !camera().ready) live.panel = 'permission'; }, 1600);
  const camErr = await camera().start().then(() => null, (e) => e);
  clearTimeout(askHint);
  if (my !== gen) { if (!camErr) camera().stop(); return; }
  if (camErr) return goTouch(cameraMessage(camErr), my);

  live.panel = 'calibrating';
  const mpErr = await Promise.race([loadHandModel().then(() => null, (e) => e), sleep(CONFIG.MODEL_TIMEOUT_MS).then(() => new Error('timeout'))]);
  if (my !== gen) return;
  if (mpErr) { camera().stop(); return goTouch('Nie udało się załadować śledzenia dłoni. Sprawdź internet albo graj palcem.', my); }

  startTracking(camera().video, () => camera().mirror);
  live.panel = 'show-hand';
  // pozwól kamerze i rigowi dokończyć przejście, zanim ruszy liczenie
  await sleep(350);
  if (my !== gen) return;
  g().setPhase('playing');
}

function goTouch(message: string | null, my = gen) {
  if (my !== gen) return;
  stopTracking();
  camera().stop();
  resetRound();
  live.cameraMix = 0;
  live.panel = 'touch';
  g().setMode('touch');
  g().setNotice(message);
  g().setPhase('playing');
}

export const playWithTouch = () => goTouch(null);

export async function retryCamera() { gen++; await enterAR(); }

export async function flipCamera() {
  try { await camera().flip(); } catch (e) { goTouch(cameraMessage(e)); }
}

export function exitAR() {
  gen++;
  stopTracking(); camera().stop();
  live.cameraMix = 0;
  g().setNotice(null);
  g().setPhase('landing');
}

/** wywoływane przez pętlę gry, gdy postęp dojdzie do 1 */
export async function win() {
  if (g().phase !== 'playing') return;
  const my = gen;
  g().setPhase('won');
  live.panel = 'won'; live.burstAt = performance.now();
  audio.win(); haptics.win();
  const [res] = await Promise.all([CodeService.reserve({ nonce, startedAt }), sleep(1500)]);
  if (my !== gen) return;
  stopTracking(); camera().stop();
  if (res.ok) { g().setReward(res.r, res.reused); g().setPhase('reward'); return; }
  if (res.error === 'sold_out') { g().setPhase('soldout'); return; }
  g().setNotice('Za szybko – spróbuj jeszcze raz.');
  void retryCamera();
}
