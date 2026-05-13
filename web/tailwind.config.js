/** @type {import('tailwindcss').Config} */
const m3 = (role) => `var(--md-sys-color-${role})`
const shape = (size) => `var(--md-sys-shape-corner-${size})`

export default {
  content: ['./index.html', './src/**/*.{svelte,ts,js}'],
  darkMode: 'class',
  /*
   * hoverOnlyWhenSupported gates every `hover:` Tailwind variant behind
   * `@media (hover: hover) and (pointer: fine)`. On touch devices the
   * tap-then-leave "sticky hover" no longer paints - taps look like
   * taps. (Emil Kowalski's design-engineering skill, "touch device
   * hover states" rule.)
   */
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      colors: {
        primary: m3('primary'),
        'on-primary': m3('on-primary'),
        'primary-container': m3('primary-container'),
        'on-primary-container': m3('on-primary-container'),
        'inverse-primary': m3('inverse-primary'),

        secondary: m3('secondary'),
        'on-secondary': m3('on-secondary'),
        'secondary-container': m3('secondary-container'),
        'on-secondary-container': m3('on-secondary-container'),

        tertiary: m3('tertiary'),
        'on-tertiary': m3('on-tertiary'),
        'tertiary-container': m3('tertiary-container'),
        'on-tertiary-container': m3('on-tertiary-container'),

        error: m3('error'),
        'on-error': m3('on-error'),
        'error-container': m3('error-container'),
        'on-error-container': m3('on-error-container'),

        background: m3('background'),
        'on-background': m3('on-background'),
        surface: m3('surface'),
        'on-surface': m3('on-surface'),
        'surface-variant': m3('surface-variant'),
        'on-surface-variant': m3('on-surface-variant'),
        'inverse-surface': m3('inverse-surface'),
        'inverse-on-surface': m3('inverse-on-surface'),
        'surface-container-lowest': m3('surface-container-lowest'),
        'surface-container-low': m3('surface-container-low'),
        'surface-container': m3('surface-container'),
        'surface-container-high': m3('surface-container-high'),
        'surface-container-highest': m3('surface-container-highest'),
        'surface-bright': m3('surface-bright'),
        'surface-dim': m3('surface-dim'),
        'surface-tint': m3('surface-tint'),

        outline: m3('outline'),
        'outline-variant': m3('outline-variant'),
        scrim: m3('scrim'),
        shadow: m3('shadow'),

        // Convenience aliases for the brand seed colors as raw hex
        // (used by glow recipes / brand chrome that wants pure neon).
        'aura-cyan': '#00f2ff',
        'aura-purple': '#bc00ff',
        'aura-dark': '#0a0b1e',
      },
      borderRadius: {
        none: shape('none'),
        xs: shape('xs'),
        sm: shape('sm'),
        DEFAULT: shape('sm'),
        md: shape('md'),
        lg: shape('lg'),
        xl: shape('lg'),
        '2xl': shape('xl'),
        '3xl': shape('xl'),
        full: shape('full'),
      },
      boxShadow: {
        'elev-0': 'var(--md-sys-elevation-level0)',
        'elev-1': 'var(--md-sys-elevation-level1)',
        'elev-2': 'var(--md-sys-elevation-level2)',
        'elev-3': 'var(--md-sys-elevation-level3)',
        'elev-4': 'var(--md-sys-elevation-level4)',
        'elev-5': 'var(--md-sys-elevation-level5)',
        'glow-primary': 'var(--aura-glow-primary)',
      },
      fontFamily: {
        brand: ['"Space Grotesk Variable"', '"Space Grotesk"', 'ui-sans-serif', 'system-ui'],
        sans: ['"Manrope Variable"', 'Manrope', 'ui-sans-serif', 'system-ui'],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      fontSize: {
        // M3 type scale tokens. Each utility reads from the generated CSS
        // vars so a token edit reflows the whole app.
        'display-lg':  ['var(--md-sys-typescale-display-lg-size)',  { lineHeight: 'var(--md-sys-typescale-display-lg-line)',  letterSpacing: 'var(--md-sys-typescale-display-lg-track)',  fontWeight: 'var(--md-sys-typescale-display-lg-weight)' }],
        'display-md':  ['var(--md-sys-typescale-display-md-size)',  { lineHeight: 'var(--md-sys-typescale-display-md-line)',  letterSpacing: 'var(--md-sys-typescale-display-md-track)',  fontWeight: 'var(--md-sys-typescale-display-md-weight)' }],
        'display-sm':  ['var(--md-sys-typescale-display-sm-size)',  { lineHeight: 'var(--md-sys-typescale-display-sm-line)',  letterSpacing: 'var(--md-sys-typescale-display-sm-track)',  fontWeight: 'var(--md-sys-typescale-display-sm-weight)' }],
        'headline-lg': ['var(--md-sys-typescale-headline-lg-size)', { lineHeight: 'var(--md-sys-typescale-headline-lg-line)', letterSpacing: 'var(--md-sys-typescale-headline-lg-track)', fontWeight: 'var(--md-sys-typescale-headline-lg-weight)' }],
        'headline-md': ['var(--md-sys-typescale-headline-md-size)', { lineHeight: 'var(--md-sys-typescale-headline-md-line)', letterSpacing: 'var(--md-sys-typescale-headline-md-track)', fontWeight: 'var(--md-sys-typescale-headline-md-weight)' }],
        'headline-sm': ['var(--md-sys-typescale-headline-sm-size)', { lineHeight: 'var(--md-sys-typescale-headline-sm-line)', letterSpacing: 'var(--md-sys-typescale-headline-sm-track)', fontWeight: 'var(--md-sys-typescale-headline-sm-weight)' }],
        'title-lg':    ['var(--md-sys-typescale-title-lg-size)',    { lineHeight: 'var(--md-sys-typescale-title-lg-line)',    letterSpacing: 'var(--md-sys-typescale-title-lg-track)',    fontWeight: 'var(--md-sys-typescale-title-lg-weight)' }],
        'title-md':    ['var(--md-sys-typescale-title-md-size)',    { lineHeight: 'var(--md-sys-typescale-title-md-line)',    letterSpacing: 'var(--md-sys-typescale-title-md-track)',    fontWeight: 'var(--md-sys-typescale-title-md-weight)' }],
        'title-sm':    ['var(--md-sys-typescale-title-sm-size)',    { lineHeight: 'var(--md-sys-typescale-title-sm-line)',    letterSpacing: 'var(--md-sys-typescale-title-sm-track)',    fontWeight: 'var(--md-sys-typescale-title-sm-weight)' }],
        'body-lg':     ['var(--md-sys-typescale-body-lg-size)',     { lineHeight: 'var(--md-sys-typescale-body-lg-line)',     letterSpacing: 'var(--md-sys-typescale-body-lg-track)',     fontWeight: 'var(--md-sys-typescale-body-lg-weight)' }],
        'body-md':     ['var(--md-sys-typescale-body-md-size)',     { lineHeight: 'var(--md-sys-typescale-body-md-line)',     letterSpacing: 'var(--md-sys-typescale-body-md-track)',     fontWeight: 'var(--md-sys-typescale-body-md-weight)' }],
        'body-sm':     ['var(--md-sys-typescale-body-sm-size)',     { lineHeight: 'var(--md-sys-typescale-body-sm-line)',     letterSpacing: 'var(--md-sys-typescale-body-sm-track)',     fontWeight: 'var(--md-sys-typescale-body-sm-weight)' }],
        'label-lg':    ['var(--md-sys-typescale-label-lg-size)',    { lineHeight: 'var(--md-sys-typescale-label-lg-line)',    letterSpacing: 'var(--md-sys-typescale-label-lg-track)',    fontWeight: 'var(--md-sys-typescale-label-lg-weight)' }],
        'label-md':    ['var(--md-sys-typescale-label-md-size)',    { lineHeight: 'var(--md-sys-typescale-label-md-line)',    letterSpacing: 'var(--md-sys-typescale-label-md-track)',    fontWeight: 'var(--md-sys-typescale-label-md-weight)' }],
        'label-sm':    ['var(--md-sys-typescale-label-sm-size)',    { lineHeight: 'var(--md-sys-typescale-label-sm-line)',    letterSpacing: 'var(--md-sys-typescale-label-sm-track)',    fontWeight: 'var(--md-sys-typescale-label-sm-weight)' }],
      },
      transitionTimingFunction: {
        'm3-standard': 'cubic-bezier(0.2, 0, 0, 1)',
        'm3-emphasized': 'cubic-bezier(0.2, 0, 0, 1)',
        'm3-emphasized-decel': 'cubic-bezier(0.05, 0.7, 0.1, 1)',
        'm3-emphasized-accel': 'cubic-bezier(0.3, 0, 0.8, 0.15)',
      },
      transitionDuration: {
        50: '50ms', 100: '100ms', 150: '150ms', 200: '200ms',
        250: '250ms', 300: '300ms', 350: '350ms', 400: '400ms',
        450: '450ms', 500: '500ms',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
}
