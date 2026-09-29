import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), basicSsl()],
  base: process.env.BASE_PATH,
  // jpeg-js (used to produce badge-compatible JPEGs with standard Huffman
  // tables) imports Node's `Buffer`. Polyfill it in the browser bundle.
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    include: ['buffer', 'jpeg-js'],
  },
  server: {
    // Safari and Firefox on this machine can use the dev UI while the
    // Python relay owns Bluetooth. The relay listens on 127.0.0.1:8787.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three'
        },
      },
    },
  },
})
