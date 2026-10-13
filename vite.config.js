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
        globPatterns: ['**/*.{js,css,html,json,tsv,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024, // places.tsv is ~11 MB
      },
    }),
  ],
  worker: { format: 'es' },
  test: { environment: 'node' },
});
