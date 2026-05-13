/**
 * Lightweight pattern registry metadata.
 *
 * Only the metadata (id, name, icon, description, bytesPerFrame, optional
 * colors) is eagerly imported so PatternMode.svelte can render the card
 * grid on initial load without pulling in the ~3000-line pattern-impls
 * module. The `generate` function on each entry is a tiny lazy wrapper
 * that dynamic-imports `./pattern-impls` on first invocation and caches
 * the module promise for subsequent calls.
 */

export interface PatternOptions {
  frames: number
  fps: number
  colors?: string[]
}

export interface PatternMeta {
  id: string
  /** Key in the GENERATORS record (used by the pattern worker). */
  generatorKey: string
  name: string
  icon: string
  description: string
  /**
   * Empirical bytes per JPEG frame at quality 0.9 (or per-pattern override
   * applied inside the generator). Measured via the Playwright pattern
   * audit on 2026-05-03 - used by the UI to gate frame-count and warn when
   * the user would exceed the badge's per-file ~900 KB cap.
   */
  bytesPerFrame: number
  colors?: string[]
  generate: (opts: PatternOptions) => Promise<Uint8Array[]>
}

type ImplsModule = typeof import('./pattern-impls')
type GeneratorKey = keyof ImplsModule['GENERATORS']

let implsPromise: Promise<ImplsModule> | null = null
const loadImpls = (): Promise<ImplsModule> => (implsPromise ??= import('./pattern-impls'))

const lazy =
  (key: GeneratorKey) =>
  async (opts: PatternOptions): Promise<Uint8Array[]> => {
    const mod = await loadImpls()
    return mod.GENERATORS[key](opts)
  }

/** Build a pattern entry with generatorKey auto-derived from the lazy key. */
function pat(
  id: string,
  key: GeneratorKey,
  name: string,
  icon: string,
  description: string,
  bytesPerFrame: number,
): PatternMeta {
  return { id, generatorKey: key, name, icon, description, bytesPerFrame, generate: lazy(key) }
}

export const PATTERNS: PatternMeta[] = [
  pat('matrix', 'matrixRain', 'Matrix Rain', '🟩', 'Cascading green characters', 26000),
  pat('gameoflife', 'gameOfLife', 'Game of Life', '🧬', 'Conway\'s cellular automata', 29000),
  pat('plasma', 'plasmaWaves', 'Plasma Waves', '🌊', 'Psychedelic color plasma', 30000),
  pat('braille', 'brailleMatrix', 'Braille Matrix', '⠿', 'Unicode braille wave patterns', 23000),
  pat('aurora', 'auroraRibbons', 'Aurora Ribbons', '🌈', 'Northern lights drifting across the badge', 32000),
  pat('radar', 'radarSweep', 'Radar Sweep', '📡', 'Sci-fi radar with blips', 19000),
  pat('arc-radar', 'arcRadar', 'Arc Radar', '🛰️', 'Tactical contact tracker with comet trails', 24000),
  pat('arc-radar-hd', 'arcRadarHd', 'Arc Radar HD', '📍', 'Faithful CRT tactical screen with bracketed callout', 28000),
  pat('beskar-sigil', 'beskarSigil', 'Beskar Sigil', '🔥', 'Mandalorian tracking-fob HUD with glowing red sigil', 26000),
  pat('mando-compass', 'mandoCompass', 'Mando Compass', '🧭', 'Amber Mandalorian tracking dial with rotating needle', 27000),
  pat('the-traveller', 'theTraveller', 'The Traveller', '🌕', 'Pale sphere with golden light leaking from cracks', 32000),
  pat('campus-9', 'campus9', 'Neon Corridor', '🌆', 'Synthwave neon grid receding to a vanishing point', 22000),
  pat('ishtar-sink', 'ishtarSink', 'Ishtar Sink', '🛸', 'Campus 9 cinematic: Hunter glyph in sacred geometry', 16000),
  pat('altar-of-oryx', 'altarOfOryx', 'Altar of Oryx', '🟢', 'Hive altar with green flames and taken-purple haze', 30000),
  pat('the-dawning', 'theDawning', 'The Dawning', '❄️', 'Cozy hearth glow with drifting snowflakes', 24000),
  pat('spirals', 'hypnoticSpirals', 'Hypnotic Spirals', '🌀', 'Twisting neon spiral arms', 32000),
  pat('voronoi', 'voronoiCrystals', 'Voronoi Crystals', '💎', 'Faceted gem cells with glowing edges', 34000),
  pat('lava', 'lavaMarble', 'Lava Marble', '🌋', 'Liquid-metal heatmap with smoky flow', 32000),
  pat('waves', 'concentricWaves', 'Concentric Waves', '🎯', 'Expanding ripple rings', 13000),
  pat('dither', 'ditherMagic', 'Dither Magic', '🔲', 'Bayer dithered magma orb', 52000),
  pat('kaleidoscope', 'kaleidoscope', 'Kaleidoscope', '🔮', 'Eight-fold mirror prism, slow rotation', 32000),
  pat('fire', 'fireParticles', 'Fire Particles', '🔥', 'Rising embers with warm heat shimmer', 18000),
  pat('snow', 'snowfall', 'Snowfall', '❄️', 'Gentle drifting snowflakes on a winter night', 14000),
  pat('cyberpunk', 'cyberpunkRain', 'Cyberpunk Rain', '🌃', 'Neon-lit rain streaks in a dark city', 16000),
  pat('danmaku', 'danmaku', 'Danmaku', '📜', 'Glowing text scrolling across the badge', 16000),
  pat('clock', 'clockFace', 'Clock Face', '🕐', 'Minimal analog clock synced to real time', 18000),
  pat('fireworks', 'fireworks', 'Fireworks', '🎆', 'Particle bursts with gravity and fade trails', 22000),
  pat('flow-field', 'perlinFlowField', 'Flow Field', '🌊', 'Particles drifting through a noise vector field', 20000),
  pat('reaction-diffusion', 'reactionDiffusion', 'Reaction Diffusion', '🧫', 'Organic Gray-Scott chemical pattern growth', 24000),
]
