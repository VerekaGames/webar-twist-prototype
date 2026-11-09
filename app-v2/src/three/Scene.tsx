import { ContactShadows, Environment, Lightformer, PerformanceMonitor } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, BrightnessContrast, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CONFIG } from '@/lib/config';
import { IS_MOBILE, REDUCED_MOTION } from '@/lib/utils';
import { audio, haptics } from '@/services/audio';
import { CodeService } from '@/services/codeService';
import { pointer, win } from '@/services/session';
import { live, useGame, type PanelState, type Tier } from '@/state/game';
import { Backdrop } from './Backdrop';
import { Cookie, type CookieHandle } from './cookie/Cookie';
import type { CookieCanvases } from './cookie/textures';
import { HoloPanel, makePanelTexture } from './HoloPanel';
import { Crumbs, Dust, Sparks } from './Particles';
import { ProgressHalo } from './ProgressHalo';

/**
 * Jeden <Canvas> przez całe życie strony: landing, przejście, AR i nagroda to tylko
 * różne pozycje tej samej sceny. Nic się nie montuje od nowa przy „Zagraj w AR”,
 * więc nie ma mrugnięcia ani zacięcia przy kompilacji shaderów.
 */

/** Diagnostyka: ?noshadow ?nohalo ?nofx ?nopanels wyłączają pojedyncze warstwy. */
const DBG = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

/** Warstwa 1: tło, panele, pierścień, iskry, pył – widzi je kamera, ale NIE kamera miękkiego cienia. */
export const FX_LAYER = 1;
function FxLayer({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null!);
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    camera.layers.enable(FX_LAYER);
    const apply = () => g.current?.traverse((o) => o.layers.set(FX_LAYER));
    apply(); const id = setInterval(apply, 500); // dzieci montowane później (np. panele)
    return () => clearInterval(id);
  }, [camera]);
  return <group ref={g}>{children}</group>;
}

type Layout = { x: number; y: number; s: number };
function layoutFor(phase: string, visW: number, visH: number): Layout {
  const portrait = visW / visH < 0.9;
  switch (phase) {
    case 'boot':
    case 'landing':
      return portrait ? { x: 0, y: -visH * 0.02, s: Math.min(visW * 0.34, visH * 0.2) } : { x: visW * 0.21, y: visH * 0.0, s: visH * 0.21 };
    case 'soldout':
      return { x: 0, y: visH * 0.16, s: Math.min(visW * 0.2, visH * 0.12) };
    case 'reward':
      return { x: 0, y: visH * 0.33, s: Math.min(visW * 0.16, visH * 0.09) };
    default:
      return { x: 0, y: visH * 0.07, s: Math.min(visW * 0.29, visH * 0.17) };
  }
}

const PANEL_COPY: Record<PanelState, [string, string, string]> = {
  calibrating: ['AR · kalibracja', 'Kalibruję dłoń', 'Ładuję śledzenie dłoni na Twoim urządzeniu.'],
  permission: ['AR · kamera', 'Zezwól na kamerę', 'Obraz zostaje na Twoim urządzeniu i nigdzie nie jest wysyłany.'],
  'show-hand': ['Krok 1 z 2', 'Pokaż dłoń', 'Cała dłoń w kadrze, potem przekręć ją jak gałkę.'],
  twist: ['Krok 2 z 2', 'Przekręć dłoń', 'Górna połówka odkręca się razem z nią.'],
  keep: ['Postęp', 'Kręć dalej', 'Możesz wrócić dłonią i przekręcić jeszcze raz.'],
  edge: ['Kadr', 'Odsuń dłoń', 'Cała dłoń musi być w kadrze.'],
  lost: ['Kadr', 'Nie widzę dłoni', 'Dodaj światła albo graj palcem.'],
  touch: ['Tryb dotykowy', IS_MOBILE ? 'Kręć palcem' : 'Kręć myszą', 'Prowadź palec dookoła ciastka.'],
  won: ['Gotowe', 'Odkręcone!', 'Sprawdzam, czy jest paczka dla Ciebie…'],
};

export function Scene({ canvases, onCompiled }: { canvases: CookieCanvases | null; onCompiled: () => void }) {
  const tier = useGame((s) => s.tier);
  const setTier = useGame((s) => s.setTier);
  const setDpr = useThree((s) => s.setDpr);
  const three = useThree();
  useEffect(() => { if (DBG.has('inspect')) (window as unknown as { __three: unknown }).__three = three; }, [three]);
  useEffect(() => { setDpr(tier === 2 ? Math.min(devicePixelRatio, 2) : tier === 1 ? Math.min(devicePixelRatio, 1.4) : 1); }, [tier, setDpr]);

  return (
    <>
      <PerformanceMonitor
        flipflops={3}
        onDecline={() => setTier(Math.max(0, useGame.getState().tier - 1) as Tier)}
        onIncline={() => setTier(Math.min(2, useGame.getState().tier + 1) as Tier)}
        onFallback={() => setTier(0)}
      />
      <FxLayer><Backdrop /></FxLayer>
      <Lights />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.4} color="#fff1dc" position={[0, 4, 3]} scale={[7, 3, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={3.2} color="#8fc0ff" position={[-5, 1.5, -3]} scale={[3, 6, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={0.8} color="#ffffff" position={[3, -1, 4]} scale={2} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.5} color="#2a4bd0" position={[0, -5, 0]} scale={[10, 10, 1]} target={[0, 0, 0]} />
      </Environment>
      {canvases && <Stage canvases={canvases} onCompiled={onCompiled} />}
      <FxLayer><Dust /></FxLayer>
      {!DBG.has('nofx') && <Effects tier={tier} />}
    </>
  );
}

function Lights() {
  const key = useRef<THREE.DirectionalLight>(null!);
  const rim = useRef<THREE.DirectionalLight>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const scene = useThree((s) => s.scene);
  const intro = useRef(REDUCED_MOTION ? 1 : 0);
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    const phase = useGame.getState().phase;
    if (phase !== 'boot') intro.current = Math.min(1, intro.current + d / 1.8);
    const e = 1 - Math.pow(1 - intro.current, 3);
    // światło dopasowane do obrazu z kamery (estymacja z klatek wideo)
    const cam = live.cameraMix, L = live.light;
    const camLum = Math.sqrt(Math.max(0.02, L.lum));
    const keyI = THREE.MathUtils.lerp(2.4, 0.8 + camLum * 2.6, cam) * e;
    key.current.intensity = keyI;
    key.current.color.setRGB(THREE.MathUtils.lerp(1, L.r, cam * 0.7), THREE.MathUtils.lerp(0.95, L.g, cam * 0.7), THREE.MathUtils.lerp(0.88, L.b, cam * 0.7));
    rim.current.intensity = THREE.MathUtils.lerp(2.6, 1.2, cam) * e;
    hemi.current.intensity = THREE.MathUtils.lerp(0.25, 0.25 + camLum * 0.6, cam) * e;
    hemi.current.groundColor.setRGB(L.r * 0.25, L.g * 0.25, L.b * 0.3);
    scene.environmentIntensity = THREE.MathUtils.lerp(1, 0.45 + camLum * 1.3, cam) * e;
  });
  return (
    <>
      <directionalLight ref={key} position={[1.6, 3, 4]} intensity={0} />
      <directionalLight ref={rim} position={[-2.5, 1.2, -2.5]} color="#8fc0ff" intensity={0} />
      <hemisphereLight ref={hemi} color="#fff4e6" groundColor="#10204f" intensity={0} />
    </>
  );
}

function Stage({ canvases, onCompiled }: { canvases: CookieCanvases; onCompiled: () => void }) {
  const { gl, scene, camera, size, viewport } = useThree();
  const stage = useRef<THREE.Group>(null!);
  const anchor = useRef<THREE.Group>(null!);
  const cookie = useRef<CookieHandle>(null);
  const shadow = useRef<THREE.Group>(null!);
  const floorY = useRef(-1);
  const panelReveal = useRef(0);
  const poolReveal = useRef(0);
  const haloReveal = useRef(0);
  const panel = useMemo(() => makePanelTexture(1024, 400), []);
  const pool = useMemo(() => makePanelTexture(1024, 400), []);
  const lastTick = useRef(0);
  const halfBuzz = useRef(false);
  const lastProg = useRef(0);
  const enterAt = useRef(0);
  const compiled = useRef(false);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  // kompilacja shaderów i upload tekstur PRZED pokazaniem strony – zero zacięć przy starcie AR
  useEffect(() => {
    if (compiled.current) return;
    compiled.current = true;
    const done = () => requestAnimationFrame(() => onCompiled());
    const r = gl as THREE.WebGLRenderer & { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<unknown> };
    if (r.compileAsync) r.compileAsync(scene, camera).then(done, done); else { gl.compile(scene, camera); done(); }
  }, [gl, scene, camera, onCompiled]);

  // licznik puli na panelu bocznym
  const [poolText, setPoolText] = useState<[string, string, string]>(['Pula na dziś', '— / 300', 'paczek Oreo za 0 zł w Lisku']);
  useEffect(() => useGame.subscribe((s, p) => {
    if (s.phase === 'entering' && p.phase !== 'entering') {
      const st = CodeService.stats();
      setPoolText(['Pula na dziś', `${st.free} / ${st.poolSize}`, 'paczek Oreo za 0 zł w Lisku']);
      enterAt.current = performance.now();
    }
  }), []);
  useEffect(() => { pool.draw(...poolText); }, [pool, poolText]);

  // gest palcem / myszą w trybie dotykowym
  useEffect(() => {
    const el = gl.domElement;
    let active = false;
    const ang = (e: PointerEvent) => Math.atan2(e.clientY - live.cookieScreen.y, e.clientX - live.cookieScreen.x);
    const down = (e: PointerEvent) => {
      const { phase, mode } = useGame.getState();
      if (phase !== 'playing' || mode !== 'touch') return;
      active = true; audio.unlock(); pointer.release(); pointer.push(ang(e)); el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => { if (active) pointer.push(ang(e)); };
    const up = () => { active = false; pointer.release(); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
  }, [gl]);

  useFrame((state, dt) => {
    const d = Math.min(dt, 1 / 20);
    const { phase, mode } = useGame.getState();
    live.fps = live.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;

    // --- pętla gry: postęp z palca, zapadka, okruchy, wygrana ---
    if (phase === 'playing' && mode === 'touch') {
      live.progress = Math.min(1, Math.abs(pointer.net) / ((CONFIG.TOUCH_TARGET_DEG * Math.PI) / 180));
      live.signed = pointer.net;
      live.panel = live.progress > 0.02 ? 'keep' : 'touch';
    }
    if (phase === 'playing') {
      const tick = Math.floor(live.progress * CONFIG.TICKS);
      if (tick > lastTick.current) { lastTick.current = tick; audio.tick(live.progress); haptics.tick(); }
      if (live.progress >= 0.5 && !halfBuzz.current) { halfBuzz.current = true; haptics.half(); }
      if (live.progress > lastProg.current) live.crumbBudget += (live.progress - lastProg.current) * 46;
      lastProg.current = live.progress;
      if (live.progress >= 1) void win();
    } else if (phase !== 'won') { lastTick.current = 0; halfBuzz.current = false; lastProg.current = 0; }

    // --- układ sceny (kamera stoi, przesuwa się scena) ---
    const vis = viewport.getCurrentViewport(camera, [0, 0, 0]);
    const L = layoutFor(phase, vis.width, vis.height);
    const k = REDUCED_MOTION ? 50 : phase === 'entering' ? 2.6 : 3.2;
    stage.current.position.x = THREE.MathUtils.damp(stage.current.position.x, L.x, k, d);
    stage.current.position.y = THREE.MathUtils.damp(stage.current.position.y, L.y, k, d);
    const sc = THREE.MathUtils.damp(stage.current.scale.x, L.s * (1 + live.proximity * 0.05), k, d);
    stage.current.scale.setScalar(sc);
    floorY.current = stage.current.position.y - sc * 0.62;
    // cień leży w płaszczyźnie ciastka (pod nim, jak na blacie), nie poziomo – inaczej widać go z boku jako kreskę
    const root = cookie.current?.root;
    if (root) { shadow.current.rotation.x = root.rotation.x; shadow.current.rotation.y = root.rotation.y; }

    // pozycja ciastka na ekranie: środek gestu palcem, snop światła, panorama dźwięku
    tmp.copy(stage.current.position).project(camera);
    live.cookieScreen.x = (tmp.x * 0.5 + 0.5) * size.width;
    live.cookieScreen.y = (-tmp.y * 0.5 + 0.5) * size.height;
    live.cookieScreen.r = (sc / vis.height) * size.height;
    audio.place(tmp.x * 1.4, tmp.y * 0.8);

    // --- panele przestrzenne: kotwica przy ciastku, odsłanianie po przejściu ---
    const inAR = phase === 'entering' || phase === 'playing' || phase === 'won';
    const settled = phase !== 'entering' || performance.now() - enterAt.current > 650;
    const rv = (r: React.MutableRefObject<number>, on: boolean, speed: number) => {
      r.current = on ? Math.min(1, r.current + d * speed) : Math.max(0, r.current - d * speed * 1.6);
    };
    rv(panelReveal, inAR && settled, 1.6);
    rv(haloReveal, inAR && settled, 1.2);
    rv(poolReveal, inAR && settled && phase !== 'won', 1.3);
    anchor.current.position.copy(stage.current.position);
    anchor.current.scale.setScalar(sc);
    anchor.current.rotation.y = THREE.MathUtils.damp(anchor.current.rotation.y, mode === 'camera' && live.hand ? live.leanX * 0.12 : 0, 3, d);

    const [eyebrow, title, sub] = PANEL_COPY[live.panel];
    const pct = Math.round(live.progress * 100);
    const lp = Math.round(live.loadProgress * 100);
    panel.draw(
      live.panel === 'keep' || live.panel === 'touch' ? `${eyebrow} · ${pct}%` : live.panel === 'calibrating' && lp > 0 && lp < 100 ? `${eyebrow} · ${lp}%` : eyebrow,
      title, sub,
    );

    // paralaksa z żyroskopu: wirtualna kamera obraca się z telefonem
    camera.rotation.x = THREE.MathUtils.damp(camera.rotation.x, inAR ? live.tiltX * 0.6 : 0, 6, d);
    camera.rotation.y = THREE.MathUtils.damp(camera.rotation.y, inAR ? live.tiltY * 0.6 : 0, 6, d);
  });

  const portrait = size.width / size.height < 0.9;
  return (
    <>
      <group ref={stage}>
        <Cookie ref={cookie} canvases={canvases} />
        <group ref={shadow} visible={!DBG.has('noshadow')}>
          <ContactShadows position={[0, -0.43, 0]} scale={6.5} blur={2.2} far={0.7} opacity={0.6} resolution={256} color="#00030d" />
        </group>
      </group>
      <group ref={anchor}><FxLayer>
        {!DBG.has('nohalo') && <ProgressHalo reveal={haloReveal} />}
        <HoloPanel texture={panel.texture} width={2.9} height={1.13} reveal={panelReveal} position={[0, portrait ? 2.25 : 1.78, 0.2]} scale={portrait ? 1 : 0.92} rotation={[-0.08, 0, 0]} />
        <HoloPanel texture={pool.texture} width={2.1} height={0.82} reveal={poolReveal} rim="#a8c6ff"
          position={portrait ? [-0.45, -2.15, 0.35] : [-2.7, -0.6, 0.1]} rotation={portrait ? [0.12, 0.18, 0] : [0, 0.42, 0]} scale={portrait ? 0.8 : 0.85} />
      </FxLayer></group>
      <Crumbs cookie={cookie} floorY={floorY} />
      <FxLayer><Sparks cookie={cookie} /></FxLayer>
    </>
  );
}

function Effects({ tier }: { tier: Tier }) {
  return (
    <EffectComposer multisampling={tier === 2 && !IS_MOBILE ? 4 : 0} enableNormalPass={false}>
      <Bloom mipmapBlur intensity={tier === 0 ? 0 : 0.85} luminanceThreshold={1} luminanceSmoothing={0.2} radius={0.72} />
      <BrightnessContrast brightness={0} contrast={0.06} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.32} darkness={tier === 0 ? 0 : 0.5} />
      <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={tier === 2 ? 0.045 : 0} />
    </EffectComposer>
  );
}
