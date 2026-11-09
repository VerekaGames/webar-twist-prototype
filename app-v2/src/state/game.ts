import { create } from 'zustand';
import { store } from '@/lib/utils';
import type { Reservation } from '@/services/codeService';

/**
 * Dwie warstwy stanu:
 *  - `useGame` (zustand): rzadkie zmiany, na które reaguje React (faza, tryb, nagroda).
 *  - `live`: wartości zmieniane co klatkę (postęp, obrót, światło). Czytane w useFrame / rAF,
 *    nigdy nie powodują re-renderu – to klucz do stabilnych 60 kl./s.
 */
export type Phase = 'boot' | 'landing' | 'entering' | 'playing' | 'won' | 'reward' | 'soldout';
export type InputMode = 'camera' | 'touch';
export type Tier = 0 | 1 | 2;

type GameState = {
  phase: Phase;
  mode: InputMode;
  tier: Tier;
  muted: boolean;
  reward: Reservation | null;
  rewardReused: boolean;
  notice: string | null;
  setPhase: (p: Phase) => void;
  setMode: (m: InputMode) => void;
  setTier: (t: Tier) => void;
  setMuted: (m: boolean) => void;
  setReward: (r: Reservation | null, reused?: boolean) => void;
  setNotice: (n: string | null) => void;
};

export const useGame = create<GameState>((set) => ({
  phase: 'boot',
  mode: 'camera',
  tier: 2,
  muted: !!store.get<boolean>('oreo.muted'),
  reward: null,
  rewardReused: false,
  notice: null,
  setPhase: (phase) => set({ phase }),
  setMode: (mode) => set({ mode }),
  setTier: (tier) => set({ tier }),
  setMuted: (muted) => { store.set('oreo.muted', muted); set({ muted }); },
  setReward: (reward, rewardReused = false) => set({ reward, rewardReused }),
  setNotice: (notice) => set({ notice }),
}));

export type PanelState = 'calibrating' | 'permission' | 'show-hand' | 'twist' | 'keep' | 'edge' | 'lost' | 'touch' | 'won';

export const live = {
  /** 0..1 postęp odkręcania */
  progress: 0,
  /** obrót ze znakiem (rad) – górna połówka ciastka obraca się 1:1 z dłonią */
  signed: 0,
  /** czy dłoń jest w kadrze; czas ostatniej detekcji */
  hand: false,
  lastHandAt: 0,
  seenHand: false,
  /** 0..1 jak blisko jest dłoń (rozmiar w kadrze) – panele reagują na zbliżenie */
  proximity: 0,
  /** -1..1 gdzie w kadrze jest dłoń – ciastko lekko się w nią „wpatruje” */
  leanX: 0,
  leanY: 0,
  /** 0..1 widoczność obrazu z kamery w tle */
  cameraMix: 0,
  /** estymacja światła z kamery: luminancja i barwa (liniowo) */
  light: { lum: 0.35, r: 1, g: 1, b: 1 },
  /** pozycja ciastka na ekranie (px) – środek dla gestu palcem */
  cookieScreen: { x: 0, y: 0, r: 100 },
  /** paralaksa z żyroskopu (rad) */
  tiltX: 0,
  tiltY: 0,
  /** stan panelu instrukcji w 3D i postęp ładowania modelu */
  panel: 'calibrating' as PanelState,
  loadProgress: 0,
  /** zdarzenia jednorazowe dla systemu cząsteczek */
  crumbBudget: 0,
  burstAt: 0,
  fps: 0,
};
