import { SIZE, HALF, RADIUS, TAU, createCanvas, clear, circularMask, toJpeg, mulberry32 } from './helpers'
import type { PatternOptions } from './helpers'

// ===================================================================
// 1. Clock Face - 10:10 pose, one full second-hand sweep
// ===================================================================

export async function generateClockFace(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []
  const primary = '#00f2ff'

  // Hour and minute stay at the classic 10:10 pose. Advancing them across
  // the clip rewound both hands when the loop joined. A baked frame list
  // cannot follow the wall clock. The second hand does exactly one turn.
  const hr = 10 + 10 / 60
  const min = 10

  for (let f = 0; f < opts.frames; f++) {
    const phase = opts.frames <= 1 ? 0 : f / opts.frames
    const sec = phase * 60

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

    // Comet dots a fixed angle behind the tip. The offset does not depend
    // on frame count, so the trail at the end of the sweep matches frame 0.
    const trailN = 10
    const trailStep = 1.35
    const tip = RADIUS * 0.82
    for (let i = trailN; i >= 1; i--) {
      const ta = ((sec - i * trailStep) / 60) * TAU - Math.PI / 2
      const fade = 1 - i / (trailN + 1)
      ctx.globalAlpha = fade * 0.85
      ctx.fillStyle = primary
      ctx.beginPath()
      ctx.arc(HALF + Math.cos(ta) * tip, HALF + Math.sin(ta) * tip, 1.1 + fade * 1.8, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Second hand with glow
    const sa = (sec / 60) * TAU - Math.PI / 2
    ctx.shadowColor = primary
    ctx.shadowBlur = 12
    ctx.strokeStyle = primary
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(HALF, HALF)
    ctx.lineTo(HALF + Math.cos(sa) * tip, HALF + Math.sin(sa) * tip)
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
//
// The previous stepper used a 5-point Laplacian (neighbors summed with
// weight 1, center -4) together with Karl Sims' feed/kill constants and
// dt = 1. That Laplacian is about 5x too strong for those constants, so
// the chemicals diverged to NaN inside ~100 steps. Every exported frame
// was then a flat black disc.
//
// This uses Sims' 9-point kernel (weights 0.05 / 0.2 / -1), clamps both
// chemicals to [0, 1], and plays the growth forward then backward so the
// loop seam is a single integration stride instead of a hard cut.

const RD_SIM = 184
const RD_FEED = 0.037
const RD_KILL = 0.06
const RD_WARMUP = 100
const RD_GROWTH = 140
const RD_MAX_STRIDE = 28

export async function generateReactionDiffusion(opts: PatternOptions): Promise<Uint8Array[]> {
  if (opts.frames <= 0) return []

  const [canvas, ctx] = createCanvas()
  const sim = new OffscreenCanvas(RD_SIM, RD_SIM)
  const simCtx = sim.getContext('2d', { willReadFrequently: true })!
  const imageData = simCtx.createImageData(RD_SIM, RD_SIM)

  const W = RD_SIM
  let gridA = new Float32Array(W * W).fill(1)
  let gridB = new Float32Array(W * W).fill(0)
  let nextA = new Float32Array(W * W)
  let nextB = new Float32Array(W * W)

  seedReactionDiffusion(gridA, gridB, W)

  const step = (n: number) => {
    for (let s = 0; s < n; s++) {
      stepGrayScott(gridA, gridB, nextA, nextB, W, RD_FEED, RD_KILL)
      const swapA = gridA; gridA = nextA; nextA = swapA
      const swapB = gridB; gridB = nextB; nextB = swapB
    }
  }

  const render = async (): Promise<Uint8Array> => {
    paintReactionDiffusion(imageData.data, gridB, W)
    simCtx.putImageData(imageData, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(sim, 0, 0, SIZE, SIZE)
    circularMask(ctx)
    return toJpeg(canvas, 0.8)
  }

  // Still export: one developed frame, past the sparse seed stage.
  if (opts.frames < 2) {
    step(RD_WARMUP + RD_GROWTH)
    return [await render()]
  }

  step(RD_WARMUP)

  // Ping-pong. State s=0 is the young pattern, s=peak is fully grown.
  // Frame f maps to s, and the frame before frame 0 is state 1, so the
  // device loop is one stride of motion with no crossfade smear.
  const peak = Math.floor(opts.frames / 2)
  const stride = Math.max(1, Math.min(RD_MAX_STRIDE, Math.round(RD_GROWTH / peak)))
  const states: Uint8Array[] = []
  for (let s = 0; s <= peak; s++) {
    states.push(await render())
    if (s !== peak) step(stride)
  }

  const frames: Uint8Array[] = new Array(opts.frames)
  for (let f = 0; f < opts.frames; f++) {
    const idx = f <= peak ? f : (2 * peak - f)
    frames[f] = states[idx]
  }
  return frames
}

function seedReactionDiffusion(gridA: Float32Array, gridB: Float32Array, W: number) {
  const rng = mulberry32(42)
  const half = W / 2
  const rad = half - 2
  const seedCount = 24
  for (let s = 0; s < seedCount; s++) {
    const ang = rng() * TAU
    const dist = Math.sqrt(rng()) * rad * 0.88
    const cx = Math.floor(half + Math.cos(ang) * dist)
    const cy = Math.floor(half + Math.sin(ang) * dist)
    const r = 2 + Math.floor(rng() * 4)
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || y < 0 || x >= W || y >= W) continue
        const i = y * W + x
        gridB[i] = 1
        gridA[i] = 0.4
      }
    }
  }
}

function paintReactionDiffusion(data: Uint8ClampedArray, gridB: Float32Array, W: number) {
  const half = W / 2
  const rad = half - 1
  const rad2 = rad * rad
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4
      const dx = x - half
      const dy = y - half
      if (dx * dx + dy * dy > rad2) {
        data[o] = 6
        data[o + 1] = 4
        data[o + 2] = 18
        data[o + 3] = 255
        continue
      }
      const t = Math.max(0, Math.min(1, gridB[y * W + x] * 3.2))
      let r: number
      let g: number
      let b: number
      if (t < 0.4) {
        const u = t / 0.4
        r = 6 + u * 90
        g = 4 + u * 10
        b = 18 + u * 110
      } else if (t < 0.75) {
        const u = (t - 0.4) / 0.35
        r = 96 + u * (10 - 96)
        g = 14 + u * (210 - 14)
        b = 128 + u * (235 - 128)
      } else {
        const u = (t - 0.75) / 0.25
        r = 10 + u * 230
        g = 210 + u * 45
        b = 235 + u * 20
      }
      data[o] = r
      data[o + 1] = g
      data[o + 2] = b
      data[o + 3] = 255
    }
  }
}

/**
 * One Gray-Scott step. Laplacian is Karl Sims' 9-point kernel:
 *   0.05  0.20  0.05
 *   0.20 -1.00  0.20
 *   0.05  0.20  0.05
 * Edges are reflective so the circular crop does not show a wrap seam.
 * A and B are clamped; an unclamped step with dt = 1 can leave [0, 1].
 */
function stepGrayScott(
  a: Float32Array, b: Float32Array,
  na: Float32Array, nb: Float32Array,
  W: number, feed: number, kill: number,
) {
  const dA = 1
  const dB = 0.5
  const dt = 1
  for (let y = 0; y < W; y++) {
    const ym = y === 0 ? 0 : y - 1
    const yp = y === W - 1 ? W - 1 : y + 1
    const yRow = y * W
    const ymRow = ym * W
    const ypRow = yp * W
    for (let x = 0; x < W; x++) {
      const xm = x === 0 ? 0 : x - 1
      const xp = x === W - 1 ? W - 1 : x + 1
      const i = yRow + x
      const aC = a[i]
      const bC = b[i]
      const lapA =
        a[ymRow + xm] * 0.05 + a[ymRow + x] * 0.2 + a[ymRow + xp] * 0.05 +
        a[yRow + xm] * 0.2 + a[yRow + xp] * 0.2 +
        a[ypRow + xm] * 0.05 + a[ypRow + x] * 0.2 + a[ypRow + xp] * 0.05 -
        aC
      const lapB =
        b[ymRow + xm] * 0.05 + b[ymRow + x] * 0.2 + b[ymRow + xp] * 0.05 +
        b[yRow + xm] * 0.2 + b[yRow + xp] * 0.2 +
        b[ypRow + xm] * 0.05 + b[ypRow + x] * 0.2 + b[ypRow + xp] * 0.05 -
        bC
      const abb = aC * bC * bC
      let nA = aC + (dA * lapA - abb + feed * (1 - aC)) * dt
      let nB = bC + (dB * lapB + abb - (kill + feed) * bC) * dt
      if (nA < 0) nA = 0
      else if (nA > 1) nA = 1
      if (nB < 0) nB = 0
      else if (nB > 1) nB = 1
      na[i] = nA
      nb[i] = nB
    }
  }
}
