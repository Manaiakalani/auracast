import { SIZE, HALF, RADIUS, TAU, createCanvas, clear, circularMask, toJpeg, mulberry32 } from './helpers'
import type { PatternOptions } from './helpers'

// ===================================================================
// 1. Clock Face - phase-based analog clock (1 full second-hand sweep)
// ===================================================================

export async function generateClockFace(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []
  const primary = '#00f2ff'

  // Fixed reference: 10:10:00 (classic watch display pose)
  const baseHr = 10 + 10 / 60
  const baseMin = 10

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames
    // Second hand makes exactly 1 full revolution per loop (integer multiplier)
    const sec = phase * 60
    const min = baseMin + sec / 60
    const hr = baseHr + min / 720

    clear(ctx, '#0a0a0f')

    // Hour markers
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 2
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU - Math.PI / 2
      const r1 = RADIUS * 0.85
      const r2 = RADIUS * 0.92
      ctx.beginPath()
      ctx.moveTo(HALF + Math.cos(a) * r1, HALF + Math.sin(a) * r1)
      ctx.lineTo(HALF + Math.cos(a) * r2, HALF + Math.sin(a) * r2)
      ctx.stroke()
    }

    // Hour hand
    const ha = (hr / 12) * TAU - Math.PI / 2
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(HALF, HALF)
    ctx.lineTo(HALF + Math.cos(ha) * RADIUS * 0.5, HALF + Math.sin(ha) * RADIUS * 0.5)
    ctx.stroke()

    // Minute hand
    const ma = (min / 60) * TAU - Math.PI / 2
    ctx.strokeStyle = '#eee'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(HALF, HALF)
    ctx.lineTo(HALF + Math.cos(ma) * RADIUS * 0.72, HALF + Math.sin(ma) * RADIUS * 0.72)
    ctx.stroke()

    // Second hand with glow
    const sa = (sec / 60) * TAU - Math.PI / 2
    ctx.shadowColor = primary
    ctx.shadowBlur = 12
    ctx.strokeStyle = primary
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(HALF, HALF)
    ctx.lineTo(HALF + Math.cos(sa) * RADIUS * 0.82, HALF + Math.sin(sa) * RADIUS * 0.82)
    ctx.stroke()
    ctx.shadowBlur = 0

    // Center dot
    ctx.fillStyle = primary
    ctx.beginPath()
    ctx.arc(HALF, HALF, 4, 0, TAU)
    ctx.fill()

    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.85))
  }
  return frames
}

// ===================================================================
// 2. Fireworks - closed-form particle bursts (loop-safe)
// ===================================================================

interface Burst {
  phase: number; cx: number; cy: number; colorIdx: number
}

export async function generateFireworks(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []
  const rng = mulberry32(7)
  const colors = ['#00f2ff', '#bc00ff', '#ff6a00', '#ffd700']
  const gravity = 0.15
  const burstCount = 5
  const burstDuration = 0.4
  const particleCount = 40

  // Pre-compute burst timing and positions
  const bursts: Burst[] = []
  for (let i = 0; i < burstCount; i++) {
    bursts.push({
      phase: i / burstCount,
      cx: HALF + (rng() - 0.5) * RADIUS * 1.2,
      cy: HALF * 0.4 + rng() * HALF * 0.6,
      colorIdx: Math.floor(rng() * colors.length),
    })
  }

  // Pre-compute per-burst particle velocities (deterministic per burst)
  const burstVels: { vx: number; vy: number }[][] = bursts.map((burst) => {
    const bRng = mulberry32(Math.floor(burst.phase * 1000) + 1)
    const vels: { vx: number; vy: number }[] = []
    for (let p = 0; p < particleCount; p++) {
      const angle = bRng() * TAU
      const speed = 1.5 + bRng() * 3.5
      vels.push({ vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1.5 })
    }
    return vels
  })

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames

    // Full clear each frame (closed-form, no trail accumulation)
    clear(ctx, '#050210')

    for (let bi = 0; bi < bursts.length; bi++) {
      const burst = bursts[bi]
      const localPhase = (phase - burst.phase + 1) % 1
      if (localPhase > burstDuration) continue

      const t = localPhase / burstDuration
      const elapsed = t * 30

      for (let p = 0; p < particleCount; p++) {
        const { vx, vy } = burstVels[bi][p]
        const px = burst.cx + vx * elapsed
        const py = burst.cy + vy * elapsed + 0.5 * gravity * elapsed * elapsed

        const life = 1 - t
        if (life <= 0) continue

        const alpha = life * life
        const ci = (burst.colorIdx + (p % 2)) % colors.length
        ctx.globalAlpha = alpha
        ctx.fillStyle = colors[ci]
        ctx.beginPath()
        ctx.arc(px, py, 1.5 + life * 1.5, 0, TAU)
        ctx.fill()
      }
    }

    ctx.globalAlpha = 1
    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.8))
  }
  return frames
}

// ===================================================================
// 3. Perlin Flow Field - particles following noise vectors
// ===================================================================

// Simple 2D gradient noise (hash-based, no deps)
function grad2(hash: number, x: number, y: number): number {
  const h = hash & 7
  const u = h < 4 ? x : y
  const v = h < 4 ? y : x
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v)
}

function fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10) }
function lerp(a: number, b: number, t: number): number { return a + t * (b - a) }

const PERM = new Uint8Array(512)
;(function initPerm() {
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  const rng = mulberry32(12345)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]
})()

function noise2d(x: number, y: number): number {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255
  const xf = x - Math.floor(x), yf = y - Math.floor(y)
  const u = fade(xf), v = fade(yf)
  const aa = PERM[PERM[X] + Y], ab = PERM[PERM[X] + Y + 1]
  const ba = PERM[PERM[X + 1] + Y], bb = PERM[PERM[X + 1] + Y + 1]
  return lerp(
    lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u),
    lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u),
    v,
  )
}

export async function generatePerlinFlowField(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const imageData = ctx.createImageData(SIZE, SIZE)
  const frames: Uint8Array[] = []
  const scale = 0.015
  const primary = [0, 242, 255] // #00f2ff
  const tertiary = [188, 0, 255] // #bc00ff

  // Closed-form per-pixel: noise field sampled at a looping offset.
  // Each pixel shows a streak whose brightness pulses with the flow angle.
  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames
    // Loop offset via sin/cos (integer period = seamless)
    const offX = Math.cos(phase * TAU) * 3
    const offY = Math.sin(phase * TAU) * 3
    const data = imageData.data

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const nx = x * scale + offX
        const ny = y * scale + offY
        const angle = noise2d(nx, ny) * TAU
        // Flow line brightness: how aligned is this pixel with the flow?
        const flow = noise2d(nx + 10, ny + 10)
        const streak = Math.abs(Math.sin(angle + phase * TAU))
        const intensity = (0.3 + 0.7 * streak) * (0.5 + 0.5 * flow)
        const v = Math.max(0, Math.min(1, intensity))

        // Color: gradient from primary to tertiary based on flow
        const colorT = (flow + 1) * 0.5
        const r = Math.floor((primary[0] * (1 - colorT) + tertiary[0] * colorT) * v)
        const g = Math.floor((primary[1] * (1 - colorT) + tertiary[1] * colorT) * v)
        const b = Math.floor((primary[2] * (1 - colorT) + tertiary[2] * colorT) * v)

        const i = (y * SIZE + x) * 4
        data[i] = r
        data[i + 1] = g
        data[i + 2] = b
        data[i + 3] = 255
      }
    }

    ctx.putImageData(imageData, 0, 0)
    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.8))
  }
  return frames
}

// ===================================================================
// 4. Reaction Diffusion - Gray-Scott model
// ===================================================================

export async function generateReactionDiffusion(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const W = SIZE
  const rng = mulberry32(42)

  // Gray-Scott parameters (coral growth pattern)
  const feed = 0.055
  const kill = 0.062
  const dA = 1.0
  const dB = 0.5
  const dt = 1.0

  // Initialize grids
  let gridA = new Float32Array(W * W).fill(1)
  let gridB = new Float32Array(W * W).fill(0)
  let nextA = new Float32Array(W * W)
  let nextB = new Float32Array(W * W)

  // Seed spots
  const seedCount = 8
  for (let s = 0; s < seedCount; s++) {
    const cx = Math.floor(HALF + (rng() - 0.5) * RADIUS)
    const cy = Math.floor(HALF + (rng() - 0.5) * RADIUS)
    const r = 4 + Math.floor(rng() * 6)
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue
        const x = cx + dx, y = cy + dy
        if (x < 0 || x >= W || y < 0 || y >= W) continue
        gridB[y * W + x] = 1
      }
    }
  }

  // Pre-run to develop the pattern into steady state
  const preSteps = 800
  for (let s = 0; s < preSteps; s++) {
    stepRD(gridA, gridB, nextA, nextB, W, feed, kill, dA, dB, dt)
    const tA = gridA; gridA = nextA; nextA = tA
    const tB = gridB; gridB = nextB; nextB = tB
  }

  // Generate raw pixel data, then crossfade ends for seamless loop
  const stepsPerFrame = 12
  const imageData = ctx.createImageData(W, W)
  const primary = [0, 242, 255] // #00f2ff
  const crossfadeFrames = Math.max(2, Math.floor(opts.frames * 0.2))

  // Store raw grid-B snapshots for the crossfade window
  const totalRaw = opts.frames + crossfadeFrames
  const gridSnapshots: Float32Array[] = []

  for (let f = 0; f < totalRaw; f++) {
    for (let s = 0; s < stepsPerFrame; s++) {
      stepRD(gridA, gridB, nextA, nextB, W, feed, kill, dA, dB, dt)
      const tA = gridA; gridA = nextA; nextA = tA
      const tB = gridB; gridB = nextB; nextB = tB
    }
    gridSnapshots.push(new Float32Array(gridB))
  }

  // Render frames with crossfade at the tail
  const frames: Uint8Array[] = []
  for (let f = 0; f < opts.frames; f++) {
    const data = imageData.data
    const isBlend = f >= opts.frames - crossfadeFrames
    const blendAlpha = isBlend
      ? (f - (opts.frames - crossfadeFrames) + 1) / (crossfadeFrames + 1)
      : 0

    for (let i = 0; i < W * W; i++) {
      let bVal = gridSnapshots[f][i]
      if (isBlend) {
        // Lerp between current frame and the corresponding wrapped frame
        const wrapVal = gridSnapshots[f + crossfadeFrames][i]
        bVal = bVal * (1 - blendAlpha) + wrapVal * blendAlpha
      }
      const b = Math.min(1, bVal * 2.5)
      const idx = i * 4
      data[idx] = Math.floor(b * primary[0])
      data[idx + 1] = Math.floor(b * primary[1])
      data[idx + 2] = Math.floor(b * primary[2])
      data[idx + 3] = 255
    }

    ctx.putImageData(imageData, 0, 0)
    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.8))
  }
  return frames
}

function stepRD(
  a: Float32Array, b: Float32Array,
  na: Float32Array, nb: Float32Array,
  W: number, feed: number, kill: number,
  dA: number, dB: number, dt: number,
) {
  for (let y = 0; y < W; y++) {
    const ym = y === 0 ? W - 1 : y - 1
    const yp = y === W - 1 ? 0 : y + 1
    for (let x = 0; x < W; x++) {
      const xm = x === 0 ? W - 1 : x - 1
      const xp = x === W - 1 ? 0 : x + 1
      const i = y * W + x
      const laplaceA = a[ym * W + x] + a[yp * W + x] + a[y * W + xm] + a[y * W + xp] - 4 * a[i]
      const laplaceB = b[ym * W + x] + b[yp * W + x] + b[y * W + xm] + b[y * W + xp] - 4 * b[i]
      const abb = a[i] * b[i] * b[i]
      na[i] = a[i] + (dA * laplaceA - abb + feed * (1 - a[i])) * dt
      nb[i] = b[i] + (dB * laplaceB + abb - (kill + feed) * b[i]) * dt
    }
  }
}
