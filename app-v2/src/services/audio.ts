/**
 * Dźwięk przestrzenny, w całości syntetyzowany (zero plików do pobrania).
 * Źródło (PannerNode HRTF) siedzi tam, gdzie ciastko – lekkie wychylenie i dłoń
 * po jednej stronie słychać w słuchawkach. AudioContext startuje dopiero po geście użytkownika.
 */
type Ctx = AudioContext;
let ctx: Ctx | null = null;
let master: GainNode | null = null;
let panner: PannerNode | null = null;
let noise: AudioBuffer | null = null;
let muted = false;

export const audio = {
  unlock() {
    try {
      if (!ctx) {
        const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!C) return;
        ctx = new C();
        master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
        panner = ctx.createPanner();
        Object.assign(panner, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1, rolloffFactor: 0.6 });
        panner.connect(master);
        const n = Math.floor(ctx.sampleRate * 0.5);
        noise = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') void ctx.resume();
    } catch { /* bez dźwięku */ }
  },
  setMuted(m: boolean) { muted = m; if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.02); },
  /** pozycja źródła względem słuchacza (x: lewo/prawo, y: góra/dół, z: przed) */
  place(x: number, y: number, z = -1.2) {
    if (!panner || !ctx) return;
    const t = ctx.currentTime;
    panner.positionX.setTargetAtTime(x, t, 0.05); panner.positionY.setTargetAtTime(y, t, 0.05); panner.positionZ.setTargetAtTime(z, t, 0.05);
  },
  /** zapadka: krótki filtrowany szum, ton rośnie z postępem */
  tick(progress: number) {
    if (!ctx || !panner || !noise || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300 * (1 + progress * 0.8); f.Q.value = 6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(f).connect(g).connect(panner); src.start(t, Math.random() * 0.4, 0.04);
  },
  /** sukces: trzask kruszącego się ciastka + akord w górę */
  win() {
    if (!ctx || !panner || !noise || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(5200, t); f.frequency.exponentialRampToValueAtTime(600, t + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    src.connect(f).connect(g).connect(panner); src.start(t, 0, 0.25);
    const body = ctx.createOscillator(), bg = ctx.createGain();
    body.frequency.setValueAtTime(190, t); body.frequency.exponentialRampToValueAtTime(70, t + 0.16);
    bg.gain.setValueAtTime(0.6, t); bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    body.connect(bg).connect(panner); body.start(t); body.stop(t + 0.2);
    [659.25, 783.99, 1046.5, 1318.5].forEach((fq, i) => {
      const o = ctx!.createOscillator(), og = ctx!.createGain(), t0 = t + 0.16 + i * 0.075;
      o.type = 'triangle'; o.frequency.value = fq;
      og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.16, t0 + 0.012); og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      o.connect(og).connect(master!); o.start(t0); o.stop(t0 + 0.55);
    });
  },
  /** przejście do AR: miękki „whoosh” */
  whoosh() {
    if (!ctx || !master || !noise || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.7);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    src.connect(f).connect(g).connect(master); src.start(t); src.stop(t + 0.95);
  },
};

/** Haptyka: Android (Chrome). iOS Safari nie udostępnia navigator.vibrate – wtedy po cichu nic. */
export const haptics = {
  tick: () => { try { navigator.vibrate?.(6); } catch { /* brak */ } },
  half: () => { try { navigator.vibrate?.(14); } catch { /* brak */ } },
  win: () => { try { navigator.vibrate?.([30, 40, 70]); } catch { /* brak */ } },
  nudge: () => { try { navigator.vibrate?.(20); } catch { /* brak */ } },
};
