---
name: AuraCast
description: >-
  AuraCast is the desktop-first, mobile-aware web companion for the E87 / L8 round
  smart badge. It writes still images, animations, sequences, marquee text, and QR
  codes to the badge's 368 × 368 OLED over Bluetooth (Web Bluetooth in browsers
  that support it, or a small FastAPI backend on macOS Safari). The product is
  built around Google Material 3 Expressive in a single dark theme — a deep navy
  surface stack, a bright cyan primary, and a vivid violet tertiary that together
  echo the badge's neon ring at full brightness.
mode: dark
seeds:
  primary: "#00f2ff"
  tertiary: "#bc00ff"
  neutral: "#0a0b1e"

color:
  # M3 system color roles (dark scheme), derived from the seed palette above.
  primary: "#00dbe7"
  on-primary: "#00363a"
  primary-container: "#004f54"
  on-primary-container: "#74f5ff"

  secondary: "#a0cfd3"
  on-secondary: "#00363a"
  secondary-container: "#1e4d51"
  on-secondary-container: "#bcebef"

  tertiary: "#ebb2ff"
  on-tertiary: "#520071"
  tertiary-container: "#74009f"
  on-tertiary-container: "#f8d8ff"

  error: "#ffb4ab"
  on-error: "#690005"
  error-container: "#93000a"
  on-error-container: "#ffdad6"

  background: "#131318"
  on-background: "#e4e1e9"
  surface: "#131318"
  on-surface: "#e4e1e9"
  surface-variant: "#464554"
  on-surface-variant: "#c6c5d6"

  surface-container-lowest: "#0e0e13"
  surface-container-low: "#1b1b21"
  surface-container: "#1f1f25"
  surface-container-high: "#2a292f"
  surface-container-highest: "#35343a"
  surface-bright: "#39383f"
  surface-dim: "#131318"
  surface-tint: "#00dbe7"

  outline: "#908f9f"
  outline-variant: "#464554"
  scrim: "#000000"
  inverse-surface: "#e4e1e9"
  inverse-on-surface: "#303036"
  inverse-primary: "#00696f"

  # Brand accents reused by the chrome (status pill, indicator dots, focus rings)
  brand-cyan: "#00f2ff"
  brand-violet: "#bc00ff"
  status-online: "#00e676"
  status-warning: "#ffb74d"
  status-error: "#ff5252"

state-layer:
  hover-opacity: 0.08
  focus-opacity: 0.12
  pressed-opacity: 0.16
  dragged-opacity: 0.16

elevation:
  # Six-tier M3 elevation realized as box-shadow recipes against the dark surface.
  level-0: none
  level-1: "0 1px 2px 0 rgba(0,0,0,0.30), 0 1px 3px 1px rgba(0,0,0,0.15)"
  level-2: "0 1px 2px 0 rgba(0,0,0,0.30), 0 2px 6px 2px rgba(0,0,0,0.15)"
  level-3: "0 1px 3px 0 rgba(0,0,0,0.30), 0 4px 8px 3px rgba(0,0,0,0.15)"
  level-4: "0 2px 3px 0 rgba(0,0,0,0.30), 0 6px 10px 4px rgba(0,0,0,0.15)"
  level-5: "0 4px 4px 0 rgba(0,0,0,0.30), 0 8px 12px 6px rgba(0,0,0,0.15)"
  glow-primary: "0 0 24px -4px rgba(0,242,255,0.55), 0 0 48px -12px rgba(0,242,255,0.35)"
  glow-tertiary: "0 0 24px -4px rgba(188,0,255,0.55), 0 0 48px -12px rgba(188,0,255,0.35)"
  glow-aura-ring: "0 0 0 2px rgba(0,242,255,0.45), 0 0 36px -2px rgba(188,0,255,0.40)"

shape:
  # Material 3 shape scale plus extras for the badge's circular preview surface.
  none: "0px"
  extra-small: "4px"
  small: "8px"
  medium: "12px"
  large: "16px"
  large-increased: "20px"
  extra-large: "28px"
  extra-large-increased: "32px"
  extra-extra-large: "48px"
  full: "9999px"
  squircle: "32% / 28%"
  preview-disc: "9999px"

spacing:
  # 4dp baseline grid plus a few semantic aliases used across the layout.
  unit: "4px"
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  "2xl": "48px"
  "3xl": "64px"
  app-bar-height: "64px"
  rail-width: "80px"
  nav-bar-height: "80px"
  page-gutter: "24px"
  page-gutter-mobile: "16px"

motion:
  # M3 emphasized + standard easings, 50–500 ms duration ramp.
  easing:
    standard: "cubic-bezier(0.2, 0.0, 0.0, 1.0)"
    standard-accelerate: "cubic-bezier(0.3, 0.0, 1.0, 1.0)"
    standard-decelerate: "cubic-bezier(0.0, 0.0, 0.0, 1.0)"
    emphasized: "cubic-bezier(0.2, 0.0, 0.0, 1.0)"
    emphasized-accelerate: "cubic-bezier(0.3, 0.0, 0.8, 0.15)"
    emphasized-decelerate: "cubic-bezier(0.05, 0.7, 0.1, 1.0)"
    linear: "linear"
  duration:
    short-1: "50ms"
    short-2: "100ms"
    short-3: "150ms"
    short-4: "200ms"
    medium-1: "250ms"
    medium-2: "300ms"
    medium-3: "350ms"
    medium-4: "400ms"
    long-1: "450ms"
    long-2: "500ms"
    long-3: "550ms"
    long-4: "600ms"

typography:
  # Space Grotesk (headlines) + Manrope (body/UI) + JetBrains Mono (code).
  family:
    brand: "'Space Grotesk Variable', 'Space Grotesk', system-ui, sans-serif"
    body: "'Manrope Variable', 'Manrope', ui-sans-serif, system-ui, sans-serif"
    display: "'Space Grotesk Variable', 'Space Grotesk', system-ui, sans-serif"
    mono: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace"
    icon: "'Material Symbols Outlined'"
  scale:
    display-large: { size: "57px", line-height: "64px", weight: 400, tracking: "-0.25px" }
    display-medium: { size: "45px", line-height: "52px", weight: 400, tracking: "0px" }
    display-small: { size: "36px", line-height: "44px", weight: 400, tracking: "0px" }
    headline-large: { size: "32px", line-height: "40px", weight: 400, tracking: "0px" }
    headline-medium: { size: "28px", line-height: "36px", weight: 400, tracking: "0px" }
    headline-small: { size: "24px", line-height: "32px", weight: 400, tracking: "0px" }
    title-large: { size: "22px", line-height: "28px", weight: 500, tracking: "0px" }
    title-medium: { size: "16px", line-height: "24px", weight: 500, tracking: "0.15px" }
    title-small: { size: "14px", line-height: "20px", weight: 500, tracking: "0.1px" }
    body-large: { size: "16px", line-height: "24px", weight: 400, tracking: "0.5px" }
    body-medium: { size: "14px", line-height: "20px", weight: 400, tracking: "0.25px" }
    body-small: { size: "12px", line-height: "16px", weight: 400, tracking: "0.4px" }
    label-large: { size: "14px", line-height: "20px", weight: 500, tracking: "0.1px" }
    label-medium: { size: "12px", line-height: "16px", weight: 500, tracking: "0.5px" }
    label-small: { size: "11px", line-height: "16px", weight: 500, tracking: "0.5px" }

icon:
  family: "Material Symbols Outlined"
  axes:
    fill: 0
    weight: 400
    grade: 0
    optical-size: 24
  sizes: [16, 18, 20, 24, 28, 32, 36, 40, 48]

components:
  top-app-bar:
    height: "64px"
    background: "surface-container"
    title-style: "title-large"
    elevation: "level-0"
    sticky: true

  navigation-rail:
    width: "80px"
    background: "surface-container-low"
    item-height: "56px"
    indicator-shape: "extra-large"
    indicator-color: "secondary-container"
    selected-icon-color: "on-secondary-container"
    label-style: "label-medium"

  navigation-bar:
    height: "80px"
    background: "surface-container"
    item-min-width: "64px"
    indicator-shape: "full"
    indicator-color: "secondary-container"
    label-style: "label-small"
    safe-area-aware: true

  card:
    variants: ["filled", "outlined", "elevated"]
    radius: "extra-large"
    padding: "20px"
    filled-background: "surface-container"
    outlined-border: "outline-variant"
    elevated-shadow: "level-2"

  button:
    height-md: "40px"
    height-lg: "56px"
    radius: "full"
    leading-icon-gap: "8px"
    variants:
      filled: { background: "primary", on-color: "on-primary", glow: "glow-primary" }
      tonal: { background: "secondary-container", on-color: "on-secondary-container" }
      outlined: { background: "transparent", border: "outline", on-color: "primary" }
      text: { background: "transparent", on-color: "primary" }
      elevated: { background: "surface-container-low", on-color: "primary", elevation: "level-1" }

  icon-button:
    variants: ["standard", "filled", "tonal", "outlined"]
    sizes: ["xs:32", "sm:40", "md:48", "lg:56"]
    radius: "full"
    state-layer-shape: "full"

  fab:
    sizes: ["sm:40", "md:56", "lg:96", "extended:auto"]
    radius: { sm: "medium", md: "large", lg: "extra-large", extended: "large" }
    elevation: "level-3"
    primary-glow: "glow-primary"

  segmented-button:
    height: "40px"
    radius: "full"
    selected-background: "secondary-container"
    selected-icon: "check"
    divider-color: "outline"

  dialog:
    radius: "extra-large"
    background: "surface-container-high"
    scrim: "rgba(0, 0, 0, 0.55)"
    full-screen-breakpoint: "compact (<600px)"
    elevation: "level-3"

  preview-disc:
    diameter-mobile: "260px"
    diameter-desktop: "368px"
    border: "4px solid surface-container-low"
    aura-ring-shadow: "glow-aura-ring"
    inner-bezel-color: "rgba(255,255,255,0.08)"

breakpoints:
  compact: "0–599px"
  medium: "600–839px"
  expanded: "840–1199px"
  large: "1200–1599px"
  extra-large: "1600px+"

layout:
  compact:
    chrome: "Top App Bar + bottom Navigation Bar"
    columns: 1
    gutter: "16px"
    dialog-mode: "full-screen"
  medium:
    chrome: "Top App Bar + left Navigation Rail (icon-only)"
    columns: 1
    gutter: "20px"
    dialog-mode: "modal"
  expanded:
    chrome: "Top App Bar + left Navigation Rail (icon + label)"
    columns: 1
    gutter: "24px"
    dialog-mode: "modal"
---

# AuraCast — Look & feel

AuraCast is a single-product Material 3 Expressive surface in a permanent dark
mode. Imagine the badge itself: a black anodized disc that lights up with a
neon-cyan ring when it's awake, drifting into violet during animations. The web
app borrows exactly that vocabulary — a deep navy canvas, a bright cyan
primary, a vivid violet tertiary, and the occasional aurora-glow shadow on
elevated elements.

## Voice

The chrome speaks like a console. Headlines are confident sentence-fragments
("Patterns", "Pick a pattern", "Wake your badge"). Body copy is short,
informational, and assumes the reader already knows roughly what the badge
does. Errors are direct ("Badge's gallery is full. Clear it via Zrun app.")
and lead with the next action. There is no marketing copy and no smileys
outside of the literal pattern thumbnails.

## Color story

The system is built from three seed colors:

- **Cyan #00f2ff** is the brand primary. The Material color algorithm projects
  it onto the M3 tonal palette, then we map system roles to canonical M3 tones
  (primary = 80, on-primary = 20, container = 30, on-container = 90). The
  result is a saturated but legible cyan that pairs cleanly with the dark
  surface stack.
- **Violet #bc00ff** is the tertiary, used for the wake-banner accent, the
  "Download" tonal button on hover, the FAB secondary state, and the inner
  aura ring around the preview disc.
- **Navy #0a0b1e** seeds the neutral palette at low chroma so surfaces read
  as near-black with a subtle cool tint rather than as pure greyscale.

State layers sit on top of every interactive element at 8 % hover, 12 %
focus, and 16 % pressed, taking the color of the underlying foreground role.
Disabled state drops opacity on both the container (12 %) and the foreground
(38 %).

The status pill in the top app bar uses a literal traffic-light palette
(green #00e676 = online, amber #ffb74d = warning, red #ff5252 = error) so the
badge connection state is unambiguous against the dark chrome.

## Shape

Corner rounding is generous and consistent. The shape scale runs 4 / 8 / 12 /
16 / 28 / full. The flagship corner is **extra-large 28 px** — every Card,
Dialog, and large container uses it. Buttons, IconButtons, FABs, the
NavigationBar indicator pill, and the preview disc are all **full** (pills /
circles). Smaller chips and the segmented-button selected indicator use the
**large 16 px** corner. The result is a deliberately soft, friendly silhouette
that contrasts with the high-contrast neon palette.

A custom **squircle** (`32% / 28%` border-radius) is reserved for the on-press
morph of the primary FAB to give the press feedback an expressive, tactile
quality.

## Typography

The UI runs on **Manrope** for body/UI text (22 px and below) — its wide-open
apertures keep text legible down to 12 px. Headlines and display sizes use
**Space Grotesk**, whose distinctive ink traps and geometric personality give
headings character against the dark canvas. **JetBrains Mono** handles code,
hex values, and terminal output. Material Symbols Outlined provides every
icon at the canonical 24 dp grid, with weight 400, fill 0, grade 0, and
optical-size 24 unless locally overridden for a chip or a smaller IconButton.

The full M3 type scale is wired (display / headline / title / body / label,
each in large / medium / small), but in practice the app uses six sizes:
display-small for page hero titles, headline-small for section heads,
title-large for card heads, title-medium for list-item titles, body-medium
for paragraphs, and label-medium / label-small for the navigation rail and
status pills.

## Elevation & glow

The dark canvas is mostly flat. The elevation scale is M3-canonical
(level 0 → level 5 box-shadow recipes), but in this product 80 % of surfaces
sit at **level 0** (the chrome) or **level 1** (cards). What sells the
"AuraCast" aesthetic is a layer of brand glow on top of elevation:

- The primary FAB / Send button carries `glow-primary` — a 24 px / 48 px
  cyan radial shadow that simulates the badge's lit ring.
- The preview disc has an `aura-ring-shadow` recipe combining a 2 px cyan
  inner ring with a 36 px outer violet halo.
- Dialogs and the active navigation indicator pill use level-3 shadow plus
  a faint colored shadow to lift them off the surface stack.

These glows are explicit token recipes, not ad-hoc per-component CSS.

## Motion

All transitions use M3 emphasized easing (`cubic-bezier(0.2, 0.0, 0.0, 1.0)`)
on a 50–500 ms duration ramp. Page chrome and dialog enter/exit run at
medium-2 (300 ms). State-layer fades, indicator-pill morphs, and button
scales run at short-3 (150 ms). The preview-mode segmented button uses a
short-4 (200 ms) check-icon morph on selection change. Reduced-motion users
get every transition collapsed to short-1 (50 ms) with no scale or translate.

## Layout

A single dark canvas behind everything; chrome adapts by window-size class:

- **Compact (< 600 px)**: 64 dp top app bar (brand + status pill + Connect
  IconButton + Help IconButton), full-bleed scrolling content, 80 dp bottom
  Navigation Bar with all six destinations and an indicator pill behind the
  active one. Dialogs cover the full screen.
- **Medium (600–839 px) and Expanded (≥ 840 px)**: same top app bar, plus an
  80 dp left **Navigation Rail** with brand block on top, six destinations
  with icon + label, and a footer slot for Diagnostics + Help IconButtons.
  Dialogs become centered modals over a 55 % black scrim.

The mode panel is one big filled card carrying the title, sub-copy, the
mode-specific controls, the preview, and the primary action row at the
bottom. There is **no** separate Connection card — connect / disconnect lives
in the top app bar's IconButton, and verbose status detail moves into the
help dialog.

## Components in canonical anatomy

- **Top App Bar** — small variant per M3, sticky, 64 dp tall, leading slot for
  brand, trailing slot for status pill + actions.
- **Navigation Rail / Navigation Bar** — both have a 32 dp wide, 16 dp tall
  pill indicator behind the icon of the active destination, the selected icon
  switches from outlined to filled (FILL=1 axis), labels switch to weight 600.
- **FAB** — extended variant for the primary "Send to Badge" action on
  compact, regular large primary FAB on medium+. Carries `glow-primary` and
  level-3 elevation.
- **Card** — three variants: filled (surface-container), outlined (transparent
  with outline-variant border), elevated (surface-container-low + level-2
  shadow). All use the extra-large 28 px corner.
- **Buttons** — five variants (filled, tonal, outlined, text, elevated), four
  sizes (xs / sm / md / lg), every variant supports leading and trailing
  Material-Symbol icons, the leading-icon gap is 8 dp.
- **IconButton** — four variants × four sizes, full-circle state-layer.
- **Segmented Button** — single-select, check-icon swap on selection, the
  selected segment fills to secondary-container, the unselected segments
  remain transparent on the card surface.
- **Dialog** — full-screen on compact, centered modal on expanded; carries the
  surface-container-high background, level-3 elevation, and a 55 % black
  scrim.
- **Banners** become outlined Cards with a leading 28 dp Material-Symbols
  icon, a title-medium headline, body-small supporting text, and an action
  row at the bottom. The wake banner uses the tertiary container palette;
  the storage-full banner uses the error container palette.

## What we deliberately rejected

- We do **not** ship a light theme. The badge itself is a black puck and the
  product is used in dark rooms (conferences, conventions). Every screen is
  designed dark-first and dark-only.
- We do **not** use a third-party Material library. The token CSS is generated
  at build time from `@material/material-color-utilities`, then Tailwind maps
  every utility class to a `--md-sys-*` CSS var. Components are hand-built in
  Svelte so they stay Tailwind-ergonomic and ship with zero runtime overhead.
- We do **not** use neon gradient borders or `::before` glow tricks for the
  active state. State is communicated through the canonical M3 indicator
  pill + selected-icon FILL switch, plus a small color-shift on labels.
- We do **not** stack multiple panels in a bento layout. The mode panel is
  one card; secondary information (status detail, diagnostics, help) moves
  into the dialog instead of competing with the primary action.

## How to extend

If you need a new accent (e.g., a "QR scanned" success snackbar), use the
existing tertiary palette (violet) for celebratory moments and the existing
status-online green for confirmation pills. If you need a new component,
respect the four canonical M3 surface elevations
(surface → surface-container → surface-container-high → surface-bright) and
the existing shape scale; do not introduce a sixth corner radius. If you
need a new icon, source it from Material Symbols Outlined and use the
existing FILL/wght/GRAD/opsz axes — never mix in icons from another set.
