import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { camera } from '@/services/camera';
import { live, useGame } from '@/state/game';

/**
 * Tło jako część sceny WebGL (nie <video> pod przezroczystym canvasem):
 * obraz kamery i model 3D przechodzą przez ten sam post-processing (ziarno, tonemapping,
 * winieta), więc ciastko wtapia się w obraz. Studio (landing) i kamera mieszają się
 * w shaderze – przejście bez mrugnięcia, bez podmiany elementów DOM.
 */
const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }`;

const frag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVideo;
uniform float uHasVideo, uMix, uMirror, uVidAspect, uScrAspect, uTime, uDim, uSweep, uBokeh;
uniform vec2 uSpot;
vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
void main() {
  vec2 uv = vUv;
  // studio: głęboka czerń z niebieskim podbiciem, miękki snop światła za ciastkiem
  vec2 p = (uv - uSpot) * vec2(uScrAspect, 1.0);
  float spot = exp(-dot(p, p) * 2.6);
  vec3 studio = toLin(vec3(0.016, 0.022, 0.05)) + toLin(vec3(0.09, 0.16, 0.42)) * spot * 0.55;
  // przejście światła w intro
  float sweep = smoothstep(0.18, 0.0, abs(uv.x + uv.y * 0.35 - uSweep)) * 0.18;
  studio += toLin(vec3(0.5, 0.65, 1.0)) * sweep * spot;
  // tryb bez kamery: rozmyte światła „kuchni” (bokeh), żeby ciastko nie wisiało w próżni
  if (uBokeh > 0.0) {
    vec3 b = vec3(0.0);
    for (int i = 0; i < 9; i++) {
      float fi = float(i);
      vec2 c = vec2(fract(sin(fi * 12.9) * 43758.5), fract(sin(fi * 78.2) * 12543.1));
      c += 0.03 * vec2(sin(uTime * 0.21 + fi), cos(uTime * 0.17 + fi * 1.7));
      vec2 q = (uv - c) * vec2(uScrAspect, 1.0);
      float r = 0.06 + 0.08 * fract(fi * 0.37);
      float disc = smoothstep(r, r * 0.82, length(q));
      b += disc * mix(vec3(1.0, 0.72, 0.42), vec3(0.45, 0.6, 1.0), step(0.6, fract(fi * 0.53))) * 0.07;
    }
    studio += b * uBokeh;
  }
  vec3 col = studio;
  if (uHasVideo > 0.5 && uMix > 0.001) {
    // dopasowanie „cover” + lustro dla przedniej kamery
    vec2 v = uv - 0.5;
    if (uScrAspect > uVidAspect) v.y *= uVidAspect / uScrAspect; else v.x *= uScrAspect / uVidAspect;
    if (uMirror > 0.5) v.x = -v.x;
    vec3 cam = texture2D(uVideo, v + 0.5).rgb;
    col = mix(studio, cam, uMix);
  }
  col *= 1.0 - uDim;
  // dithering: brak pasm na ciemnych gradientach
  col += (hash(uv * 900.0 + uTime) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

export function Backdrop() {
  const tex = useMemo(() => {
    const t = new THREE.VideoTexture(camera().video);
    t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    return t;
  }, []);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, depthTest: false, depthWrite: false,
    uniforms: {
      uVideo: { value: tex }, uHasVideo: { value: 0 }, uMix: { value: 0 }, uMirror: { value: 0 }, uVidAspect: { value: 16 / 9 },
      uScrAspect: { value: 1 }, uTime: { value: 0 }, uDim: { value: 0 }, uSweep: { value: -1 }, uBokeh: { value: 0 }, uSpot: { value: new THREE.Vector2(0.5, 0.5) },
    },
  }), [tex]);

  useFrame((s, dt) => {
    const { phase, mode } = useGame.getState();
    const cam = camera();
    const u = mat.uniforms;
    const d = Math.min(dt, 1 / 20);
    const hasVideo = cam.ready && mode === 'camera';
    u.uHasVideo.value = hasVideo ? 1 : 0;
    u.uMirror.value = cam.mirror ? 1 : 0;
    u.uVidAspect.value = (cam.video.videoWidth || 16) / (cam.video.videoHeight || 9);
    u.uScrAspect.value = s.size.width / s.size.height;
    u.uTime.value = s.clock.elapsedTime;
    const wantCam = hasVideo && (phase === 'entering' || phase === 'playing' || phase === 'won');
    live.cameraMix = THREE.MathUtils.damp(live.cameraMix, wantCam ? 1 : 0, wantCam ? 3.2 : 6, d);
    u.uMix.value = live.cameraMix;
    const wantBokeh = mode === 'touch' && (phase === 'playing' || phase === 'won') ? 1 : 0;
    u.uBokeh.value = THREE.MathUtils.damp(u.uBokeh.value, wantBokeh, 2.5, d);
    const dim = phase === 'reward' || phase === 'soldout' ? 0.35 : 0;
    u.uDim.value = THREE.MathUtils.damp(u.uDim.value, dim, 3, d);
    // snop światła podąża za ciastkiem
    const cs = live.cookieScreen;
    u.uSpot.value.set(cs.x / s.size.width || 0.5, 1 - cs.y / s.size.height || 0.5);
    // jednorazowe „przejście światła” w intro
    if (phase === 'landing' && u.uSweep.value < 2) u.uSweep.value += d * 0.9;
  });

  return (
    <mesh frustumCulled={false} renderOrder={-1000} material={mat}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
