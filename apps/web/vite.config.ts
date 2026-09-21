import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'DawaDesk',
        short_name: 'DawaDesk',
        description: 'Billing, inventory and compliance for the medical store',
        theme_color: '#1e5a8a',
        background_color: '#f3f5f7',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          { urlPattern: /^\/api\/(auth\/me|store|labels\/templates|items\?.*)$/, handler: 'NetworkFirst', options: { cacheName: 'api-reference', networkTimeoutSeconds: 4 } },
          { urlPattern: /\.(?:woff2?|ttf)$/, handler: 'CacheFirst', options: { cacheName: 'fonts' } },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { proxy: { '/api': { target: `http://localhost:${process.env.API_PORT ?? 3000}`, changeOrigin: false } } },
  build: { sourcemap: false, chunkSizeWarningLimit: 1200 },
});
