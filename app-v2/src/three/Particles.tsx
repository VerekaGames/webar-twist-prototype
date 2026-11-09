import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { live, useGame } from '@/state/game';
import type { CookieHandle } from './cookie/Cookie';

/**
 * Systemy cząsteczek bez alokacji w pętli (bufory przygotowane z góry):
 *  - Crumbs: okruchy jako InstancedMesh (PBR, łapią światło i cień), sypią się z szwu
 *    proporcjonalnie do postępu, przy wygranej wybuchają; grawitacja i odbicie od „blatu”.
 *  - Sparks: iskry kremu (HDR, addytywnie) – wchodzą w bloom.
 *  - Dust: pyłki w snopie światła na landingu (budują kinowy nastrój), gasną w AR.
 */
const N = 220;
const G = -5.5;

export function Crumbs({ cookie, floorY }: { cookie: React.RefObject<CookieHandle>; floorY: { current: number } }) {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const sim = useMemo(() => ({
    p: new Float32Array(N * 3), v: new Float32Array(N * 3), r: new Float32Array(N * 3), w: new Float32Array(N * 3),
    life: new Float32Array(N), size: new Float32Array(N), next: 0,
  }), []);
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3b2318', roughness: 0.92, envMapIntensity: 0.5, flatShading: true }), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const lastBurst = useRef(0);

  const emit = (count: number, burst: boolean, scale: number) => {
    const c = cookie.current; if (!c?.root) return;
    for (let k = 0; k < count; k++) {
      const i = sim.next; sim.next = (sim.next + 1) % N;
      const a = Math.random() * Math.PI * 2, rr = burst ? 0.3 + Math.random() * 0.7 : 0.95;
      tmp.set(Math.cos(a) * rr, c.seamLocal.y, Math.sin(a) * rr).applyMatrix4(c.root.matrixWorld);
      sim.p[i * 3] = tmp.x; sim.p[i * 3 + 1] = tmp.y; sim.p[i * 3 + 2] = tmp.z;
      const out = burst ? 1.6 + Math.random() * 2.4 : 0.4 + Math.random() * 0.4;
      sim.v[i * 3] = Math.cos(a) * out * scale; sim.v[i * 3 + 1] = (burst ? 2.2 + Math.random() * 2.8 : 0.3) * scale; sim.v[i * 3 + 2] = Math.sin(a) * out * scale * 0.6;
      for (let j = 0; j < 3; j++) { sim.r[i * 3 + j] = Math.random() * 6; sim.w[i * 3 + j] = (Math.random() - 0.5) * 14; }
      sim.life[i] = burst ? 1.8 + Math.random() * 0.8 : 1.4;
      sim.size[i] = (burst ? 0.025 + Math.random() * 0.05 : 0.015 + Math.random() * 0.025) * scale;
    }
  };

  useFrame((_, dt) => {
    const d = Math.min(dt, 1 / 30);
    const sc = cookie.current?.root?.parent?.scale.x ?? 1;
    if (live.crumbBudget >= 1) { const n = Math.min(6, Math.floor(live.crumbBudget)); live.crumbBudget -= n; emit(n, false, sc); }
    if (live.burstAt && live.burstAt !== lastBurst.current) { lastBurst.current = live.burstAt; emit(150, true, sc); }
    const floor = floorY.current;
    for (let i = 0; i < N; i++) {
      if (sim.life[i] <= 0) { dummy.scale.setScalar(0); dummy.updateMatrix(); mesh.current.setMatrixAt(i, dummy.matrix); continue; }
      sim.life[i] -= d;
      const o = i * 3;
      sim.v[o + 1] += G * sc * d;
      sim.p[o] += sim.v[o] * d; sim.p[o + 1] += sim.v[o + 1] * d; sim.p[o + 2] += sim.v[o + 2] * d;
      if (sim.p[o + 1] < floor) { sim.p[o + 1] = floor; sim.v[o + 1] *= -0.32; sim.v[o] *= 0.6; sim.v[o + 2] *= 0.6; sim.w[o] *= 0.5; }
      for (let j = 0; j < 3; j++) sim.r[o + j] += sim.w[o + j] * d;
      const fade = Math.min(1, sim.life[i] * 2.5);
      dummy.position.set(sim.p[o], sim.p[o + 1], sim.p[o + 2]);
      dummy.rotation.set(sim.r[o], sim.r[o + 1], sim.r[o + 2]);
      dummy.scale.set(sim.size[i] * fade, sim.size[i] * 0.7 * fade, sim.size[i] * fade);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geo, mat, N]} frustumCulled={false} />;
}

const sparkVert = /* glsl */ `
attribute float aLife; attribute float aSize;
varying float vLife;
void main() { vLife = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * (300.0 / -mv.z); gl_Position = projectionMatrix * mv; }`;
const sparkFrag = /* glsl */ `
varying float vLife; uniform vec3 uColor;
void main() { vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d) * vLife; gl_FragColor = vec4(uColor * 2.6, a); }`;

export function Sparks({ cookie }: { cookie: React.RefObject<CookieHandle> }) {
  const M = 90;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 3), 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(M), 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(M), 1));
    return g;
  }, []);
  const vel = useMemo(() => new Float32Array(M * 3), []);
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: sparkVert, fragmentShader: sparkFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color('#fff2d8') } } }), []);
  const last = useRef(0);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const d = Math.min(dt, 1 / 30);
    const pos = geo.attributes.position as THREE.BufferAttribute, life = geo.attributes.aLife as THREE.BufferAttribute, size = geo.attributes.aSize as THREE.BufferAttribute;
    const c = cookie.current;
    if (c?.root && live.burstAt && live.burstAt !== last.current) {
      last.current = live.burstAt;
      const sc = c.root.parent?.scale.x ?? 1;
      for (let i = 0; i < M; i++) {
        const a = Math.random() * Math.PI * 2;
        tmp.set(Math.cos(a) * 0.9, c.seamLocal.y, Math.sin(a) * 0.9).applyMatrix4(c.root.matrixWorld);
        pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
        const sp = (1.5 + Math.random() * 3) * sc;
        vel[i * 3] = Math.cos(a) * sp; vel[i * 3 + 1] = (Math.random() * 2.5 + 0.5) * sc; vel[i * 3 + 2] = Math.sin(a) * sp * 0.5;
        life.setX(i, 1); size.setX(i, (4 + Math.random() * 9) * sc);
      }
    }
    for (let i = 0; i < M; i++) {
      const l = life.getX(i); if (l <= 0) continue;
      life.setX(i, Math.max(0, l - d * 1.3));
      vel[i * 3] *= 0.97; vel[i * 3 + 1] = vel[i * 3 + 1] * 0.97 - 1.2 * d; vel[i * 3 + 2] *= 0.97;
      pos.setXYZ(i, pos.getX(i) + vel[i * 3] * d, pos.getY(i) + vel[i * 3 + 1] * d, pos.getZ(i) + vel[i * 3 + 2] * d);
    }
    pos.needsUpdate = true; life.needsUpdate = true; size.needsUpdate = true;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={20} />;
}

const dustVert = /* glsl */ `
uniform float uTime; attribute float aSeed; varying float vA;
void main() {
  vec3 p = position;
  p.y = mod(p.y + uTime * (0.05 + aSeed * 0.06) + 3.0, 6.0) - 3.0;
  p.x += sin(uTime * 0.3 + aSeed * 20.0) * 0.15;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (1.5 + aSeed * 2.5) * (300.0 / -mv.z) * 0.02;
  vA = 0.25 + 0.5 * aSeed;
  gl_Position = projectionMatrix * mv;
}`;
const dustFrag = /* glsl */ `
varying float vA; uniform float uOpacity;
void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(0.75, 0.84, 1.0), smoothstep(0.5, 0.0, d) * vA * uOpacity); }`;

export function Dust() {
  const geo = useMemo(() => {
    const n = 160, p = new Float32Array(n * 3), s = new Float32Array(n);
    for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 9; p[i * 3 + 1] = (Math.random() - 0.5) * 6; p[i * 3 + 2] = (Math.random() - 0.5) * 3 - 0.5; s[i] = Math.random(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
    return g;
  }, []);
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: dustVert, fragmentShader: dustFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } } }), []);
  useFrame((s, dt) => {
    mat.uniforms.uTime.value = s.clock.elapsedTime;
    const phase = useGame.getState().phase;
    const want = phase === 'landing' || phase === 'soldout' ? 1 : 0;
    mat.uniforms.uOpacity.value = THREE.MathUtils.damp(mat.uniforms.uOpacity.value, want, 2, Math.min(dt, 0.05));
  });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={-10} />;
}
