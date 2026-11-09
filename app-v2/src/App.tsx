/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Zgarnij Oreo · WebAR v2 — architektura
 * ─────────────────────────────────────────────────────────────────────────────
 *  Instalacja:
 *    npm i react@18 react-dom@18 three@0.169 @react-three/fiber@8 @react-three/drei@9 \
 *          @react-three/postprocessing@2 postprocessing@6 framer-motion@11 zustand@4 \
 *          @mediapipe/tasks-vision@0.10.14 clsx tailwind-merge@2 lucide-react
 *    npm i -D vite@5 @vitejs/plugin-react@4 typescript@5 @types/react@18 @types/react-dom@18 \
 *          @types/three tailwindcss@3 postcss autoprefixer vite-plugin-singlefile@2
 *    npx shadcn@latest init                    # components.json w repo (new-york, aliasy @/ui, @/lib)
 *    npx shadcn@latest add @skiper-ui/<nazwa>  # komponenty z rejestru Skiper UI (np. @skiper-ui/skiper40)
 *
 *  Bez @react-three/xr – świadomie: mechanika potrzebuje klatek kamery dla MediaPipe.
 *  iOS Safari nie ma WebXR, a sesja immersive-ar na Androidzie nie oddaje obrazu kamery.
 *
 *  Warstwy:
 *    state/game.ts        zustand (rzadkie zmiany) + `live` (co klatkę, bez re-renderów)
 *    services/            camera · handTracker (rVFC) · twist (Kabsch + zapadka) · audio (HRTF)
 *                         · orientation (żyroskop) · session (reżyser faz) · codeService (pula)
 *    three/               Scene (jeden Canvas na całe życie) · Backdrop (kamera w shaderze)
 *                         · cookie/ (PBR) · HoloPanel · ProgressHalo · Particles · Effects
 *    ui/                  Landing · ArChrome · Reward/SoldOut · skiper/ (Button, Loader, Sheet, motion)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Canvas } from '@react-three/fiber';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import * as THREE from 'three';
import lisekApp from '@/assets/lisek-app.png';
import { CONFIG } from '@/lib/config';
import { CodeService, testFlags, type PoolStats } from '@/services/codeService';
import { delegate } from '@/services/handTracker';
import { prepareCookieCanvases, type CookieCanvases } from '@/three/cookie/textures';
import { Scene } from '@/three/Scene';
import { live, useGame } from '@/state/game';
import { ArChrome } from '@/ui/ArChrome';
import { Landing } from '@/ui/Landing';
import { Reward, SoldOut } from '@/ui/Reward';
import { Button } from '@/ui/skiper/Button';
import { Loader } from '@/ui/skiper/Loader';
import { Sheet } from '@/ui/skiper/Sheet';

export function App() {
  const phase = useGame((s) => s.phase);
  const [canvases, setCanvases] = useState<CookieCanvases | null>(null);
  const [boot, setBoot] = useState({ p: 0, label: 'Fonty' });
  const [sheet, setSheet] = useState<null | 'terms' | 'lisek' | 'demo'>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 1) fonty (do paneli 3D)  2) mapy PBR w paczkach  3) kompilacja shaderów (onCompiled)
  useEffect(() => {
    let alive = true;
    (async () => {
      const fonts = Promise.all([
        document.fonts.load('800 92px "Bricolage Grotesque"'), document.fonts.load('500 38px "Figtree"'), document.fonts.load('600 30px "JetBrains Mono"'),
      ]).catch(() => {});
      await Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]);
      if (!alive) return;
      setBoot({ p: 0.15, label: 'Tekstury ciastka' });
      const c = await prepareCookieCanvases((p) => alive && setBoot({ p: 0.15 + p * 0.65, label: 'Tekstury ciastka' }));
      if (!alive) return;
      setBoot({ p: 0.85, label: 'Shadery i światło' });
      setCanvases(c);
    })();
    return () => { alive = false; };
  }, []);
  const onCompiled = useCallback(() => {
    setBoot({ p: 1, label: 'Gotowe' });
    setTimeout(() => useGame.getState().setPhase('landing'), 380);
  }, []);

  const showToast = useCallback((t: string) => { setToast(t); setTimeout(() => setToast(null), 2200); }, []);
  const inAR = phase === 'entering' || phase === 'playing' || phase === 'won';
  const reward = useGame((s) => s.reward);

  return (
    <>
      <div className="fixed inset-0" aria-hidden>
        <Canvas
          flat
          dpr={[1, 2]}
          camera={{ position: [0, 0, 6], fov: 35, near: 0.1, far: 50 }}
          gl={{ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true, alpha: false }}
          onCreated={({ gl }) => { gl.setClearColor('#04060d'); gl.outputColorSpace = THREE.SRGBColorSpace; }}
        >
          <Scene canvases={canvases} onCompiled={onCompiled} />
        </Canvas>
      </div>

      <AnimatePresence>{phase === 'boot' && <Loader key="loader" progress={boot.p} label={boot.label} />}</AnimatePresence>

      <AnimatePresence mode="wait">
        {phase === 'landing' && <Landing key="landing" onTerms={() => setSheet('terms')} onDemo={() => setSheet('demo')} />}
        {inAR && <ArChrome key="chrome" />}
        {phase === 'reward' && reward && <Reward key="reward" onLisek={() => setSheet('lisek')} onToast={showToast} />}
        {phase === 'soldout' && <SoldOut key="soldout" onTerms={() => setSheet('terms')} />}
      </AnimatePresence>

      <Sheet open={sheet === 'terms'} onClose={() => setSheet(null)} title="Regulamin akcji" eyebrow="Wersja robocza · do akceptacji prawnej">
        <ol className="grid gap-3 pl-5 text-[14.5px] text-muted [list-style:decimal]">
          <li>Codziennie od {CONFIG.POOL_START_HOUR}:00 dostępna jest pula {CONFIG.DAILY_POOL} darmowych opakowań Oreo do odebrania w aplikacji Lisek.</li>
          <li>Kod otrzymujesz po wykonaniu zadania w AR: odkręcenie ciastka gestem dłoni albo palcem na ekranie.</li>
          <li>Jedno urządzenie może zgarnąć jeden kod dziennie. Ponowna próba pokazuje ten sam kod.</li>
          <li>Kod jest ważny {CONFIG.CODE_TTL_MIN} minut od wydania. Niezrealizowany kod wygasa, a paczka wraca do puli.</li>
          <li>O otrzymaniu nagrody decyduje kolejność realizacji kodu w aplikacji Lisek.</li>
          <li>Obraz z kamery jest przetwarzany wyłącznie lokalnie na urządzeniu i nie jest zapisywany ani przesyłany.</li>
        </ol>
        <Button className="mt-6 w-full" onClick={() => setSheet(null)}>Zamknij regulamin</Button>
      </Sheet>

      <Sheet open={sheet === 'lisek'} onClose={() => setSheet(null)} title="Przekierowanie do Liska" eyebrow="Symulacja integracji">
        <div className="flex flex-col gap-4 text-[14.5px] text-muted">
          <div className="flex items-center gap-3"><img src={lisekApp} alt="Lisek" className="h-12 w-12 rounded-xl" /><span>W produkcji przycisk otwiera aplikację Lisek przez deep link z kodem, a Oreo trafia do koszyka z ceną 0 zł. Bez aplikacji – sklep z aplikacjami.</span></div>
          <code className="break-all rounded-xl border border-line bg-ink-0 p-3 font-mono text-[12.5px] text-cream">{reward ? CONFIG.LISEK_DEEPLINK(reward.code) : ''}</code>
          <Button onClick={() => { if (reward) { const r = CodeService.redeem(reward.code); if (r) useGame.getState().setReward({ ...r }, true); } setSheet(null); showToast('Kod zrealizowany w Lisku'); }}>Symuluj realizację w Lisku</Button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'demo'} onClose={() => setSheet(null)} title="Pula kodów" eyebrow="Panel prezentacyjny · tylko prototyp">
        <DemoPanel onDone={(t) => { showToast(t); setSheet(null); }} />
      </Sheet>

      <AnimatePresence>
        {toast && (
          <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+24px)] left-1/2 z-[60] -translate-x-1/2 whitespace-nowrap rounded-full bg-milk px-5 py-3 text-[14px] font-semibold text-ink-0">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function DemoPanel({ onDone }: { onDone: (t: string) => void }) {
  const [s, setS] = useState<PoolStats>(CodeService.stats());
  const [noLimit, setNoLimit] = useState(testFlags.noLimit);
  const act = (f: () => void, t: string) => { f(); setS(CodeService.stats()); onDone(t); if (useGame.getState().phase === 'soldout' || useGame.getState().phase === 'reward') useGame.getState().setPhase('landing'); };
  const stat = (v: number, l: string) => (<div className="rounded-xl border border-line bg-ink-0 p-3 text-center"><b className="block font-mono text-[22px] tabular">{v}</b><span className="text-[11.5px] text-muted">{l}</span></div>);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-2">{stat(s.free, 'wolne')}{stat(s.reserved, 'rezerwacje')}{stat(s.redeemed, 'zrealiz.')}{stat(s.expired, 'wygasłe')}</div>
      <p className="text-[13.5px] text-muted">Symulowany backend działa w pamięci tej przeglądarki. W produkcji te same wywołania trafiają do usługi rezerwacji i endpointów Liska.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" size="md" onClick={() => act(CodeService.demo.reset, 'Nowy dzień, pula 300')}>Resetuj wszystko</Button>
        <Button variant="ghost" size="md" onClick={() => act(CodeService.demo.expireMine, 'Twój kod wygasł')}>Wygaś mój kod</Button>
        <Button variant="ghost" size="md" onClick={() => act(() => CodeService.demo.setFree(0), 'Pula wyczerpana')}>Wyczerpaj pulę</Button>
        <Button variant="ghost" size="md" onClick={() => act(() => CodeService.demo.setFree(3), 'Zostały 3 kody')}>Zostaw 3 kody</Button>
      </div>
      <label className="flex items-center gap-3 text-[14px] text-muted">
        <input type="checkbox" checked={noLimit} onChange={(e) => { setNoLimit(e.target.checked); CodeService.demo.setNoLimit(e.target.checked); }} className="h-5 w-5 accent-[var(--oreo-hi)]" />
        Bez limitu 1 kod na urządzenie (każda gra daje nowy kod)
      </label>
      <p className="font-mono text-[12px] text-muted">Render: {Math.round(live.fps)} kl./s · poziom jakości {useGame.getState().tier} · dłoń: {delegate || 'nieuruchomiona'} · dopisz ?debug do adresu, by widzieć licznik w AR</p>
    </div>
  );
}
