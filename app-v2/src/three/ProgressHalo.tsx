import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { CONFIG } from '@/lib/config';
import { live, useGame } from '@/state/game';

/**
 * Pierścień postępu wokół ciastka – w przestrzeni, nie na ekranie.
 * 14 nacięć = 14 kliknięć zapadki w dźwięku i haptyce. Łuk w HDR łapie bloom,
 * „głowica” łuku świeci najmocniej. Przy wygranej pierścień rozchodzi się falą.
 */
const vert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const frag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uProgress, uReveal, uWave, uTime, uTicks;
uniform vec3 uColor;
#define TAU 6.28318530718
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float ang = atan(p.x, p.y);
  float a = fract(ang / TAU + 1.0);          // 0 na górze, zgodnie z ruchem wskazówek
  float band = smoothstep(0.035, 0.0, abs(r - 0.9));
  float tick = step(0.82, fract(a * uTicks)) * smoothstep(0.06, 0.0, abs(r - 0.9));
  float lit = step(a, uProgress);
  float head = exp(-pow((a - uProgress) * 40.0, 2.0)) * step(0.001, uProgress);
  float shown = step(a, uReveal);
  vec3 col = uColor * (0.18 * band + 0.25 * tick);
  col += uColor * lit * band * 2.4;
  col += vec3(1.0) * head * band * 3.0;
  float alpha = (band * (0.22 + 0.78 * lit) + tick * 0.4 + head * band) * shown;
  // fala przy wygranej
  float wave = smoothstep(0.05, 0.0, abs(r - (0.9 + uWave * 0.9))) * (1.0 - uWave) * step(0.001, uWave);
  col += uColor * wave * 3.0; alpha = max(alpha, wave);
  gl_FragColor = vec4(col, alpha);
}`;

export function ProgressHalo({ reveal }: { reveal: { current: number } }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uProgress: { value: 0 }, uReveal: { value: 0 }, uWave: { value: 0 }, uTime: { value: 0 }, uTicks: { value: CONFIG.TICKS }, uColor: { value: new THREE.Color('#8fc0ff') } },
  }), []);
  useFrame((s, dt) => {
    const u = mat.uniforms;
    u.uTime.value = s.clock.elapsedTime;
    u.uProgress.value = THREE.MathUtils.damp(u.uProgress.value, live.progress, 14, Math.min(dt, 0.05));
    u.uReveal.value = reveal.current;
    const phase = useGame.getState().phase;
    u.uWave.value = phase === 'won' || phase === 'reward' ? Math.min(1, u.uWave.value + dt * 1.4) : 0;
  });
  return (
    <mesh material={mat} renderOrder={5}>
      <planeGeometry args={[3, 3]} />
    </mesh>
  );
}
