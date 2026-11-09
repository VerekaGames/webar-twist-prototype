import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { live } from '@/state/game';

/**
 * Holograficzny panel zakotwiczony w scenie 3D (spatial UI):
 * szkło z subtelnym niebieskim tintem, krawędź HDR (łapie bloom), linie skanowania,
 * odsłanianie „skanem” od dołu, jaśnieje i rośnie, gdy dłoń się zbliża.
 * Tekst rysowany do CanvasTexture fontami strony (bez dodatkowego pobierania fontów 3D).
 */
const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const frag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uMap;
uniform float uTime, uReveal, uProx, uAspect, uOpacity;
uniform vec3 uRim;
float sdRound(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float d = sdRound(p, vec2(uAspect * 0.5, 0.5) - 0.012, 0.09);
  if (d > 0.0) discard;
  // odsłanianie skanem od dołu z jasną krawędzią prowadzącą
  float edge = vUv.y - uReveal;
  if (edge > 0.0) discard;
  float lead = smoothstep(0.035, 0.0, abs(edge)) * step(uReveal, 0.999);
  float rim = smoothstep(0.022, 0.0, abs(d)) ;
  float inner = smoothstep(0.0, -0.06, d);
  float scan = 0.5 + 0.5 * sin(vUv.y * 220.0 - uTime * 3.0);
  float topGlow = smoothstep(0.55, 1.0, vUv.y) * 0.25;
  vec4 txt = texture2D(uMap, vUv);
  vec3 glass = vec3(0.02, 0.05, 0.16);
  vec3 col = glass * (0.9 + scan * 0.12) + uRim * topGlow * 0.15;
  float a = (0.5 + uProx * 0.15) * inner;
  col = mix(col, uRim * (1.6 + uProx * 1.4), rim);
  a = max(a, rim * 0.95);
  col = mix(col, vec3(1.0) * 1.35, txt.a);
  a = max(a, txt.a);
  col += uRim * lead * 3.0; a = max(a, lead);
  gl_FragColor = vec4(col, a * uOpacity);
}`;

export type HoloPanelProps = JSX.IntrinsicElements['group'] & {
  texture: THREE.Texture; width: number; height: number; reveal: { current: number }; rim?: string;
};

export function HoloPanel({ texture, width, height, reveal, rim = '#7fb4ff', ...props }: HoloPanelProps) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      uMap: { value: texture }, uTime: { value: 0 }, uReveal: { value: 0 }, uProx: { value: 0 }, uAspect: { value: width / height },
      uOpacity: { value: 1 }, uRim: { value: new THREE.Color(rim) },
    },
  }), [texture, width, height, rim]);
  const g = useRef<THREE.Group>(null!);
  useFrame((s) => {
    const u = mat.uniforms;
    u.uTime.value = s.clock.elapsedTime;
    u.uReveal.value = reveal.current;
    u.uProx.value = live.proximity;
    g.current.visible = reveal.current > 0.001;
  });
  return (
    <group ref={g} {...props}>
      <mesh material={mat} renderOrder={10}>
        <planeGeometry args={[width, height]} />
      </mesh>
    </group>
  );
}

/** Rysowanie treści panelu do canvasa: eyebrow (mono), tytuł (display), opis (body). */
export function makePanelTexture(w = 1024, h = 400) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const g = c.getContext('2d')!;
  let last = '';
  const draw = (eyebrow: string, title: string, sub: string) => {
    const key = eyebrow + '|' + title + '|' + sub;
    if (key === last) return; last = key;
    g.clearRect(0, 0, w, h);
    const pad = 64;
    g.fillStyle = 'rgba(160,196,255,0.9)';
    g.font = '600 30px "JetBrains Mono", ui-monospace, monospace';
    g.fillText(eyebrow.toUpperCase().split('').join(String.fromCharCode(8202)), pad, 92);
    g.fillStyle = '#ffffff';
    g.font = '800 92px "Bricolage Grotesque", system-ui, sans-serif';
    g.fillText(title, pad, 196, w - pad * 2);
    g.fillStyle = 'rgba(232,238,255,0.86)';
    g.font = '500 38px "Figtree", system-ui, sans-serif';
    wrap(g, sub, pad, 262, w - pad * 2, 48);
    t.needsUpdate = true;
  };
  return { texture: t, draw };
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); line = word; y += lh; }
    else line = test;
  }
  if (line) g.fillText(line, x, y);
}
