import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './', // relative paths, so Electron can load dist/index.html from disk
  plugins: [
    react(),
    VitePWA({
      injectRegister: false, // registered in main.jsx, web only
      manifest: { name: 'Inkmap', short_name: 'Inkmap', background_color: '#0b1026', theme_color: '#0b1026', display: 'standalone' },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,tsv,svg,woff2,wasm}'], // wasm: the barcode reader
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024, // places.tsv is ~11 MB
        // State/district borders are 175 MB across 201 countries: cache each country when its view first opens
        // instead of downloading them all on the first visit.
        globIgnores: ['**/data/regions/**'],
        runtimeCaching: [{ urlPattern: /\/data\/regions\//, handler: 'CacheFirst', options: { cacheName: 'regions' } }],
      },
    }),
  ],
  worker: { format: 'es' },
  test: { environment: 'node' },
});
