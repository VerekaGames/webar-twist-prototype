import { useFrame, useThree } from '@react-three/fiber';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { live, useGame } from '@/state/game';
import { pointer } from '@/services/session';
import type { CookieCanvases } from './textures';

export type CookieHandle = { root: THREE.Group; seamLocal: THREE.Vector3 };

/**
 * Ciastko PBR: zaokrąglony bok (Lathe), wierzch z tłoczeniem (normal + roughness),
 * krem z połyskiem satynowym (sheen). Animacje czytają `live` w useFrame – bez re-renderów.
 */
export const Cookie = forwardRef<CookieHandle, { canvases: CookieCanvases }>(function Cookie({ canvases }, ref) {
  const gl = useThree((s) => s.gl);
  const root = useRef<THREE.Group>(null!);
  const spin = useRef<THREE.Group>(null!);
  const top = useRef<THREE.Group>(null!);
  const bottom = useRef<THREE.Group>(null!);

  const { faceM, sideM, creamM, capGeo, sideGeo, creamGeo } = useMemo(() => {
    const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    const tex = (c: HTMLCanvasElement, srgb = false) => {
      const t = new THREE.CanvasTexture(c); t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
    };
    const sideN = tex(canvases.sideNormal); sideN.wrapS = sideN.wrapT = THREE.RepeatWrapping; sideN.repeat.set(72, 1);
    const sideA = tex(canvases.sideAlbedo, true); sideA.wrapS = THREE.RepeatWrapping; sideA.repeat.set(3, 1);
    const faceM = new THREE.MeshStandardMaterial({
      map: tex(canvases.albedo, true), normalMap: tex(canvases.normal), normalScale: new THREE.Vector2(1.15, 1.15),
      roughnessMap: tex(canvases.rough), roughness: 1, metalness: 0, envMapIntensity: 0.55,
    });
    const sideM = new THREE.MeshStandardMaterial({ map: sideA, normalMap: sideN, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.9, envMapIntensity: 0.45 });
    const creamM = new THREE.MeshPhysicalMaterial({ color: '#f6eee0', roughness: 0.46, sheen: 0.6, sheenRoughness: 0.45, sheenColor: new THREE.Color('#fffaf0'), envMapIntensity: 0.85 });

    const R = 1, h = 0.15, f = 0.07;
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 8; i++) { const a = Math.PI / 2 - (i / 8) * (Math.PI / 2); prof.push(new THREE.Vector2(R - f + Math.cos(a) * f, h - f + Math.sin(a) * f)); }
    for (let i = 0; i <= 8; i++) { const a = -(i / 8) * (Math.PI / 2); prof.push(new THREE.Vector2(R - f + Math.cos(a) * f, -h + f + Math.sin(a) * f)); }
    const sideGeo = new THREE.LatheGeometry(prof.reverse(), 128);
    const capGeo = new THREE.CircleGeometry(R - f, 128);
    const cp = [[0, 0.11], [0.86, 0.11], [0.915, 0.075], [0.935, 0], [0.915, -0.075], [0.86, -0.11], [0, -0.11]].map(([x, y]) => new THREE.Vector2(x, y)).reverse();
    const creamGeo = new THREE.LatheGeometry(cp, 128);
    return { faceM, sideM, creamM, capGeo, sideGeo, creamGeo };
  }, [canvases, gl]);

  const seamLocal = useMemo(() => new THREE.Vector3(), []);
  useImperativeHandle(ref, () => ({ get root() { return root.current; }, seamLocal }), [seamLocal]);

  const wafer = (
    <>
      <mesh geometry={capGeo} material={faceM} rotation-x={-Math.PI / 2} position-y={0.15} />
      <mesh geometry={capGeo} material={faceM} rotation-x={Math.PI / 2} position-y={-0.15} />
      <mesh geometry={sideGeo} material={sideM} />
    </>
  );

  const flyT = useRef(0);
  useFrame((state, dt) => {
    const { phase, mode } = useGame.getState();
    const t = state.clock.elapsedTime;
    const d = Math.min(dt, 1 / 20);
    const playing = phase === 'entering' || phase === 'playing';
    const lean = mode === 'camera' && live.hand;

    // pochylenie: wierzch do widza; w AR lekko „patrzy” w stronę dłoni
    const tx = (playing || phase === 'won' ? 1.0 : 0.82) + (lean ? live.leanY * 0.12 : 0);
    const ty = lean ? live.leanX * 0.2 : 0;
    root.current.rotation.x = THREE.MathUtils.damp(root.current.rotation.x, tx, 4, d);
    root.current.rotation.y = THREE.MathUtils.damp(root.current.rotation.y, ty, 4, d);
    root.current.rotation.z = Math.sin(t * 0.6) * 0.04;

    // w landingu ciastko powoli obraca się wokół własnej osi (wzór łapie światło)
    if (phase === 'landing' || phase === 'boot' || phase === 'soldout') spin.current.rotation.y += d * 0.18;

    if (phase === 'won' || phase === 'reward') {
      flyT.current = Math.min(1.6, flyT.current + d);
      const e = 1 - Math.pow(1 - Math.min(1, flyT.current / 0.9), 3);
      top.current.position.y = 0.26 + 0.12 + e * (phase === 'reward' ? 0.9 : 1.2);
      top.current.rotation.x = -e * 0.9;
      top.current.rotation.y += d * (6 * (1 - e) + 0.4);
      top.current.position.x = e * 0.35;
    } else {
      flyT.current = 0;
      const signed = mode === 'touch' ? pointer.net : live.signed;
      const target = phase === 'playing' ? -signed : 0;
      top.current.rotation.y = THREE.MathUtils.damp(top.current.rotation.y, target, 18, d);
      top.current.rotation.x = THREE.MathUtils.damp(top.current.rotation.x, 0, 8, d);
      top.current.position.x = THREE.MathUtils.damp(top.current.position.x, 0, 8, d);
      const idleLift = phase === 'landing' ? 0.02 + Math.sin(t * 1.4) * 0.015 : 0;
      top.current.position.y = THREE.MathUtils.damp(top.current.position.y, 0.26 + live.progress * 0.13 + idleLift, 10, d);
      bottom.current.rotation.y = -(phase === 'playing' ? signed : 0) * 0.12;
    }
    // szew między połówkami: tu rodzą się okruchy
    seamLocal.set(0, top.current.position.y - 0.15, 0);
  });

  return (
    <group ref={root}>
      <group ref={spin}>
        <group ref={bottom} position-y={-0.26}>{wafer}</group>
        <mesh geometry={creamGeo} material={creamM} />
        <group ref={top} position-y={0.26}>{wafer}</group>
      </group>
    </group>
  );
});
