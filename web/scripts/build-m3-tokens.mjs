#!/usr/bin/env node
/**
 * AuraCast M3 token generator.
 *
 * Seeds the Material Design 3 dynamic-color algorithm with the AuraCast
 * brand colors and emits a static CSS file containing every M3 role
 * variable + the full tone palettes for primary, secondary, tertiary,
 * error, neutral, and neutral-variant.
 *
 * The output is a build-time artifact - Tailwind's config consumes the
 * same tokens so utilities like `bg-primary` map to
 * `var(--md-sys-color-primary)`.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  argbFromHex,
  hexFromArgb,
  TonalPalette,
  Hct,
} from '@material/material-color-utilities'

// ── Brand seeds ──────────────────────────────────────────────────────
const PRIMARY_SEED = '#00f2ff'
const TERTIARY_SEED = '#bc00ff'
const NEUTRAL_SEED = '#0a0b1e'

const TONES = [0, 4, 6, 10, 12, 17, 20, 22, 24, 30, 40, 50, 60, 70, 80, 87, 90, 92, 94, 95, 96, 98, 99, 100]

function paletteFromSeed(hex) {
  return TonalPalette.fromInt(argbFromHex(hex))
}

function paletteVars(name, palette) {
  return TONES.map(t => `  --md-ref-palette-${name}${t}: ${hexFromArgb(palette.tone(t))};`).join('\n')
}

const primary = paletteFromSeed(PRIMARY_SEED)
const tertiary = paletteFromSeed(TERTIARY_SEED)
const secondary = TonalPalette.fromHueAndChroma(Hct.fromInt(argbFromHex(PRIMARY_SEED)).hue, 24)
const neutral = TonalPalette.fromHueAndChroma(Hct.fromInt(argbFromHex(NEUTRAL_SEED)).hue, 6)
const neutralVariant = TonalPalette.fromHueAndChroma(Hct.fromInt(argbFromHex(NEUTRAL_SEED)).hue, 12)
const error = paletteFromSeed('#ff5449')

const role = (palette, tone) => hexFromArgb(palette.tone(tone))

// Canonical M3 dark-scheme role-tone mapping.
// Brightness override: cyan/violet seeds get desaturated by the M3 algorithm
// at tone 80. We override `primary` and `tertiary` to the seed itself so the
// "filled" buttons keep AuraCast's neon brightness, then derive on-color +
// container colors from the tonal palette as usual.
const dark = {
  primary:                    PRIMARY_SEED,
  'on-primary':               role(primary, 10),
  'primary-container':        role(primary, 30),
  'on-primary-container':     role(primary, 90),
  'inverse-primary':          role(primary, 40),

  secondary:                  role(secondary, 80),
  'on-secondary':             role(secondary, 20),
  'secondary-container':      role(secondary, 30),
  'on-secondary-container':   role(secondary, 90),

  tertiary:                   TERTIARY_SEED,
  'on-tertiary':              role(tertiary, 10),
  'tertiary-container':       role(tertiary, 30),
  'on-tertiary-container':    role(tertiary, 90),

  error:                      role(error, 80),
  'on-error':                 role(error, 20),
  'error-container':          role(error, 30),
  'on-error-container':       role(error, 90),

  background:                 role(neutral, 6),
  'on-background':            role(neutral, 90),
  surface:                    role(neutral, 6),
  'on-surface':               role(neutral, 90),
  'surface-variant':          role(neutralVariant, 30),
  'on-surface-variant':       role(neutralVariant, 80),
  'inverse-surface':          role(neutral, 90),
  'inverse-on-surface':       role(neutral, 20),

  'surface-container-lowest': role(neutral, 4),
  'surface-container-low':    role(neutral, 10),
  'surface-container':        role(neutral, 12),
  'surface-container-high':   role(neutral, 17),
  'surface-container-highest':role(neutral, 22),
  'surface-bright':           role(neutral, 24),
  'surface-dim':              role(neutral, 6),
  'surface-tint':             role(primary, 80),

  outline:                    role(neutralVariant, 60),
  'outline-variant':          role(neutralVariant, 30),
  scrim:                      role(neutral, 0),
  shadow:                     role(neutral, 0),
}

// Canonical M3 light-scheme role-tone mapping. Tone 40 of cyan/violet
// keeps enough chroma to read on a light surface without losing the
// AuraCast brand identity.
const light = {
  primary:                    role(primary, 40),
  'on-primary':               role(primary, 100),
  'primary-container':        role(primary, 90),
  'on-primary-container':     role(primary, 10),
  'inverse-primary':          role(primary, 80),

  secondary:                  role(secondary, 40),
  'on-secondary':             role(secondary, 100),
  'secondary-container':      role(secondary, 90),
  'on-secondary-container':   role(secondary, 10),

  tertiary:                   role(tertiary, 40),
  'on-tertiary':              role(tertiary, 100),
  'tertiary-container':       role(tertiary, 90),
  'on-tertiary-container':    role(tertiary, 10),

  error:                      role(error, 40),
  'on-error':                 role(error, 100),
  'error-container':          role(error, 90),
  'on-error-container':       role(error, 10),

  background:                 role(neutral, 98),
  'on-background':            role(neutral, 10),
  surface:                    role(neutral, 98),
  'on-surface':               role(neutral, 10),
  'surface-variant':          role(neutralVariant, 90),
  'on-surface-variant':       role(neutralVariant, 30),
  'inverse-surface':          role(neutral, 20),
  'inverse-on-surface':       role(neutral, 95),

  'surface-container-lowest': role(neutral, 100),
  'surface-container-low':    role(neutral, 96),
  'surface-container':        role(neutral, 94),
  'surface-container-high':   role(neutral, 92),
  'surface-container-highest':role(neutral, 90),
  'surface-bright':           role(neutral, 98),
  'surface-dim':              role(neutral, 87),
  'surface-tint':             role(primary, 40),

  outline:                    role(neutralVariant, 50),
  'outline-variant':          role(neutralVariant, 80),
  scrim:                      role(neutral, 0),
  shadow:                     role(neutral, 0),
}

const stateLayer = {
  hover: 0.08,
  focus: 0.12,
  pressed: 0.12,
  dragged: 0.16,
}

const elevationLevels = {
  level0: 'none',
  level1: '0 1px 2px 0 rgba(0,0,0,0.30), 0 1px 3px 1px rgba(0,0,0,0.15)',
  level2: '0 1px 2px 0 rgba(0,0,0,0.30), 0 2px 6px 2px rgba(0,0,0,0.15)',
  level3: '0 4px 8px 3px rgba(0,0,0,0.15), 0 1px 3px 0 rgba(0,0,0,0.30)',
  level4: '0 6px 10px 4px rgba(0,0,0,0.15), 0 2px 3px 0 rgba(0,0,0,0.30)',
  level5: '0 8px 12px 6px rgba(0,0,0,0.15), 0 4px 4px 0 rgba(0,0,0,0.30)',
}

// Glow recipes are tuned for the dark scheme. In light mode they fall
// back to a softer tone-40 ring so the focus indicator stays visible
// without the neon halo that only reads on a dark surface.
// AuraCast brand glow recipes - primary only (the tertiary/ring variants
// were removed because no component referenced `shadow-glow-tertiary` or
// `shadow-glow-ring`; add them back here + in tailwind.config.js if a
// new design needs them).
const glowDark = {
  primary: `0 0 0 1px ${role(primary, 80)}66, 0 0 24px ${role(primary, 70)}40`,
  // Aura disc: bright cyan ring + violet halo on dark canvas.
  'disc': `0 0 0 2px var(--md-sys-color-surface-container), 0 0 0 4px ${PRIMARY_SEED}, 0 0 0 6px rgba(188, 0, 255, 0.45), 0 0 36px -2px rgba(188, 0, 255, 0.40), 0 0 24px -4px rgba(0, 242, 255, 0.55)`,
  // Quiet: subtle outline + faint cyan glow so the disc still reads as
  // part of AuraCast even when empty.
  'disc-quiet': `0 0 0 2px var(--md-sys-color-surface-container), 0 0 0 3px var(--md-sys-color-outline-variant), 0 0 18px -4px ${role(primary, 70)}40`,
}
const glowLight = {
  primary: `0 0 0 1px ${role(primary, 40)}66, 0 0 18px ${role(primary, 50)}33`,
  // Aura disc on light canvas: keep the brand cyan ring but increase
  // halo opacity so the violet/cyan glow reads against a near-white bg.
  'disc': `0 0 0 2px var(--md-sys-color-surface-container), 0 0 0 4px ${role(primary, 50)}, 0 0 0 7px rgba(152, 0, 208, 0.55), 0 0 28px -2px rgba(152, 0, 208, 0.45), 0 0 22px -4px rgba(0, 132, 140, 0.55)`,
  // Light quiet: stronger outline (the page bg is near-white so a
  // hairline outline-variant disappears) and a faint primary halo.
  'disc-quiet': `0 0 0 2px var(--md-sys-color-surface-container), 0 0 0 3px var(--md-sys-color-outline), 0 0 22px -6px ${role(primary, 40)}55`,
}

const shape = {
  none: '0px',
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '28px',
  full: '999px',
}

const motion = {
  'easing-standard':         'cubic-bezier(0.2, 0, 0, 1)',
  'easing-standard-decel':   'cubic-bezier(0, 0, 0, 1)',
  'easing-standard-accel':   'cubic-bezier(0.3, 0, 1, 1)',
  'easing-emphasized':       'cubic-bezier(0.2, 0, 0, 1)',
  'easing-emphasized-decel': 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  'easing-emphasized-accel': 'cubic-bezier(0.3, 0, 0.8, 0.15)',

  'duration-short1':  '50ms',
  'duration-short2':  '100ms',
  'duration-short3':  '150ms',
  'duration-short4':  '200ms',
  'duration-medium1': '250ms',
  'duration-medium2': '300ms',
  'duration-medium3': '350ms',
  'duration-medium4': '400ms',
  'duration-long1':   '450ms',
  'duration-long2':   '500ms',
  'duration-long3':   '550ms',
  'duration-long4':   '600ms',
  'duration-xlong1':  '700ms',
  'duration-xlong2':  '800ms',
}

const typography = {
  'font-brand': "'Space Grotesk Variable', 'Space Grotesk', system-ui, sans-serif",
  'font-plain': "'Manrope Variable', 'Manrope', ui-sans-serif, system-ui, sans-serif",
  'font-mono':  "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",

  'display-lg-size': '57px',  'display-lg-line': '64px',  'display-lg-track': '-0.25px', 'display-lg-weight': '600',
  'display-md-size': '45px',  'display-md-line': '52px',  'display-md-track': '0',       'display-md-weight': '600',
  'display-sm-size': '36px',  'display-sm-line': '44px',  'display-sm-track': '0',       'display-sm-weight': '500',

  'headline-lg-size': '32px', 'headline-lg-line': '40px', 'headline-lg-track': '0',      'headline-lg-weight': '500',
  'headline-md-size': '28px', 'headline-md-line': '36px', 'headline-md-track': '0',      'headline-md-weight': '500',
  'headline-sm-size': '24px', 'headline-sm-line': '32px', 'headline-sm-track': '0',      'headline-sm-weight': '500',

  'title-lg-size': '22px',    'title-lg-line': '28px',    'title-lg-track': '0',         'title-lg-weight': '500',
  'title-md-size': '16px',    'title-md-line': '24px',    'title-md-track': '0.15px',    'title-md-weight': '500',
  'title-sm-size': '14px',    'title-sm-line': '20px',    'title-sm-track': '0.1px',     'title-sm-weight': '500',

  'body-lg-size': '16px',     'body-lg-line': '24px',     'body-lg-track': '0.5px',      'body-lg-weight': '400',
  'body-md-size': '14px',     'body-md-line': '20px',     'body-md-track': '0.25px',     'body-md-weight': '400',
  'body-sm-size': '12px',     'body-sm-line': '16px',     'body-sm-track': '0.4px',      'body-sm-weight': '400',

  'label-lg-size': '14px',    'label-lg-line': '20px',    'label-lg-track': '0.1px',     'label-lg-weight': '500',
  'label-md-size': '12px',    'label-md-line': '16px',    'label-md-track': '0.5px',     'label-md-weight': '500',
  'label-sm-size': '11px',    'label-sm-line': '16px',    'label-sm-track': '0.5px',     'label-sm-weight': '500',
}

// ── Emit CSS ─────────────────────────────────────────────────────────
const lines = []
lines.push('/* AUTO-GENERATED by scripts/build-m3-tokens.mjs - do not edit by hand. */')
lines.push(`/* Seeds: primary ${PRIMARY_SEED}, tertiary ${TERTIARY_SEED}, neutral ${NEUTRAL_SEED} */`)
lines.push('')
lines.push(':root {')
lines.push('  color-scheme: dark;')
lines.push('')
lines.push('  /* M3 ref tonal palettes (scheme-independent) */')
lines.push(paletteVars('primary', primary))
lines.push(paletteVars('secondary', secondary))
lines.push(paletteVars('tertiary', tertiary))
lines.push(paletteVars('neutral', neutral))
lines.push(paletteVars('neutral-variant', neutralVariant))
lines.push(paletteVars('error', error))
lines.push('')
lines.push('  /* M3 sys color roles (dark scheme - default) */')
for (const [k, v] of Object.entries(dark)) lines.push(`  --md-sys-color-${k}: ${v};`)
lines.push('')
lines.push('  /* M3 state-layer opacities */')
for (const [k, v] of Object.entries(stateLayer)) lines.push(`  --md-sys-state-${k}-opacity: ${v};`)
lines.push('')
lines.push('  /* M3 elevation recipes */')
for (const [k, v] of Object.entries(elevationLevels)) lines.push(`  --md-sys-elevation-${k}: ${v};`)
lines.push('')
lines.push('  /* AuraCast brand glow recipes (dark) */')
for (const [k, v] of Object.entries(glowDark)) lines.push(`  --aura-glow-${k}: ${v};`)
lines.push('')
lines.push('  /* M3 shape scale */')
for (const [k, v] of Object.entries(shape)) lines.push(`  --md-sys-shape-corner-${k}: ${v};`)
lines.push('')
lines.push('  /* M3 motion tokens */')
for (const [k, v] of Object.entries(motion)) lines.push(`  --md-sys-motion-${k}: ${v};`)
lines.push('')
lines.push('  /* M3 typography tokens */')
for (const [k, v] of Object.entries(typography)) lines.push(`  --md-sys-typescale-${k}: ${v};`)
lines.push('}')
lines.push('')
lines.push('/* ─── Light scheme (data-theme="light" on <html>) ──────────────── */')
lines.push(':root[data-theme="light"] {')
lines.push('  color-scheme: light;')
for (const [k, v] of Object.entries(light)) lines.push(`  --md-sys-color-${k}: ${v};`)
for (const [k, v] of Object.entries(glowLight)) lines.push(`  --aura-glow-${k}: ${v};`)
lines.push('}')
lines.push('')

const __dirname = dirname(fileURLToPath(import.meta.url))
const outPath = resolve(__dirname, '../src/styles/m3-tokens.css')
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, lines.join('\n'))
console.log(`wrote ${outPath} (${(lines.join('\n').length / 1024).toFixed(1)} KB)`)
