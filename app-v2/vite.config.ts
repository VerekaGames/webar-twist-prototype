import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

// Jeden samowystarczalny plik HTML: działa jako artefakt i na GitHub Pages (/v2/).
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: { target: 'es2020', assetsInlineLimit: 100_000_000, cssCodeSplit: false, chunkSizeWarningLimit: 4000 },
});
