import { Buffer } from 'buffer'
;(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer

import { mount } from 'svelte'
// Self-hosted variable fonts. Drops render-blocking Google Fonts requests.
// - Space Grotesk: headlines/brand (ink traps, techy character)
// - Manrope: body/UI text (open apertures, excellent 12px readability)
// - JetBrains Mono: code/hex/terminal (purpose-built for code)
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/manrope'
import '@fontsource-variable/jetbrains-mono'
import './styles/m3-tokens.css'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

// Register service worker for offline + faster repeat loads.
// Only in production builds (dev SW + Vite HMR don't play nice).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-fatal; app works without SW.
    })
  })
}

export default app
