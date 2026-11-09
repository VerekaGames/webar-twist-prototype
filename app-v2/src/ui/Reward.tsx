import { motion } from 'framer-motion';
import { Copy, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import lisekApp from '@/assets/lisek-app.png';
import oreoLogo from '@/assets/oreo-logo.png';
import { CONFIG } from '@/lib/config';
import { CodeService, nextPoolAt } from '@/services/codeService';
import { enterAR } from '@/services/session';
import { useGame } from '@/state/game';
import { Button } from './skiper/Button';
import { EASE, rise, stagger } from './skiper/motion';

/** Nagroda: kupon z kodem, ważność z paskiem, przejście do Liska. Ciastko 3D zostaje nad kartą. */
export function Reward({ onLisek, onToast }: { onLisek: () => void; onToast: (t: string) => void }) {
  const r = useGame((s) => s.reward)!;
  const reused = useGame((s) => s.rewardReused);
  const [left, setLeft] = useState(r.expiresAt - Date.now());
  const codeEl = useRef<HTMLSpanElement>(null);
  useEffect(() => { const id = setInterval(() => setLeft(r.expiresAt - Date.now()), 1000); return () => clearInterval(id); }, [r.expiresAt]);

  const redeemed = r.status === 'redeemed';
  const expired = !redeemed && left <= 0;
  const mm = String(Math.max(0, Math.floor(left / 60000))).padStart(2, '0');
  const ss = String(Math.max(0, Math.floor((left % 60000) / 1000))).padStart(2, '0');
  const frac = Math.max(0, Math.min(1, left / (CONFIG.CODE_TTL_MIN * 60000)));

  const copy = async () => {
    try { await navigator.clipboard.writeText(r.code); onToast('Skopiowano kod'); }
    catch {
      const sel = getSelection(); const range = document.createRange();
      if (codeEl.current && sel) { range.selectNodeContents(codeEl.current); sel.removeAllRanges(); sel.addRange(range); }
      onToast('Kod zaznaczony – skopiuj go ręcznie');
    }
  };
  const again = () => { CodeService.demo.reset(); void enterAR(); };

  const title = redeemed ? 'Odebrane.' : expired ? 'Kod wygasł.' : reused ? 'Masz już kod.' : 'Zgarnięte.';
  const lead = redeemed ? 'Ten kod jest już zrealizowany w Lisku. Smacznego!' : expired ? 'Paczka wróciła do puli. Możesz zagrać ponownie.' : reused ? 'Jedno urządzenie zgarnia jeden kod dziennie – oto Twój.' : 'Twoje darmowe Oreo czeka w Lisku.';

  return (
    <motion.main key="reward" variants={stagger(0.08, 0.25)} initial="hidden" animate="show" exit="exit"
      className="fixed inset-0 z-10 overflow-y-auto gutter safe-bottom">
      <div className="mx-auto flex min-h-full w-full max-w-[460px] flex-col justify-end gap-5 pt-[42vh]">
        <motion.div variants={rise} className="flex flex-col gap-2 text-center">
          <h1 className="font-display text-[clamp(44px,13vw,72px)] font-extrabold leading-[0.9] tracking-[-0.035em]">{title}</h1>
          <p className="text-[15.5px] text-muted">{lead}</p>
        </motion.div>

        <motion.section variants={rise} aria-label="Kupon" className="overflow-hidden rounded-[22px] border border-line bg-ink-1">
          <div className="flex items-center gap-4 px-5 py-4">
            <img src={oreoLogo} alt="Oreo" className="h-6 w-auto" />
            <div className="flex flex-col">
              <span className="eyebrow text-muted">Nagroda</span>
              <span className="font-display text-[19px] font-extrabold leading-tight">Opakowanie Oreo za 0 zł</span>
            </div>
          </div>
          <div className="relative mx-5 border-t border-dashed border-line" aria-hidden>
            <i className="absolute -left-[31px] -top-3 h-6 w-6 rounded-full bg-ink-0" /><i className="absolute -right-[31px] -top-3 h-6 w-6 rounded-full bg-ink-0" />
          </div>
          <div className="flex flex-col gap-4 p-5">
            <div className="rounded-2xl border border-line bg-ink-0 px-3 py-4 text-center">
              <span className="eyebrow mb-2 block text-muted">Twój kod</span>
              <span ref={codeEl} className="select-all break-all font-mono text-[clamp(22px,7.4vw,30px)] font-semibold tracking-[0.08em] text-cream">{r.code}</span>
            </div>
            <Button size="md" onClick={copy} className="w-full"><Copy size={17} /> Kopiuj kod</Button>
            <div className="flex items-center gap-3 text-[13.5px] text-muted">
              <span>Ważny jeszcze</span>
              <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-line"><motion.i className="block h-full origin-left rounded-full bg-oreo-hi" style={{ scaleX: redeemed ? 0 : frac }} transition={{ ease: 'linear' }} /></span>
              <b className="font-mono tabular text-milk">{redeemed ? 'zrealizowany' : expired ? 'wygasł' : `${mm}:${ss}`}</b>
            </div>
          </div>
        </motion.section>

        {!redeemed && !expired && (
          <motion.div variants={rise}>
            <Button variant="ghost" onClick={onLisek} className="h-16 w-full justify-between pl-6 pr-2">
              <span className="text-[16.5px]">Odbierz w aplikacji Lisek</span>
              <img src={lisekApp} alt="" className="h-12 w-12 rounded-[14px]" />
            </Button>
          </motion.div>
        )}
        <motion.ol variants={rise} className="grid gap-1 pl-5 text-[13.5px] text-muted [list-style:decimal]">
          <li>Otworzy się Lisek z Oreo w koszyku za 0 zł.</li>
          <li>Jeśli nie, wklej kod w koszyku ręcznie.</li>
        </motion.ol>
        <motion.div variants={rise} className="flex justify-center pb-2">
          <Button variant="quiet" size="sm" onClick={again}><RotateCcw size={15} /> Zresetuj i zagraj ponownie (test)</Button>
        </motion.div>
      </div>
    </motion.main>
  );
}

export function SoldOut({ onTerms }: { onTerms: () => void }) {
  const [t, setT] = useState(nextPoolAt().getTime() - Date.now());
  useEffect(() => { const target = nextPoolAt().getTime(); const id = setInterval(() => setT(target - Date.now()), 1000); return () => clearInterval(id); }, []);
  const h = Math.floor(t / 36e5), m = Math.floor((t % 36e5) / 6e4), s = Math.floor((t % 6e4) / 1e3);
  const pad = (n: number) => String(Math.max(0, n)).padStart(2, '0');
  return (
    <motion.main key="soldout" variants={stagger()} initial="hidden" animate="show" exit="exit" className="fixed inset-0 z-10 flex flex-col items-center justify-end gap-5 gutter safe-bottom pt-[40vh] text-center">
      <motion.span variants={rise} className="eyebrow">Pula na dziś: 0</motion.span>
      <motion.h1 variants={rise} className="max-w-[14ch] font-display text-[clamp(40px,11vw,72px)] font-extrabold leading-[0.92] tracking-[-0.035em] text-balance">Na dziś wszystko zgarnięte.</motion.h1>
      <motion.div variants={rise} className="flex flex-col items-center gap-1">
        <span className="eyebrow text-muted">Nowa pula za</span>
        <span className="font-mono text-[44px] font-semibold tabular">{pad(h)}:{pad(m)}:{pad(s)}</span>
      </motion.div>
      <motion.div variants={rise}><Button variant="ghost" size="md" onClick={onTerms}>Czytaj regulamin</Button></motion.div>
      <motion.div variants={rise} transition={{ ease: EASE }} className="h-4" />
    </motion.main>
  );
}
