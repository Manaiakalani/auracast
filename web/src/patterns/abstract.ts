import { SIZE, HALF, RADIUS, TAU, createCanvas, clear, circularMask, toJpeg, mulberry32 } from './helpers'
import type { PatternOptions } from './helpers'

// ═══════════════════════════════════════════════════════
// 3. Plasma Waves  (loop: phase = f/frames * TAU)
// ═══════════════════════════════════════════════════════

export async function generatePlasmaWaves(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const imageData = ctx.createImageData(SIZE, SIZE)
  const frames: Uint8Array[] = []

  for (let f = 0; f < opts.frames; f++) {
    const t = (f / opts.frames) * TAU  // loops at TAU
    const data = imageData.data

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const nx = x / SIZE - 0.5, ny = y / SIZE - 0.5
        const v1 = Math.sin(x * 0.03 + t)
        const v2 = Math.sin(y * 0.04 - t)
        const v3 = Math.sin((x + y) * 0.02 + t)
        const v4 = Math.sin(Math.sqrt(nx * nx + ny * ny) * 20 - t * 2)
        const v = (v1 + v2 + v3 + v4) / 4

        const i = (y * SIZE + x) * 4
        data[i]     = Math.floor((Math.sin(v * Math.PI) * 0.5 + 0.5) * 120)
        data[i + 1] = Math.floor((Math.sin(v * Math.PI + 2) * 0.5 + 0.5) * 255)
        data[i + 2] = Math.floor((Math.sin(v * Math.PI + 4) * 0.5 + 0.5) * 255)
        data[i + 3] = 255
      }
    }

    ctx.putImageData(imageData, 0, 0)
    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.75))
  }
  return frames
}

// ═══════════════════════════════════════════════════════
// 5. Aurora Ribbons  (loop: phase = f/frames)
// ═══════════════════════════════════════════════════════

// Smoothed pseudo-noise indexed 0..SIZE.  Returns a 1-cycle-periodic
// signal so striations can be x-drifted endlessly without seams.
function buildStriations(seed: number): Float32Array {
  const rng = mulberry32(seed)
  const coarse = 28
  const cp = new Float32Array(coarse)
  for (let i = 0; i < coarse; i++) cp[i] = rng()
  const out = new Float32Array(SIZE)
  for (let x = 0; x < SIZE; x++) {
    const t = (x / SIZE) * coarse
    const i0 = Math.floor(t) % coarse
    const i1 = (i0 + 1) % coarse
    const k = t - Math.floor(t)
    const sm = k * k * (3 - 2 * k)
    out[x] = cp[i0] * (1 - sm) + cp[i1] * sm
  }
  return out
}

export async function generateAuroraRibbons(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const imageData = ctx.createImageData(SIZE, SIZE)
  const frames: Uint8Array[] = []

  // Three flowing veils.  CRUCIAL for seamless looping: every time-driven
  // term must complete an integer number of cycles over the loop.  We
  // express each veil with integer cycle counts (cycles*phase*TAU) rather
  // than arbitrary "speed" floats.  Each veil's curtain "drifts" along x
  // by an integer-pixel offset per loop too.
  type Veil = {
    y: number; coreH: number; alpha: number;
    amp: number; freq: number;
    c1: number; c2: number;             // integer cycles for two spine sines
    driftCycles: number;                // integer x-drift cycles per loop
    hueShift: number;
    striationSeed: number;
  }
  const veils: Veil[] = [
    { y: 0.30, coreH: 64, alpha: 0.95, amp: 26, freq: 0.022, c1: 1, c2: 2, driftCycles: 1, hueShift:   0, striationSeed: 11 },
    { y: 0.50, coreH: 60, alpha: 0.85, amp: 20, freq: 0.018, c1: 2, c2: 3, driftCycles: 2, hueShift:  30, striationSeed: 23 },
    { y: 0.68, coreH: 52, alpha: 0.75, amp: 22, freq: 0.026, c1: 1, c2: 1, driftCycles: 1, hueShift: -20, striationSeed: 37 },
  ]

  // Build vertical color LUT per veil · violet rim -> magenta -> emerald
  // core -> teal -> deep-blue foot.  hueShift rotates around grey on RG
  // plane (cheap approximation to a proper HSL rotation).
  function buildVeilLut(hueShift: number): Uint8Array {
    const stops = [
      { p: 0.00, r: 130, g:  40, b: 180 },
      { p: 0.18, r: 220, g:  80, b: 180 },
      { p: 0.42, r: 100, g: 240, b: 140 },
      { p: 0.60, r:  60, g: 220, b: 180 },
      { p: 0.85, r:  30, g: 160, b: 200 },
      { p: 1.00, r:  10, g:  40, b:  70 },
    ]
    const lut = new Uint8Array(96 * 3)
    const cs = Math.cos((hueShift * Math.PI) / 180)
    const sn = Math.sin((hueShift * Math.PI) / 180)
    for (let i = 0; i < 96; i++) {
      const p = i / 95
      let a = stops[0], b = stops[stops.length - 1]
      for (let s = 0; s < stops.length - 1; s++) {
        if (p >= stops[s].p && p <= stops[s + 1].p) { a = stops[s]; b = stops[s + 1]; break }
      }
      const k = (p - a.p) / Math.max(0.0001, b.p - a.p)
      const r = a.r + (b.r - a.r) * k
      const g = a.g + (b.g - a.g) * k
      const bl = a.b + (b.b - a.b) * k
      const grey = (r + g + bl) / 3
      const rr = grey + (r - grey) * cs - (g - grey) * sn
      const gg = grey + (r - grey) * sn + (g - grey) * cs
      lut[i * 3]     = Math.max(0, Math.min(255, rr))
      lut[i * 3 + 1] = Math.max(0, Math.min(255, gg))
      lut[i * 3 + 2] = Math.max(0, Math.min(255, bl))
    }
    return lut
  }
  const veilLuts = veils.map(v => buildVeilLut(v.hueShift))

  const veilStriations = veils.map(v => buildStriations(v.striationSeed))

  // Stars · twinkle phase chosen so phase=0 and phase=1 match (sin(t*2*N)
  // with integer N over t in [0, TAU]).  N=1 here (2-cycle twinkle).
  const stars: { x: number; y: number; b: number; tw: number }[] = []
  const rng = mulberry32(7)
  for (let i = 0; i < 70; i++) {
    stars.push({ x: rng() * SIZE, y: rng() * SIZE * 0.5, b: 0.35 + rng() * 0.55, tw: rng() * TAU })
  }

  // Constant night-sky background.
  const bgBuf = new Uint8Array(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y++) {
    const t = y / SIZE
    const r = Math.round(4 + (1 - t) * 6)
    const g = Math.round(3 + (1 - t) * 8)
    const b = Math.round(14 + (1 - t) * 26)
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4
      bgBuf[i] = r; bgBuf[i + 1] = g; bgBuf[i + 2] = b; bgBuf[i + 3] = 255
    }
  }

  const spineY = new Float32Array(SIZE * veils.length)

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames
    const t = phase * TAU
    const data = imageData.data

    data.set(bgBuf)

    // Stars · twinkle at integer cycles for seamless loop.
    for (let s = 0; s < stars.length; s++) {
      const st = stars[s]
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + st.tw)   // 2 cycles per loop
      const v = (st.b * tw * 200) | 0
      const i = ((st.y | 0) * SIZE + (st.x | 0)) * 4
      data[i]     = Math.min(255, data[i]     + v)
      data[i + 1] = Math.min(255, data[i + 1] + v)
      data[i + 2] = Math.min(255, data[i + 2] + v)
    }

    // Precompute spine Y per (veil, column) using ONLY integer-cycle
    // time terms so the wave shape is identical at phase 0 and phase 1.
    for (let v = 0; v < veils.length; v++) {
      const vv = veils[v]
      const yBase = vv.y * SIZE
      const t1 = t * vv.c1
      const t2 = t * vv.c2
      for (let x = 0; x < SIZE; x++) {
        spineY[v * SIZE + x] = yBase
          + Math.sin(x * vv.freq + t1) * vv.amp
          + Math.sin(x * vv.freq * 0.4 + t2) * vv.amp * 0.35
      }
    }

    // Per-pixel veil accumulation.
    for (let v = 0; v < veils.length; v++) {
      const vv = veils[v]
      const lut = veilLuts[v]
      const strs = veilStriations[v]
      // x-drift completes integer cycles per loop (seamless wrap).
      const driftPx = Math.round(phase * SIZE * vv.driftCycles)
      const yHalf = vv.coreH
      const invDenom = 1 / (2 * yHalf)
      for (let y = 0; y < SIZE; y++) {
        const rowBase = y * SIZE * 4
        for (let x = 0; x < SIZE; x++) {
          const dy = y - spineY[v * SIZE + x]
          if (dy < -yHalf || dy > yHalf) continue
          const yp = (dy + yHalf) * invDenom    // 0..1
          const li = Math.min(95, Math.max(0, (yp * 95) | 0)) * 3
          let lr = lut[li], lg = lut[li + 1], lb = lut[li + 2]
          const fall = yp < 0.15
            ? yp / 0.15
            : yp > 0.85
              ? (1 - yp) / 0.15
              : 1
          const stx = ((x + driftPx) % SIZE + SIZE) % SIZE
          const str = 0.55 + 0.45 * strs[stx]
          const w = fall * str * vv.alpha
          if (w <= 0.01) continue
          lr *= w; lg *= w; lb *= w
          const i = rowBase + x * 4
          const nr = data[i]     + lr; data[i]     = nr > 255 ? 255 : nr
          const ng = data[i + 1] + lg; data[i + 1] = ng > 255 ? 255 : ng
          const nb = data[i + 2] + lb; data[i + 2] = nb > 255 ? 255 : nb
        }
      }
    }

    ctx.putImageData(imageData, 0, 0)
    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.72))
  }
  return frames
}

// ═══════════════════════════════════════════════════════
// 7. Hypnotic Spirals  (loop: phase * TAU)
// ═══════════════════════════════════════════════════════

export async function generateHypnoticSpirals(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []
  // "500% more crazy": more arms, overlays, turbulence, and color motion.
  const arms = 14
  const spiralColors = ['#ff0066', '#0066ff', '#ffcc00', '#00ff99', '#cc33ff', '#ff6600']

  // Ping-pong loop: render H = ceil(N/2)+1 forward frames, then play the
  // interior frames in reverse.  The seam is mathematically perfect ·
  // the last reverse frame is adjacent to frame 0, and the peak frame is
  // adjacent to itself (one shared image at the turnaround).  Time can
  // therefore use any non-integer multipliers without breaking the loop.
  const half = Math.floor(opts.frames / 2) + 1   // forward frame count

  function renderFrame(f: number) {
    // Within the forward half, advance phase 0 .. 1 across (half-1) steps so
    // the turnaround frame is the visual "extreme" of the motion.
    const phase = (half === 1) ? 0 : f / (half - 1)
    const t = phase * TAU * 0.1
    clear(ctx, '#000')

    const halo = ctx.createRadialGradient(HALF, HALF, 0, HALF, HALF, RADIUS)
    halo.addColorStop(0, 'rgba(255,255,255,0.04)')
    halo.addColorStop(0.45, 'rgba(140,80,255,0.08)')
    halo.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(HALF, HALF, RADIUS, 0, TAU)
    ctx.fill()

    for (let arm = 0; arm < arms; arm++) {
      const baseAngle = (arm / arms) * TAU + t * 1.65
      const hueShift = (phase * 360 + arm * 24) % 360
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath()
        for (let r = 0; r < RADIUS; r += 1) {
          const turbulence = Math.sin(r * 0.06 - t * 8 + arm * 0.9) * 0.16
          const wobble = Math.sin(r * 0.018 + t * (2 + layer * 1.2) + arm * 0.7) * (0.7 + layer * 0.3)
          const twist = r * (0.024 + layer * 0.006) + wobble + turbulence
          const angle = baseAngle + twist
          const x = HALF + Math.cos(angle) * r
          const y = HALF + Math.sin(angle) * r
          if (r === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }

        ctx.strokeStyle = layer === 0
          ? `hsla(${hueShift},100%,64%,0.9)`
          : layer === 1
            ? spiralColors[arm % spiralColors.length]
            : `hsla(${(hueShift + 160) % 360},100%,52%,0.78)`
        ctx.lineWidth = layer === 0 ? 2.2 : layer === 1 ? 4.6 : 7.4
        ctx.globalAlpha = layer === 2 ? 0.2 : layer === 1 ? 0.82 : 0.92
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }

    const pulse = Math.sin(t * 6.5) * 0.34 + 0.72
    const grad = ctx.createRadialGradient(HALF, HALF, 0, HALF, HALF, 74 * pulse)
    grad.addColorStop(0, 'rgba(255,255,255,0.8)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(HALF, HALF, 74 * pulse, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#fff'
    circularMask(ctx)
  }

  // Render the forward half once, snapshot every frame as JPEG.
  const forward: Uint8Array[] = []
  for (let f = 0; f < half; f++) {
    renderFrame(f)
    forward.push(await toJpeg(canvas, 0.4))
  }

  // Output forward, then interior reverse (skip peak and frame 0).
  for (let f = 0; f < half; f++) frames.push(forward[f])
  for (let f = half - 2; f >= 1 && frames.length < opts.frames; f--) frames.push(forward[f])
  // Pad if rounding left us short (only when opts.frames is very small).
  while (frames.length < opts.frames) frames.push(forward[forward.length - 1])
  return frames
}

// ═══════════════════════════════════════════════════════
// 8. Voronoi Crystals  (loop: seed orbits close exactly)
// ═══════════════════════════════════════════════════════

export async function generateVoronoiCrystals(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const imageData = ctx.createImageData(SIZE, SIZE)
  const frames: Uint8Array[] = []

  // Each cell is rendered as a vivid, uniformly-bright pane of jewel-
  // toned stained glass with thick white edges that have chromatic
  // dispersion (red/orange fringe on one side, cyan/blue fringe on the
  // other).  A small specular highlight floats inside each cell, animated
  // along the cell's bisector so it traces an integer-cycle path · the
  // sparkle "wanders" the facet without ever wrapping discontinuously.

  // Curated jewel palette · luminous mid-tones, no muddy darks.  Picked
  // for harmonious neighbouring contrast when laid out on a golden-angle
  // spiral.
  const jewels: Array<[number, number, number]> = [
    [ 70, 130, 255],  // sapphire
    [ 60, 220, 160],  // emerald
    [200, 110, 245],  // amethyst
    [255, 100, 130],  // ruby
    [255, 200,  80],  // citrine
    [ 90, 220, 240],  // aquamarine
    [240, 140, 220],  // rose
    [170, 230, 110],  // peridot
    [255, 160,  90],  // padparadscha (peachy)
  ]

  const rng = mulberry32(31)
  const seedCount = 22
  type Seed = {
    ax: number; ay: number
    orbitR: number; orbitPhase: number; orbitCycles: number
    color: [number, number, number]
  }
  const seeds: Seed[] = []
  for (let i = 0; i < seedCount; i++) {
    const t = i / seedCount
    const r = Math.sqrt(t) * (RADIUS - 18)
    const a = i * 2.39996323
    const ax = HALF + Math.cos(a) * r + (rng() - 0.5) * 14
    const ay = HALF + Math.sin(a) * r + (rng() - 0.5) * 14
    seeds.push({
      ax, ay,
      orbitR: 5 + rng() * 8,
      orbitPhase: rng() * TAU,
      orbitCycles: 1 + Math.floor(rng() * 2),       // integer · seamless
      color: jewels[i % jewels.length],
    })
  }

  const sx = new Float32Array(seedCount)
  const sy = new Float32Array(seedCount)

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames
    const data = imageData.data

    // Animate seeds on integer-cycle orbits for a seamless loop.
    for (let s = 0; s < seedCount; s++) {
      const seed = seeds[s]
      const ang = seed.orbitPhase + phase * TAU * seed.orbitCycles
      sx[s] = seed.ax + Math.cos(ang) * seed.orbitR
      sy[s] = seed.ay + Math.sin(ang) * seed.orbitR
    }

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        // F1 + F2 voronoi · closest and second-closest distances.
        let d1 = 1e9, d2 = 1e9, idx1 = 0, idx2 = 0
        for (let s = 0; s < seedCount; s++) {
          const dx = x - sx[s], dy = y - sy[s]
          const d = dx * dx + dy * dy
          if (d < d1)      { d2 = d1; idx2 = idx1; d1 = d; idx1 = s }
          else if (d < d2) { d2 = d;  idx2 = s }
        }
        const dist1 = Math.sqrt(d1)
        const dist2 = Math.sqrt(d2)
        const edge = dist2 - dist1
        const seed = seeds[idx1]

        // BASE COLOUR · uniformly bright jewel tone with only a *gentle*
        // (5%) brightening toward the seed; no dark valleys anywhere.
        const near = Math.exp(-d1 / 2200)              // 0..1, peak at seed
        const lift = 1.00 + 0.05 * near                // 1.00..1.05
        let r = seed.color[0] * lift
        let g = seed.color[1] * lift
        let b = seed.color[2] * lift

        // EDGE · white inner highlight with chromatic dispersion fringes
        // on the two sides of the cell bisector.  Edge brightness is a
        // smooth function of (dist2 - dist1).
        if (edge < 3.0) {
          const t = 1 - edge / 3.0                       // 0..1, peak at edge
          // Inner highlight blends cell colour toward warm white.
          const wInner = Math.pow(t, 1.6) * 0.92
          r = r * (1 - wInner) + 255 * wInner
          g = g * (1 - wInner) + 250 * wInner
          b = b * (1 - wInner) + 235 * wInner
          // Outer fringes only on the broad part of the edge.
          if (t < 0.6) {
            const bx = sx[idx2] - sx[idx1]
            const by = sy[idx2] - sy[idx1]
            const side = (x - sx[idx1]) * bx + (y - sy[idx1]) * by
            const w = t * 0.55
            if (side > 0) {
              // Warm fringe.
              r = r * (1 - w) + 255 * w
              g = g * (1 - w * 0.7) + 140 * (w * 0.7)
              b = b * (1 - w * 0.5) +  60 * (w * 0.5)
            } else {
              // Cool fringe.
              r = r * (1 - w * 0.5) +  60 * (w * 0.5)
              g = g * (1 - w * 0.7) + 200 * (w * 0.7)
              b = b * (1 - w) + 255 * w
            }
          }
        }

        const i = (y * SIZE + x) * 4
        data[i]     = r > 255 ? 255 : r < 0 ? 0 : r
        data[i + 1] = g > 255 ? 255 : g < 0 ? 0 : g
        data[i + 2] = b > 255 ? 255 : b < 0 ? 0 : b
        data[i + 3] = 255
      }
    }

    ctx.putImageData(imageData, 0, 0)
    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.7))
  }
  return frames
}

// ═══════════════════════════════════════════════════════
// 9. Lava Marble  (loop: domain-warped noise with integer cycles)
// ═══════════════════════════════════════════════════════

export async function generateLavaMarble(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const imageData = ctx.createImageData(SIZE, SIZE)
  const frames: Uint8Array[] = []

  // Thermal palette: black → red → orange → yellow → near-white.
  // Pre-computed as a 256-entry LUT.
  const palette = new Uint8Array(256 * 3)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    let r: number, g: number, b: number
    if (t < 0.25)      { const k = t / 0.25;        r = k * 60;          g = 0;                b = k * 30 }
    else if (t < 0.55) { const k = (t - 0.25) / 0.30; r = 60 + k * 195;  g = k * 60;          b = 30 - k * 30 }
    else if (t < 0.80) { const k = (t - 0.55) / 0.25; r = 255;            g = 60 + k * 175;    b = 0 }
    else               { const k = (t - 0.80) / 0.20; r = 255;            g = 235 + k * 20;    b = k * 220 }
    palette[i * 3] = r; palette[i * 3 + 1] = g; palette[i * 3 + 2] = b
  }

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames
    const t = phase * TAU
    const data = imageData.data

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        // Domain warping: feed coordinates through one noise layer to get
        // distorted coords for the next layer. Produces smoke / marble feel.
        const nx = x * 0.013, ny = y * 0.013
        const w1 = Math.sin(nx + t) + Math.cos(ny - t)
        const w2 = Math.sin(ny + w1 * 0.9 + t) + Math.cos(nx - w1 * 0.8 + t)
        const v =
          0.50 * Math.sin(nx + w1 + t) +
          0.30 * Math.sin(ny * 1.7 + w2 * 1.2 - t) +
          0.15 * Math.sin((nx + ny) * 2.3 + w1 * w2 + t * 2) +
          0.08 * Math.sin(nx * 4.2 - ny * 3.7 + t * 2)
        // Map [-1.03, 1.03] → [0, 1].
        const heat = Math.max(0, Math.min(1, v * 0.49 + 0.5))
        const idx = (heat * 255) | 0
        const p = idx * 3
        const i = (y * SIZE + x) * 4
        data[i] = palette[p]; data[i + 1] = palette[p + 1]; data[i + 2] = palette[p + 2]; data[i + 3] = 255
      }
    }

    ctx.putImageData(imageData, 0, 0)
    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.7))
  }
  return frames
}

// ═══════════════════════════════════════════════════════
// 10. Concentric Waves
// ═══════════════════════════════════════════════════════

export async function generateConcentricWaves(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const imageData = ctx.createImageData(SIZE, SIZE)
  const frames: Uint8Array[] = []

  const waveColors = [
    [0, 200, 255],
    [100, 255, 180],
    [220, 80, 255],
  ]

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames
    const t = phase * TAU
    const data = imageData.data

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = x - HALF, dy = y - HALF
        const dist = Math.sqrt(dx * dx + dy * dy)

        // Multiple concentric wave rings expanding outward
        const wave1 = Math.sin(dist * 0.05 - t * 2) * 0.5 + 0.5
        const wave2 = Math.sin(dist * 0.035 - t + 1.5) * 0.5 + 0.5
        const wave3 = Math.sin(dist * 0.07 - t * 3 + 3.0) * 0.5 + 0.5

        // Blend waves with different colors, boosted for vibrancy.
        const i = (y * SIZE + x) * 4
        const rr = (waveColors[0][0] * wave1 + waveColors[1][0] * wave2 + waveColors[2][0] * wave3) * 0.55
        const gg = (waveColors[0][1] * wave1 + waveColors[1][1] * wave2 + waveColors[2][1] * wave3) * 0.55
        const bb = (waveColors[0][2] * wave1 + waveColors[1][2] * wave2 + waveColors[2][2] * wave3) * 0.55

        // Soft vignette: full brightness inside 85% radius, fade to black
        const edgeFade = dist < RADIUS * 0.85 ? 1 : Math.max(0, 1 - (dist - RADIUS * 0.85) / (RADIUS * 0.15))
        data[i]     = Math.min(255, rr * edgeFade) | 0
        data[i + 1] = Math.min(255, gg * edgeFade) | 0
        data[i + 2] = Math.min(255, bb * edgeFade) | 0
        data[i + 3] = 255
      }
    }

    ctx.putImageData(imageData, 0, 0)
    circularMask(ctx)
    frames.push(await toJpeg(canvas))
  }
  return frames
}

// ═══════════════════════════════════════════════════════
// 11. Dither Magic
// ═══════════════════════════════════════════════════════

export async function generateDitherMagic(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const imageData = ctx.createImageData(SIZE, SIZE)
  const frames: Uint8Array[] = []

  // Bayer 8x8 ordered-dither matrix, normalised to [0, 1).
  const bayer8: number[] = [
     0,32, 8,40, 2,34,10,42,
    48,16,56,24,50,18,58,26,
    12,44, 4,36,14,46, 6,38,
    60,28,52,20,62,30,54,22,
     3,35,11,43, 1,33, 9,41,
    51,19,59,27,49,17,57,25,
    15,47, 7,39,13,45, 5,37,
    63,31,55,23,61,29,53,21,
  ]
  // Five-stop "neon sunset" palette - far more striking than the previous
  // single-hue cycle, and the ordered-dither blends them into smooth ramps
  // even though each pixel is one of the five stops.
  const PALETTE: [number, number, number][] = [
    [  6,  6, 18],   // ink
    [ 80, 30,140],   // royal violet
    [220, 60,140],   // hot pink
    [255,150, 60],   // amber
    [255,240,180],   // butter
  ]
  const STOPS = PALETTE.length

  function sampleRamp(v: number): [number, number, number] {
    // v in [0, 1]; pick the segment, return the upper colour. Combined with
    // ordered dithering the resulting average reads as a smooth gradient.
    const idx = Math.min(STOPS - 1, Math.floor(v * (STOPS - 1) + 0.5))
    return PALETTE[idx]
  }

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames
    const t = phase * TAU
    const data = imageData.data

    // Two slowly-orbiting "lava" centres; their gaussian falloff plus a
    // radial sine wash gives the dither something organic to shade.
    const c1x = HALF + Math.cos(t) * 70
    const c1y = HALF + Math.sin(t) * 70
    const c2x = HALF + Math.cos(t * 2 + 2.0) * 95
    const c2y = HALF + Math.sin(t * 2 + 2.0) * 95

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx1 = x - c1x, dy1 = y - c1y
        const dx2 = x - c2x, dy2 = y - c2y
        const r1 = Math.exp(-(dx1 * dx1 + dy1 * dy1) / 14000)
        const r2 = Math.exp(-(dx2 * dx2 + dy2 * dy2) / 18000) * 0.9
        const dx = x - HALF, dy = y - HALF
        const dist = Math.sqrt(dx * dx + dy * dy) / RADIUS
        const ring = Math.sin(dist * 6 - t * 2) * 0.18 + 0.5
        // Combine, then bias to keep the ramp inside [0, 1].
        let v = r1 + r2 + ring * 0.6
        v = Math.max(0, Math.min(1, v * 0.55))

        // Apply ordered dithering by pre-quantising with a per-pixel offset
        // worth roughly one palette step so adjacent dither cells alternate
        // between neighbouring stops, producing the smooth gradient.
        const noise = (bayer8[(y & 7) * 8 + (x & 7)] / 64 - 0.5) * (1 / (STOPS - 1))
        const [r, g, b] = sampleRamp(v + noise)

        const i = (y * SIZE + x) * 4
        data[i]     = r
        data[i + 1] = g
        data[i + 2] = b
        data[i + 3] = 255
      }
    }

    ctx.putImageData(imageData, 0, 0)
    circularMask(ctx)
    // 0.6 lands ~38-44 KB/frame: high enough to keep the dither cells
    // crisp without smearing them into flat colour blobs.
    frames.push(await toJpeg(canvas, 0.6))
  }
  return frames
}

// ═══════════════════════════════════════════════════════
// 12. Kaleidoscope  (loop: rotation completes integer cycles)
// ═══════════════════════════════════════════════════════

export async function generateKaleidoscope(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const imageData = ctx.createImageData(SIZE, SIZE)
  const frames: Uint8Array[] = []

  // 8-fold rotational + reflective symmetry. Source pattern is sampled in
  // the wedge [0, TAU/segments) and mirrored across all segments.
  const segments = 8
  const wedge = TAU / segments

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames
    const t = phase * TAU
    const data = imageData.data

    // Slow global rotation (1 full turn per loop) keeps motion seamless.
    const rot = phase * TAU

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = x - HALF
        const dy = y - HALF
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > RADIUS) {
          const i = (y * SIZE + x) * 4
          data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255
          continue
        }

        let theta = Math.atan2(dy, dx) + rot
        // Fold into wedge with mirroring at edges (reflective symmetry).
        let a = ((theta % wedge) + wedge) % wedge
        const half = wedge / 2
        if (a > half) a = wedge - a

        // Re-project to canonical sample coords inside the wedge.
        const sx = Math.cos(a) * dist
        const sy = Math.sin(a) * dist
        // Animated source pattern: layered moving discs + interference.
        const u = sx * 0.022
        const v = sy * 0.022
        const lay1 = Math.sin(u * 3.1 + t) * Math.cos(v * 2.7 - t)
        const lay2 = Math.sin((u + v) * 4.2 - t * 2) + Math.cos((u - v) * 3.6 + t * 2)
        const lay3 = Math.sin(Math.sqrt(u * u + v * v) * 9 - t * 2)
        const v3 = (lay1 * 0.55 + lay2 * 0.30 + lay3 * 0.45)
        // Bright concentric ring accents that rotate slowly.
        const ring = Math.pow(Math.max(0, Math.sin(dist * 0.08 - t * 2)), 6)

        const hueRad = v3 * 1.6 + phase * TAU
        const sat = 0.85
        const val = Math.max(0, Math.min(1, 0.45 + v3 * 0.5 + ring * 0.6))
        // Hue → RGB via cosine palette.
        const r = (Math.cos(hueRad) * 0.5 + 0.5) * sat * val * 255 + (1 - sat) * val * 255
        const g = (Math.cos(hueRad - 2.094) * 0.5 + 0.5) * sat * val * 255 + (1 - sat) * val * 255
        const b = (Math.cos(hueRad - 4.189) * 0.5 + 0.5) * sat * val * 255 + (1 - sat) * val * 255

        const i = (y * SIZE + x) * 4
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255
      }
    }

    ctx.putImageData(imageData, 0, 0)
    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.65))
  }
  return frames
}


// ═══════════════════════════════════════════════════════
// 13. Fire Particles  (rising embers with heat shimmer)
// ═══════════════════════════════════════════════════════

export async function generateFireParticles(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []
  const rng = mulberry32(77)

  const PARTICLE_COUNT = 80
  // Each particle: x, baseY, speed (integer cycles), size, hue offset, phase offset
  const particles = Array.from({ length: PARTICLE_COUNT }, () => {
    const cycles = 1 + Math.floor(rng() * 3) // integer cycles for seamless loop
    return {
      x: rng() * SIZE,
      xDrift: (rng() - 0.5) * 30,
      speed: cycles,
      size: 2 + rng() * 6,
      hue: rng() * 40, // 0-40 gives orange-red range
      phaseOff: rng(),
      brightness: 0.5 + rng() * 0.5,
    }
  })

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames
    const t = phase * TAU

    // Dark gradient backdrop (warm dark at bottom, cool dark at top)
    const grad = ctx.createLinearGradient(0, 0, 0, SIZE)
    grad.addColorStop(0, '#0a0408')
    grad.addColorStop(0.5, '#120508')
    grad.addColorStop(1, '#1a0a06')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, SIZE, SIZE)

    // Draw particles (rising embers)
    for (const p of particles) {
      const localPhase = ((phase * p.speed + p.phaseOff) % 1)
      // Rise from bottom to top
      const y = SIZE * (1 - localPhase)
      // Horizontal wobble
      const wobble = Math.sin(t * p.speed + p.phaseOff * TAU) * p.xDrift
      const x = ((p.x + wobble) % SIZE + SIZE) % SIZE

      // Fade: bright at bottom, transparent at top
      const alpha = Math.max(0, 1 - localPhase) * p.brightness
      // Color: white-yellow core, orange-red outer
      const coreAlpha = Math.max(0, 1 - localPhase * 1.5)

      // Outer glow
      const r = 255
      const g = Math.floor(120 + p.hue * 2 - localPhase * 80)
      const b = Math.floor(20 + p.hue - localPhase * 20)
      ctx.globalAlpha = alpha * 0.6
      ctx.fillStyle = `rgb(${r},${Math.max(0, g)},${Math.max(0, b)})`
      ctx.beginPath()
      ctx.arc(x, y, p.size * 1.5, 0, TAU)
      ctx.fill()

      // Bright core
      ctx.globalAlpha = coreAlpha * alpha
      ctx.fillStyle = `rgb(255,${Math.min(255, 200 + Math.floor(p.hue))},${Math.min(255, 80 + Math.floor(p.hue * 2))})`
      ctx.beginPath()
      ctx.arc(x, y, p.size * 0.6, 0, TAU)
      ctx.fill()
    }

    ctx.globalAlpha = 1
    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.7))
  }
  return frames
}


// ═══════════════════════════════════════════════════════
// 14. Snowfall  (gentle drifting snowflakes)
// ═══════════════════════════════════════════════════════

export async function generateSnowfall(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []
  const rng = mulberry32(88)

  const FLAKE_COUNT = 60
  const flakes = Array.from({ length: FLAKE_COUNT }, () => {
    const cycles = 1 + Math.floor(rng() * 2) // integer cycles
    return {
      x: rng() * SIZE,
      xSwing: 15 + rng() * 25,
      speed: cycles,
      size: 1.5 + rng() * 4,
      phaseOff: rng(),
      alpha: 0.3 + rng() * 0.7,
      swingCycles: 1 + Math.floor(rng() * 3), // integer for seamless loop
    }
  })

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames
    const t = phase * TAU

    // Night sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, SIZE)
    grad.addColorStop(0, '#0a1628')
    grad.addColorStop(0.6, '#0f1d33')
    grad.addColorStop(1, '#14243d')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, SIZE, SIZE)

    // Soft ground glow
    ctx.globalAlpha = 0.15
    const groundGrad = ctx.createRadialGradient(HALF, SIZE + 50, 20, HALF, SIZE + 50, HALF)
    groundGrad.addColorStop(0, '#3a5580')
    groundGrad.addColorStop(1, 'transparent')
    ctx.fillStyle = groundGrad
    ctx.fillRect(0, SIZE * 0.7, SIZE, SIZE * 0.3)
    ctx.globalAlpha = 1

    // Draw snowflakes
    for (const fl of flakes) {
      const localPhase = ((phase * fl.speed + fl.phaseOff) % 1)
      // Fall from top to bottom
      const y = SIZE * localPhase
      // Gentle side-to-side sway
      const sway = Math.sin(t * fl.swingCycles + fl.phaseOff * TAU) * fl.xSwing
      const x = ((fl.x + sway) % SIZE + SIZE) % SIZE

      // Depth-based fade (smaller = farther = dimmer)
      const depthFade = 0.5 + (fl.size / 5.5) * 0.5

      ctx.globalAlpha = fl.alpha * depthFade
      ctx.fillStyle = '#e8eef8'
      ctx.beginPath()
      ctx.arc(x, y, fl.size, 0, TAU)
      ctx.fill()

      // Soft glow for larger flakes
      if (fl.size > 3) {
        ctx.globalAlpha = fl.alpha * 0.2
        ctx.fillStyle = '#c0d0ee'
        ctx.beginPath()
        ctx.arc(x, y, fl.size * 2.5, 0, TAU)
        ctx.fill()
      }
    }

    ctx.globalAlpha = 1
    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.7))
  }
  return frames
}


// ═══════════════════════════════════════════════════════
// 15. Cyberpunk Rain  (neon-lit rain streaks)
// ═══════════════════════════════════════════════════════

export async function generateCyberpunkRain(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []
  const rng = mulberry32(99)

  const STREAK_COUNT = 50
  const streaks = Array.from({ length: STREAK_COUNT }, () => {
    const cycles = 1 + Math.floor(rng() * 3) // integer cycles
    const colorChoice = Math.floor(rng() * 3)
    // Neon colors: cyan, magenta, purple
    const colors = ['rgba(0,240,255,', 'rgba(255,50,220,', 'rgba(140,80,255,']
    return {
      x: rng() * SIZE,
      speed: cycles,
      length: 15 + rng() * 40,
      width: 0.5 + rng() * 1.5,
      phaseOff: rng(),
      color: colors[colorChoice],
      alpha: 0.3 + rng() * 0.5,
    }
  })

  // Background neon glow sources (static)
  const glowSources = Array.from({ length: 4 }, () => ({
    x: rng() * SIZE,
    y: rng() * SIZE,
    r: 40 + rng() * 80,
    color: [`rgba(0,180,220,`, `rgba(200,30,160,`, `rgba(100,60,200,`][Math.floor(rng() * 3)],
    pulseCycles: 1 + Math.floor(rng() * 2),
  }))

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames
    const t = phase * TAU

    // Dark city backdrop
    ctx.fillStyle = '#06080c'
    ctx.fillRect(0, 0, SIZE, SIZE)

    // Ambient neon glow sources
    for (const gs of glowSources) {
      const pulse = 0.5 + 0.5 * Math.sin(t * gs.pulseCycles)
      ctx.globalAlpha = 0.08 * pulse
      const grad = ctx.createRadialGradient(gs.x, gs.y, 0, gs.x, gs.y, gs.r)
      grad.addColorStop(0, `${gs.color}0.6)`)
      grad.addColorStop(1, `${gs.color}0)`)
      ctx.fillStyle = grad
      ctx.fillRect(gs.x - gs.r, gs.y - gs.r, gs.r * 2, gs.r * 2)
    }
    ctx.globalAlpha = 1

    // Rain streaks
    for (const s of streaks) {
      const localPhase = ((phase * s.speed + s.phaseOff) % 1)
      const y = SIZE * localPhase
      const x = s.x

      // Streak with gradient fade
      ctx.globalAlpha = s.alpha
      ctx.strokeStyle = `${s.color}${s.alpha})`
      ctx.lineWidth = s.width
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x, y - s.length)
      ctx.stroke()

      // Splash at bottom
      if (localPhase > 0.9) {
        const splashAlpha = (localPhase - 0.9) / 0.1
        ctx.globalAlpha = s.alpha * (1 - splashAlpha) * 0.5
        ctx.fillStyle = `${s.color}0.4)`
        ctx.beginPath()
        ctx.arc(x, SIZE * 0.95, 3 + splashAlpha * 4, 0, TAU)
        ctx.fill()
      }
    }

    ctx.globalAlpha = 1
    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.7))
  }
  return frames
}

// ===================================================
// Danmaku (scrolling text)
// ===================================================

export async function generateDanmaku(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []

  const text = 'AURACAST'
  const fontSize = 64
  const fontFamily = 'monospace'

  ctx.font = `bold ${fontSize}px ${fontFamily}`
  const textWidth = ctx.measureText(text).width
  const totalScroll = SIZE + textWidth

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames
    clear(ctx, '#0a0b1e')

    // Scroll position: right edge to left edge
    const x = SIZE - phase * totalScroll
    const y = HALF + fontSize / 3

    // Glow effect
    ctx.shadowColor = '#00f2ff'
    ctx.shadowBlur = 12
    ctx.fillStyle = '#00f2ff'
    ctx.font = `bold ${fontSize}px ${fontFamily}`
    ctx.fillText(text, x, y)

    // Second pass without glow for crispness
    ctx.shadowBlur = 0
    ctx.fillStyle = '#ffffff'
    ctx.fillText(text, x, y)

    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.85))
  }
  return frames
}
