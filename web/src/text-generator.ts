/**
 * Text + text-effect frame generator for the 368×368 circular badge.
 *
 * Outputs an array of JPEG byte buffers, each encoded with `jpeg-js`
 * (fixed Huffman tables - required by the Jieli MJPEG decoder).
 */

import { encodeJpeg } from './lib/jpeg-encoder-client'

const SIZE = 368
const HALF = SIZE / 2

export type TextEffect =
  | 'static'
  | 'marquee'
  | 'rainbow'
  | 'blink'
  | 'bounce'
  | 'typewriter'
  | 'glow'
  | 'wave'

export interface TextEffectDef {
  id: TextEffect
  name: string
  description: string
  /** Effects that animate need a sane default frame count (single static frame for "static"). */
  defaultFrames: number
  /** Empirical bytes-per-frame for the cap math. */
  bytesPerFrame: number
}

export const TEXT_EFFECTS: TextEffectDef[] = [
  { id: 'static',     name: 'Static',     description: 'Single still frame',           defaultFrames: 1,  bytesPerFrame: 14000 },
  { id: 'marquee',    name: 'Marquee',    description: 'Scrolls right → left',         defaultFrames: 36, bytesPerFrame: 14000 },
  { id: 'rainbow',    name: 'Rainbow',    description: 'Hue cycles through the rainbow', defaultFrames: 24, bytesPerFrame: 16000 },
  { id: 'blink',      name: 'Blink',      description: 'On / off pulse',               defaultFrames: 12, bytesPerFrame: 9000  },
  { id: 'bounce',     name: 'Bounce',     description: 'Vertical ease bounce',         defaultFrames: 24, bytesPerFrame: 14000 },
  { id: 'typewriter', name: 'Typewriter', description: 'Reveals one char at a time',   defaultFrames: 24, bytesPerFrame: 12000 },
  { id: 'glow',       name: 'Glow Pulse', description: 'Soft halo breathes in & out',  defaultFrames: 24, bytesPerFrame: 18000 },
  { id: 'wave',       name: 'Wave',       description: 'Each letter rides a sine',     defaultFrames: 28, bytesPerFrame: 15000 },
]

export interface TextOptions {
  text: string
  effect: TextEffect
  fontFamily: string
  fontWeight: number
  color: string
  background: string
  frames: number
  fps: number
}

export interface TextDef {
  id: string
  name: string
  effect: TextEffect
  bytesPerFrame: number
}

function createCanvas(): [OffscreenCanvas, OffscreenCanvasRenderingContext2D] {
  const canvas = new OffscreenCanvas(SIZE, SIZE)
  // willReadFrequently: toJpeg() calls getImageData() per frame.
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  // Crispness hints: enable AA and ask the browser for geometric text precision.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // textRendering is a relatively new prop; cast through any to stay compat.
  ;(ctx as unknown as { textRendering?: string }).textRendering = 'geometricPrecision'
  return [canvas, ctx]
}

/**
 * Wait for the requested font to be available before rendering. Without this,
 * the first frame can render with a system fallback (and JPEG-bake that mistake
 * into every frame).
 */
async function ensureFontReady(family: string, weight: number, sizePx: number): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  try {
    // Strip stack quoting/fallbacks - load needs the primary family name.
    const primary = family.split(',')[0].trim().replace(/^["']|["']$/g, '')
    await document.fonts.load(`${weight} ${sizePx}px "${primary}"`)
    await document.fonts.ready
  } catch {
    // Best-effort; fall through to whatever the browser has.
  }
}

function clear(ctx: OffscreenCanvasRenderingContext2D, bg: string) {
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, SIZE, SIZE)
}

async function toJpeg(canvas: OffscreenCanvas, quality = 0.9): Promise<Uint8Array> {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return encodeJpeg(
    canvas.width,
    canvas.height,
    new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength),
    Math.max(1, Math.min(100, Math.round(quality * 100))),
  )
}

/**
 * Pick a font size that fits `text` inside `maxWidth` at `maxLines` line(s).
 * Returns the chosen size in px and the wrapped lines.
 */
function fitText(
  ctx: OffscreenCanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  fontWeight: number,
  maxWidth: number,
  maxHeight: number,
): { size: number; lines: string[] } {
  const safe = text || ' '
  // Try single-line first at decreasing sizes; then wrap to 2 lines.
  for (let size = 220; size >= 20; size -= 4) {
    ctx.font = `${fontWeight} ${size}px ${fontFamily}`
    const w = ctx.measureText(safe).width
    if (w <= maxWidth && size * 1.15 <= maxHeight) {
      return { size, lines: [safe] }
    }
  }
  // Wrap to up to 3 lines by words.
  const words = safe.split(/\s+/)
  for (let size = 140; size >= 14; size -= 4) {
    ctx.font = `${fontWeight} ${size}px ${fontFamily}`
    const lines: string[] = []
    let cur = ''
    for (const word of words) {
      const trial = cur ? cur + ' ' + word : word
      if (ctx.measureText(trial).width > maxWidth) {
        if (cur) lines.push(cur)
        cur = word
      } else {
        cur = trial
      }
    }
    if (cur) lines.push(cur)
    if (lines.length <= 3 && lines.length * size * 1.15 <= maxHeight) {
      return { size, lines }
    }
  }
  return { size: 24, lines: [safe.slice(0, 24)] }
}

function drawCenteredLines(
  ctx: OffscreenCanvasRenderingContext2D,
  lines: string[],
  size: number,
  color: string,
  yOffset = 0,
) {
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const lh = size * 1.15
  const total = lines.length * lh
  const startY = HALF - total / 2 + lh / 2 + yOffset
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], HALF, startY + i * lh)
  }
}

export async function generateTextFrames(opts: TextOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []
  // The badge is a CIRCULAR display. Use a margin from the inscribed safe area
  // so animation offsets (bounce dy, wave dy) don't push glyphs past the rim.
  const FRAME_PAD = 56
  const maxW = SIZE - FRAME_PAD * 2
  const maxH = SIZE - FRAME_PAD * 2

  // Ensure web fonts are loaded before measureText / fillText. Probe at the
  // largest size we might use so the font loader doesn't lazy-fetch mid-loop.
  await ensureFontReady(opts.fontFamily, opts.fontWeight, 220)

  const fit = fitText(ctx, opts.text, opts.fontFamily, opts.fontWeight, maxW, maxH)
  const totalFrames = Math.max(1, opts.effect === 'static' ? 1 : opts.frames)

  // Pre-measure for the typewriter so the font size stays locked across frames
  // and the visible prefix is anchored to a stable baseline (no jitter).
  let typewriterFit: { size: number; lines: string[] } | null = null
  if (opts.effect === 'typewriter') {
    typewriterFit = fitText(ctx, (opts.text || ' ') + '▌', opts.fontFamily, opts.fontWeight, maxW, maxH)
  }

  for (let f = 0; f < totalFrames; f++) {
    const phase = totalFrames === 1 ? 0 : f / totalFrames
    clear(ctx, opts.background)
    ctx.font = `${opts.fontWeight} ${fit.size}px ${opts.fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    switch (opts.effect) {
      case 'static': {
        drawCenteredLines(ctx, fit.lines, fit.size, opts.color)
        break
      }

      case 'marquee': {
        // Single-line scroll across the disc. One unwrapped line, vertically centered.
        const text = opts.text || ' '
        const size = Math.min(fit.size, 140)
        ctx.font = `${opts.fontWeight} ${size}px ${opts.fontFamily}`
        const tw = ctx.measureText(text).width
        const travel = SIZE + tw
        const x = SIZE + tw / 2 - phase * travel
        ctx.fillStyle = opts.color
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, x, HALF)
        break
      }

      case 'rainbow': {
        // Per-character hue with a rolling phase offset so letters cascade
        // through the spectrum together. Falls back to a single line of the
        // wrapped text so the cascade reads cleanly.
        const text = (fit.lines.join(' ') || ' ')
        const lineSize = Math.min(fit.size, 160)
        ctx.font = `${opts.fontWeight} ${lineSize}px ${opts.fontFamily}`
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'center'
        const widths: number[] = []
        let total = 0
        for (let i = 0; i < text.length; i++) {
          const w = ctx.measureText(text[i]).width
          widths.push(w)
          total += w
        }
        let x = HALF - total / 2
        for (let i = 0; i < text.length; i++) {
          const cw = widths[i]
          const hue = (phase * 360 + i * 28) % 360
          ctx.fillStyle = `hsl(${hue} 95% 60%)`
          ctx.fillText(text[i], x + cw / 2, HALF)
          x += cw
        }
        break
      }

      case 'blink': {
        // 60% on / 40% off - softer cadence than a hard half-and-half cut.
        if (phase < 0.6) drawCenteredLines(ctx, fit.lines, fit.size, opts.color)
        break
      }

      case 'bounce': {
        // Clamp dy so multi-line text never escapes the circular display.
        const lh = fit.size * 1.15
        const totalH = fit.lines.length * lh
        const headroom = Math.max(8, (SIZE - totalH) / 2 - FRAME_PAD * 0.5)
        const amp = Math.min(32, headroom)
        const dy = Math.sin(phase * Math.PI * 2) * amp
        drawCenteredLines(ctx, fit.lines, fit.size, opts.color, dy)
        break
      }

      case 'typewriter': {
        const text = opts.text || ' '
        const fit2 = typewriterFit ?? fit
        // Two-thirds reveal, one-third hold on the full text.
        const t = Math.min(1, phase / 0.66)
        const shown = Math.floor(t * text.length)
        const visible = text.slice(0, shown)
        const cursorOn = (Math.floor(phase * totalFrames * 2) % 2 === 0)
        // Anchor the typed run to a fixed left edge so revealed glyphs don't
        // jitter horizontally as more characters appear.
        ctx.font = `${opts.fontWeight} ${fit2.size}px ${opts.fontFamily}`
        const fullW = ctx.measureText(text).width
        const startX = HALF - fullW / 2
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = opts.color
        ctx.fillText(visible, startX, HALF)
        if (cursorOn) {
          const visW = ctx.measureText(visible).width
          ctx.fillText('▌', startX + visW, HALF)
        }
        break
      }

      case 'glow': {
        // Soft halo: stack three blurred passes (decreasing radius) to build a
        // smooth bloom, then draw the crisp glyph on top WITHOUT shadow so the
        // letterforms stay sharp through JPEG compression.
        const pulse = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2)
        ctx.save()
        ctx.shadowColor = opts.color
        ctx.shadowBlur = 18 + pulse * 22
        drawCenteredLines(ctx, fit.lines, fit.size, opts.color)
        ctx.shadowBlur = 8 + pulse * 12
        drawCenteredLines(ctx, fit.lines, fit.size, opts.color)
        ctx.restore()
        // Crisp top pass, no shadow.
        drawCenteredLines(ctx, fit.lines, fit.size, opts.color)
        break
      }

      case 'wave': {
        // Each letter rides a sine. Pre-measure widths once, then position each
        // glyph with textAlign='center' at its mid-x to avoid kerning drift.
        const text = opts.text || ' '
        const lineSize = Math.min(fit.size, 160)
        ctx.font = `${opts.fontWeight} ${lineSize}px ${opts.fontFamily}`
        ctx.textBaseline = 'middle'
        ctx.fillStyle = opts.color
        const widths: number[] = []
        let total = 0
        for (let i = 0; i < text.length; i++) {
          const w = ctx.measureText(text[i]).width
          widths.push(w)
          total += w
        }
        // Amplitude scales with line height for visual punch, but stays inside
        // the circular safe area so descenders never clip the rim.
        const amp = Math.min(38, Math.max(20, lineSize * 0.28))
        let x = HALF - total / 2
        ctx.textAlign = 'center'
        for (let i = 0; i < text.length; i++) {
          const cw = widths[i]
          const dy = Math.sin(phase * Math.PI * 2 + i * 0.7) * amp
          ctx.fillText(text[i], x + cw / 2, HALF + dy)
          x += cw
        }
        break
      }
    }

    // Higher quality (0.92) keeps text edges crisp through JPEG; the per-frame
    // cap math already budgets for ~16 KB at this quality.
    frames.push(await toJpeg(canvas, 0.92))
  }
  return frames
}

/** Available font choices (web-safe + a curated handful). */
export const TEXT_FONTS: { id: string; label: string; stack: string }[] = [
  { id: 'inter',    label: 'Inter',          stack: '"Inter Variable", Inter, system-ui, sans-serif' },
  { id: 'mono',     label: 'Mono',           stack: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace' },
  { id: 'serif',    label: 'Serif',          stack: 'Georgia, "Times New Roman", serif' },
  { id: 'sansbold', label: 'Heavy Sans',     stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id: 'rounded',  label: 'Rounded',        stack: '"SF Pro Rounded", "Avenir Next Rounded", system-ui, sans-serif' },
]
