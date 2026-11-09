/**
 * Proceduralne mapy PBR ciastka (wzór generyczny, nie odwzorowuje tłoczenia marki –
 * docelowo model GLB od 3D Artysty podmienia tylko ten moduł).
 * Mapa wysokości -> albedo (rowki ciemniejsze, szum wypieku), normal (Sobel), roughness.
 * Generowane w paczkach wierszy z oddaniem wątku, żeby loader animował się bez zacięć.
 */
export type CookieCanvases = { albedo: HTMLCanvasElement; normal: HTMLCanvasElement; rough: HTMLCanvasElement; sideNormal: HTMLCanvasElement; sideAlbedo: HTMLCanvasElement };

let cache: CookieCanvases | null = null;
let pending: Promise<CookieCanvases> | null = null;
const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

function heightCanvas(S: number) {
  const h = document.createElement('canvas'); h.width = h.height = S;
  const g = h.getContext('2d')!;
  const k = S / 512;
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.translate(S / 2, S / 2); g.scale(k, k); g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  const ring = (r: number, n: number, size: number) => {
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, size, 0, Math.PI * 2); g.fill(); }
  };
  ring(236, 44, 8);
  g.lineWidth = 9; g.beginPath(); g.arc(0, 0, 212, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 12; i++) { g.save(); g.rotate((i / 12) * Math.PI * 2); g.beginPath(); g.ellipse(0, -142, 21, 47, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
  g.lineWidth = 11; g.beginPath(); g.arc(0, 0, 82, 0, Math.PI * 2); g.stroke();
  ring(48, 8, 9.5); g.beginPath(); g.arc(0, 0, 16, 0, Math.PI * 2); g.fill();
  const soft = document.createElement('canvas'); soft.width = soft.height = S;
  const sg = soft.getContext('2d', { willReadFrequently: true })!;
  sg.filter = `blur(${2.4 * k}px)`; sg.drawImage(h, 0, 0);
  return sg.getImageData(0, 0, S, S).data;
}

export function prepareCookieCanvases(onProgress: (p: number) => void = () => {}): Promise<CookieCanvases> {
  if (cache) { onProgress(1); return Promise.resolve(cache); }
  if (pending) return pending;
  pending = (async () => {
    const S = 1024;
    const H = heightCanvas(S);
    onProgress(0.1);
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
    const albedo = mk(), normal = mk(), rough = mk();
    const ad = albedo.getContext('2d')!.createImageData(S, S);
    const nd = normal.getContext('2d')!.createImageData(S, S);
    const rd = rough.getContext('2d')!.createImageData(S, S);
    const at = (x: number, y: number) => H[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
    // kakaowe tło (rowki) -> jaśniejsze wypukłości; liniowo w sRGB, szum wypieku
    const lo = [36, 21, 15], hi = [96, 63, 45];
    const CH = 32;
    for (let y0 = 0; y0 < S; y0 += CH) {
      for (let y = y0; y < y0 + CH; y++) {
        for (let x = 0; x < S; x++) {
          const i = (y * S + x) * 4, v = at(x, y);
          const n = (Math.random() - 0.5) * 12 + Math.sin(x * 0.11 + y * 0.07) * 2;
          for (let c = 0; c < 3; c++) ad.data[i + c] = Math.max(0, Math.min(255, lo[c] + (hi[c] - lo[c]) * v + n));
          ad.data[i + 3] = 255;
          const dx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
          const dy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
          const k = 3.4, nx = -dx * k, ny = dy * k, l = Math.hypot(nx, ny, 1);
          nd.data[i] = (nx / l * 0.5 + 0.5) * 255; nd.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; nd.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; nd.data[i + 3] = 255;
          // wierzch wypukłości gładszy, rowki z mąką/okruchem – bardziej matowe
          const r = 0.92 - v * 0.2 + (Math.random() - 0.5) * 0.06;
          rd.data[i] = rd.data[i + 1] = rd.data[i + 2] = Math.max(0, Math.min(255, r * 255)); rd.data[i + 3] = 255;
        }
      }
      onProgress(0.1 + 0.85 * ((y0 + CH) / S));
      await yieldFrame();
    }
    albedo.getContext('2d')!.putImageData(ad, 0, 0);
    normal.getContext('2d')!.putImageData(nd, 0, 0);
    rough.getContext('2d')!.putImageData(rd, 0, 0);

    // bok: pionowe żłobienia (normal) + lekko zróżnicowany kolor
    const sideNormal = document.createElement('canvas'); sideNormal.width = 64; sideNormal.height = 4;
    const sn = sideNormal.getContext('2d')!, sd = sn.createImageData(64, 4);
    for (let x = 0; x < 64; x++) {
      const nx = Math.sin((x / 64) * Math.PI * 2) * 0.6, l = Math.hypot(nx, 1);
      for (let y = 0; y < 4; y++) { const i = (y * 64 + x) * 4; sd.data[i] = (nx / l * 0.5 + 0.5) * 255; sd.data[i + 1] = 128; sd.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; sd.data[i + 3] = 255; }
    }
    sn.putImageData(sd, 0, 0);
    const sideAlbedo = document.createElement('canvas'); sideAlbedo.width = 512; sideAlbedo.height = 32;
    const sa = sideAlbedo.getContext('2d')!;
    sa.fillStyle = '#3a2219'; sa.fillRect(0, 0, 512, 32);
    for (let i = 0; i < 900; i++) { sa.fillStyle = `rgba(${90 + Math.random() * 30},${55 + Math.random() * 20},${40},${Math.random() * 0.25})`; sa.fillRect(Math.random() * 512, Math.random() * 32, 1 + Math.random() * 2, 1); }
    onProgress(1);
    return (cache = { albedo, normal, rough, sideNormal, sideAlbedo });
  })();
  return pending;
}
