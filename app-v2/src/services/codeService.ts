import { CONFIG } from '@/lib/config';
import { sleep, store } from '@/lib/utils';

/**
 * SYMULOWANY backend kodów (stan w localStorage przeglądarki).
 * W produkcji te same metody wołają usługę rezerwacji:
 *   availability() -> GET  /api/pool
 *   reserve()      -> POST /api/reserve   (Turnstile, nonce, atomowy licznik w Redis/KV)
 *   redeem()       -> webhook realizacji z Liska
 * Zasady: kod dopiero po geście, 1 kod / urządzenie / dzień (idempotencja),
 * rezerwacja z TTL, wygasła rezerwacja zwalnia miejsce w puli.
 */
export type Reservation = {
  code: string; device: string; nonce: string;
  status: 'reserved' | 'redeemed' | 'expired';
  issuedAt: number; expiresAt: number;
};
type Pool = { day: string; poolSize: number; consumed: number; list: Reservation[] };
export type PoolStats = { free: number; reserved: number; redeemed: number; expired: number; poolSize: number };

const KEY = 'oreo.pool.v2';
const today = () => new Date().toLocaleDateString('sv-SE');
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rnd = (n: number) => Array.from({ length: n }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join('');

let deviceId = store.get<string>('oreo.device');
if (!deviceId) { deviceId = crypto.randomUUID?.() ?? String(Math.random()).slice(2); store.set('oreo.device', deviceId); }

export const testFlags = { noLimit: !!store.get<boolean>('oreo.noLimit') };

function load(): Pool {
  let s = store.get<Pool>(KEY);
  if (!s || s.day !== today()) s = { day: today(), poolSize: CONFIG.DAILY_POOL, consumed: 0, list: [] };
  const now = Date.now();
  s.list.forEach((r) => { if (r.status === 'reserved' && r.expiresAt < now) r.status = 'expired'; });
  return s;
}
const save = (s: Pool) => store.set(KEY, s);
function counts(s: Pool): PoolStats {
  const c = { reserved: 0, redeemed: 0, expired: 0 };
  s.list.forEach((r) => { c[r.status]++; });
  const free = Math.max(0, s.poolSize - s.consumed - c.reserved - c.redeemed);
  return { ...c, free, poolSize: s.poolSize };
}

export const CodeService = {
  async availability() { await sleep(200); const s = load(); save(s); return counts(s); },
  stats: () => counts(load()),
  mine: () => load().list.find((r) => r.device === deviceId && r.status !== 'expired') ?? null,
  async reserve({ nonce, startedAt }: { nonce: string; startedAt: number }) {
    await sleep(450);
    const s = load();
    const existing = s.list.find((r) => r.device === deviceId && r.status !== 'expired');
    if (existing && !testFlags.noLimit) return { ok: true as const, reused: true, r: existing };
    if (existing) existing.status = 'expired';
    if (Date.now() - startedAt < CONFIG.MIN_SESSION_MS) return { ok: false as const, error: 'too_fast' as const };
    if (s.list.some((r) => r.nonce === nonce)) return { ok: false as const, error: 'nonce_used' as const };
    if (counts(s).free <= 0) return { ok: false as const, error: 'sold_out' as const };
    const r: Reservation = { code: `OREO-${rnd(4)}-${rnd(4)}`, device: deviceId!, nonce, status: 'reserved', issuedAt: Date.now(), expiresAt: Date.now() + CONFIG.CODE_TTL_MIN * 60_000 };
    s.list.push(r); save(s);
    return { ok: true as const, reused: false, r };
  },
  redeem(code: string) { const s = load(); const r = s.list.find((x) => x.code === code); if (r?.status === 'reserved') r.status = 'redeemed'; save(s); return r ?? null; },
  demo: {
    setFree(n: number) { const s = load(); const c = counts(s); s.consumed = Math.max(0, s.poolSize - c.reserved - c.redeemed - n); save(s); },
    expireMine() { const s = load(); s.list.forEach((r) => { if (r.device === deviceId && r.status === 'reserved') r.expiresAt = Date.now() - 1; }); save(s); },
    reset() { store.set(KEY, null); },
    setNoLimit(v: boolean) { testFlags.noLimit = v; store.set('oreo.noLimit', v); },
  },
};

export function nextPoolAt() {
  const d = new Date(); d.setHours(CONFIG.POOL_START_HOUR, 0, 0, 0);
  if (d <= new Date()) d.setDate(d.getDate() + 1);
  return d;
}
