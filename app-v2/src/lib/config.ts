/** Jedno miejsce na wszystkie liczby, które stroi się po testach na urządzeniach. */
export const CONFIG = {
  DAILY_POOL: 300,
  POOL_START_HOUR: 11,
  CODE_TTL_MIN: 30,

  /** gest: skumulowany obrót dłoni (zapadka, ruch powrotny nie kasuje postępu) */
  TWIST_TARGET_DEG: 70,
  TOUCH_TARGET_DEG: 270,
  TWIST_DEADZONE_DEG: 3,
  HAND_SETTLE_MS: 300,
  HAND_MAX_SPEED: 0.3,
  TICKS: 14,

  /** antybot: minimalny czas od wejścia do AR do rezerwacji */
  MIN_SESSION_MS: 2000,

  /** limity czasu kamery i modelu */
  CAMERA_TIMEOUT_MS: 10_000,
  MODEL_TIMEOUT_MS: 30_000,

  MP_BASE: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  MODEL_URL: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  LISEK_DEEPLINK: (code: string) => `lisek://promo?code=${encodeURIComponent(code)}&sku=OREO_154G&price=0`,
} as const;
