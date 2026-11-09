/** Tokeny: jeden ciemny świat kampanii. Kolor tylko z tokenów (index.css). */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 0: 'var(--ink-0)', 1: 'var(--ink-1)', 2: 'var(--ink-2)' },
        line: 'var(--line)', milk: 'var(--milk)', muted: 'var(--muted)', oreo: { DEFAULT: 'var(--oreo)', hi: 'var(--oreo-hi)' },
        cream: 'var(--cream)', ok: 'var(--ok)', warn: 'var(--warn)', cocoa: 'var(--cocoa)',
      },
      fontFamily: { display: 'var(--font-display)', body: 'var(--font-body)', mono: 'var(--font-mono)' },
      transitionTimingFunction: { out: 'cubic-bezier(.16,1,.3,1)' },
    },
  },
};
