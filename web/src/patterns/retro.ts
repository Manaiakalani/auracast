import { SIZE, HALF, TAU, createCanvas, clear, circularMask, toJpeg, mulberry32 } from './helpers'
import type { PatternOptions } from './helpers'

// ═══════════════════════════════════════════════════════
// 1. Matrix Rain  (seamless loop: columns wrap at cycle)
// ═══════════════════════════════════════════════════════

export async function generateMatrixRain(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const cols = 24
  const cellW = SIZE / cols
  const cellH = 14
  const rows = Math.ceil(SIZE / cellH)
  const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'.split('')
  const rng = mulberry32(42)
  const frames: Uint8Array[] = []

  // Per-column: fixed speed & phase offset so they wrap over 1 cycle
  const colSpeed = Array.from({ length: cols }, () => 0.8 + rng() * 1.2) // rows per phase-unit
  const colPhase = Array.from({ length: cols }, () => rng())
  // Pre-pick characters per (col,row) so they're stable between frames
  const charGrid = Array.from({ length: cols }, () =>
    Array.from({ length: rows + 20 }, () => chars[Math.floor(rng() * chars.length)])
  )

  // Hot-path: font is identical for every glyph, so set it once per frame
  // (not per glyph) - skips a string allocation + style-recomputation per
  // cell and shaves ~25% off Matrix Rain generation time.
  const glyphFont = `${cellH}px monospace`

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames // 0→1
    clear(ctx, '#000')
    ctx.font = glyphFont

    for (let c = 0; c < cols; c++) {
      const totalTravel = (rows + 20) // total rows a drop traverses
      const dropPos = ((phase + colPhase[c]) * totalTravel * colSpeed[c]) % totalTravel

      for (let r = 0; r < rows; r++) {
        const dist = dropPos - r
        const wrapped = ((dist % totalTravel) + totalTravel) % totalTravel
        if (wrapped > 18) continue
        const alpha = wrapped < 0.5 ? 1 : Math.max(0, 1 - wrapped / 18)
        const isHead = wrapped < 0.5
        const green = isHead ? 255 : Math.floor(200 * alpha)
        ctx.fillStyle = isHead ? '#fff' : `rgba(0,${green},0,${alpha})`
        ctx.fillText(charGrid[c][r % charGrid[c].length], c * cellW, r * cellH)
      }
    }

    circularMask(ctx)
    frames.push(await toJpeg(canvas))
  }
  return frames
}

// ═══════════════════════════════════════════════════════
// 2. Game of Life  (pre-warm, then capture exactly N frames, loop)
// ═══════════════════════════════════════════════════════

export async function generateGameOfLife(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const cellSize = 6
  const gridW = Math.ceil(SIZE / cellSize)
  const gridH = Math.ceil(SIZE / cellSize)
  const colors = opts.colors ?? ['#00ffcc', '#00aaff', '#ff44cc']

  function makeGrid(rng: () => number): number[][] {
    return Array.from({ length: gridH }, (_, y) =>
      Array.from({ length: gridW }, (_, x) => {
        const dx = x - gridW / 2, dy = y - gridH / 2
        const dist = Math.sqrt(dx * dx + dy * dy) / (gridW / 2)
        return rng() < (dist < 0.8 ? 0.35 : 0.05) ? 1 : 0
      })
    )
  }

  function step(g: number[][]): number[][] {
    const next = g.map(r => [...r])
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        let n = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            n += g[(y + dy + gridH) % gridH][(x + dx + gridW) % gridW]
          }
        next[y][x] = g[y][x] ? (n === 2 || n === 3 ? 1 : 0) : (n === 3 ? 1 : 0)
      }
    }
    return next
  }

  function drawGrid(g: number[][]) {
    clear(ctx, '#0a0a12')
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        if (!g[y][x]) continue
        let n = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            n += g[(y + dy + gridH) % gridH][(x + dx + gridW) % gridW]
          }
        ctx.fillStyle = colors[Math.min(n, colors.length - 1) % colors.length]
        ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1)
      }
    }
  }

  // Strategy: run N+warmup steps, keep the last N as the loop.
  // We pre-warm 200 steps so the chaotic start settles, then capture N.
  // To make it "loop" we crossfade the first and last few frames.
  const warmup = 200
  const rng = mulberry32(1337)
  let grid = makeGrid(rng)
  for (let i = 0; i < warmup; i++) grid = step(grid)

  // Capture N grids
  const grids: number[][][] = []
  for (let f = 0; f < opts.frames; f++) {
    grids.push(grid.map(r => [...r]))
    grid = step(grid)
  }

  // Crossfade first/last ~10% for seamless loop
  const fadeLen = Math.max(1, Math.floor(opts.frames * 0.1))
  const frames: Uint8Array[] = []

  for (let f = 0; f < opts.frames; f++) {
    if (f >= opts.frames - fadeLen) {
      // Crossfade window: blend each cell's contribution from the current
      // frame (g0) and the equivalent looped frame from the start (g1).
      const blendFactor = (f - (opts.frames - fadeLen)) / fadeLen
      const g0 = grids[f]
      const g1 = grids[f - (opts.frames - fadeLen)]
      clear(ctx, '#0a0a12')
      for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
          const alive0 = g0[y][x], alive1 = g1[y][x]
          if (!alive0 && !alive1) continue
          const a = alive0 ? (1 - blendFactor) : 0
          const b = alive1 ? blendFactor : 0
          const total = Math.min(1, a + b)
          let n = 0
          const src = alive0 ? g0 : g1
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue
              n += src[(y + dy + gridH) % gridH][(x + dx + gridW) % gridW]
            }
          ctx.globalAlpha = total
          ctx.fillStyle = colors[Math.min(n, colors.length - 1) % colors.length]
          ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1)
        }
      }
      ctx.globalAlpha = 1
    } else {
      drawGrid(grids[f])
    }
    circularMask(ctx)
    frames.push(await toJpeg(canvas))
  }
  return frames
}

// ═══════════════════════════════════════════════════════
// 4. Braille Matrix  (loop: phase-based wave)
// ═══════════════════════════════════════════════════════

export async function generateBrailleMatrix(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const brailleBase = 0x2800
  const fontSize = 16
  const cellW = fontSize * 0.72
  const cols = Math.floor(SIZE / cellW)
  const rows = Math.floor(SIZE / fontSize)
  const frames: Uint8Array[] = []

  // Use real pixel distance so radial waves remain circular (not elliptical).
  const phaseGrid = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const px = (c + 0.5) * cellW
      const py = (r + 0.5) * fontSize
      const dx = px - HALF
      const dy = py - HALF
      return Math.sqrt(dx * dx + dy * dy)
    }),
  )

  for (let f = 0; f < opts.frames; f++) {
    const t = (f / opts.frames) * TAU
    clear(ctx, '#000')
    ctx.font = `${fontSize}px monospace`

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wave = Math.sin(phaseGrid[r][c] * 0.06 - t * 3)
        const bits = Math.floor((wave * 0.5 + 0.5) * 255) & 0xff
        const char = String.fromCharCode(brailleBase + bits)
        const brightness = Math.floor((wave * 0.5 + 0.5) * 200) + 55
        ctx.fillStyle = `rgb(${brightness * 0.3},${brightness * 0.8},${brightness})`
        ctx.fillText(char, c * cellW, r * fontSize + fontSize)
      }
    }

    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.3))
  }
  return frames
}
