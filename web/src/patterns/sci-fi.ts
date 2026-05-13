import { SIZE, HALF, RADIUS, TAU, createCanvas, clear, circularMask, toJpeg, mulberry32 } from './helpers'
import type { PatternOptions } from './helpers'

// ═══════════════════════════════════════════════════════
// 6. Radar Sweep  (loop: sweep completes exact integer rotations)
// ═══════════════════════════════════════════════════════

export async function generateRadarSweep(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []
  const rng = mulberry32(77)

  const blips = Array.from({ length: 12 }, () => ({
    angle: rng() * TAU,
    dist: 30 + rng() * (RADIUS - 50),
    size: 3 + rng() * 4,
  }))

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames
    const sweepAngle = phase * TAU * 2 // 2 full rotations per loop
    clear(ctx, '#001008')

    // Grid rings
    ctx.strokeStyle = 'rgba(0,255,80,0.15)'
    ctx.lineWidth = 1
    for (let r = 40; r < RADIUS; r += 40) {
      ctx.beginPath()
      ctx.arc(HALF, HALF, r, 0, TAU)
      ctx.stroke()
    }
    for (let a = 0; a < 4; a++) {
      const angle = (a * Math.PI) / 4
      ctx.beginPath()
      ctx.moveTo(HALF + Math.cos(angle) * 20, HALF + Math.sin(angle) * 20)
      ctx.lineTo(HALF + Math.cos(angle) * RADIUS, HALF + Math.sin(angle) * RADIUS)
      ctx.stroke()
    }

    // Sweep gradient
    const gradient = ctx.createConicGradient(sweepAngle - Math.PI / 3, HALF, HALF)
    gradient.addColorStop(0, 'rgba(0,255,80,0)')
    gradient.addColorStop(0.08, 'rgba(0,255,80,0.3)')
    gradient.addColorStop(0.1, 'rgba(0,255,80,0.0)')
    gradient.addColorStop(1, 'rgba(0,255,80,0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(HALF, HALF, RADIUS, 0, TAU)
    ctx.fill()

    // Sweep line
    ctx.beginPath()
    ctx.moveTo(HALF, HALF)
    ctx.lineTo(HALF + Math.cos(sweepAngle) * RADIUS, HALF + Math.sin(sweepAngle) * RADIUS)
    ctx.strokeStyle = 'rgba(0,255,80,0.8)'
    ctx.lineWidth = 2
    ctx.stroke()

    // Blips
    for (const b of blips) {
      let angleDiff = sweepAngle - b.angle
      angleDiff = ((angleDiff % TAU) + TAU) % TAU
      const brightness = angleDiff < 1.5 ? Math.max(0, 1 - angleDiff / 1.5) : 0
      if (brightness < 0.05) continue
      ctx.beginPath()
      ctx.arc(HALF + Math.cos(b.angle) * b.dist, HALF + Math.sin(b.angle) * b.dist, b.size, 0, TAU)
      ctx.fillStyle = `rgba(0,255,80,${brightness})`
      ctx.fill()
    }

    ctx.beginPath()
    ctx.arc(HALF, HALF, 4, 0, TAU)
    ctx.fillStyle = '#0f6'
    ctx.fill()

    circularMask(ctx)
    frames.push(await toJpeg(canvas))
  }
  return frames
}

// ─── Arc Radar ───
// Tactical contact tracker inspired by arcradar.online. A rotating sweep
// arm with a cone-shaped phosphor trail rakes a tick-marked disc while
// three colored contacts trace integer-ratio Lissajous orbits, leaving
// comet trails that fade behind them. All motion is parameterised on
// `phase = f / frames` and uses integer harmonics so the loop closes
// seamlessly at the boundary.

let _arcRadarTickRing: OffscreenCanvas | null = null
function getArcRadarTickRing(): OffscreenCanvas {
  if (_arcRadarTickRing) return _arcRadarTickRing
  const cv = new OffscreenCanvas(SIZE, SIZE)
  const c = cv.getContext('2d')!
  c.translate(HALF, HALF)
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * TAU - Math.PI / 2
    const isMajor = i % 45 === 0
    const isMid = i % 5 === 0
    const len = isMajor ? 11 : isMid ? 6 : 2.5
    const w = isMajor ? 1.6 : isMid ? 1.1 : 1
    const alpha = isMajor ? 0.7 : isMid ? 0.34 : 0.13
    c.strokeStyle = `rgba(150, 220, 235, ${alpha})`
    c.lineWidth = w
    c.beginPath()
    const r0 = RADIUS - len
    const r1 = RADIUS - 1
    c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0)
    c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1)
    c.stroke()
  }
  _arcRadarTickRing = cv
  return cv
}

export async function generateArcRadar(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []
  const tickRing = getArcRadarTickRing()

  // Integer-harmonic Lissajous orbits keep frame 0 ≡ frame N.
  const contacts = [
    { color: '#ff5266', r: RADIUS * 0.80, ax: 1, ay: 2, px: 0.0, py: 0.7 },
    { color: '#f5d142', r: RADIUS * 0.64, ax: 2, ay: 3, px: 1.1, py: 0.0 },
    { color: '#5eff9c', r: RADIUS * 0.55, ax: 3, ay: 2, px: 2.4, py: 1.8 },
  ]
  const contactPos = (c: typeof contacts[0], p: number): [number, number] => [
    HALF + Math.cos(c.ax * p * TAU + c.px) * c.r,
    HALF + Math.sin(c.ay * p * TAU + c.py) * c.r,
  ]

  const TAIL_SAMPLES = 44
  const TAIL_SPAN = 0.18
  const SWEEP_WIDTH = Math.PI / 5.5

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames

    clear(ctx, '#000')

    // Range rings + cardinal/diagonal grid lines.
    ctx.save()
    ctx.translate(HALF, HALF)
    ctx.strokeStyle = 'rgba(120, 200, 220, 0.18)'
    ctx.lineWidth = 1
    for (let i = 1; i <= 8; i++) {
      ctx.beginPath()
      ctx.arc(0, 0, (RADIUS * i) / 8, 0, TAU)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(120, 200, 220, 0.10)'
    for (let k = 0; k < 4; k++) {
      const ang = (k * Math.PI) / 4
      ctx.beginPath()
      ctx.moveTo(Math.cos(ang) * RADIUS, Math.sin(ang) * RADIUS)
      ctx.lineTo(-Math.cos(ang) * RADIUS, -Math.sin(ang) * RADIUS)
      ctx.stroke()
    }
    ctx.restore()

    ctx.drawImage(tickRing, 0, 0)

    // Sweep cone trailing behind the arm.
    const sweepAngle = phase * TAU - Math.PI / 2
    ctx.save()
    ctx.translate(HALF, HALF)
    ctx.rotate(sweepAngle)
    const coneSteps = 26
    for (let s = 0; s < coneSteps; s++) {
      const a0 = -(s / coneSteps) * SWEEP_WIDTH
      const a1 = -((s + 1) / coneSteps) * SWEEP_WIDTH
      const alpha = 0.30 * Math.pow(1 - s / coneSteps, 1.4)
      ctx.fillStyle = `rgba(180, 240, 255, ${alpha})`
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, RADIUS, a0, a1, true)
      ctx.closePath()
      ctx.fill()
    }
    // Sweep arm leading edge.
    ctx.strokeStyle = '#d6f6ff'
    ctx.lineWidth = 1.8
    ctx.shadowColor = '#bff5ff'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(RADIUS, 0)
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.restore()

    // Contact comet trails (resolved from the closed orbit, so wraps loop-safely).
    for (const c of contacts) {
      let prev: [number, number] | null = null
      for (let s = 0; s <= TAIL_SAMPLES; s++) {
        const back = (s / TAIL_SAMPLES) * TAIL_SPAN
        const p = ((phase - back) % 1 + 1) % 1
        const pos = contactPos(c, p)
        if (prev) {
          const t = 1 - s / TAIL_SAMPLES
          ctx.strokeStyle = c.color
          ctx.globalAlpha = Math.pow(t, 1.7)
          ctx.lineWidth = 0.5 + t * 2.0
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(prev[0], prev[1])
          ctx.lineTo(pos[0], pos[1])
          ctx.stroke()
        }
        prev = pos
      }
      ctx.globalAlpha = 1
    }

    // Contact heads · bright core + outer ring marker.
    for (const c of contacts) {
      const [hx, hy] = contactPos(c, phase)
      ctx.fillStyle = c.color
      ctx.shadowColor = c.color
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.arc(hx, hy, 3.4, 0, TAU)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.strokeStyle = c.color
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(hx, hy, 6.5, 0, TAU)
      ctx.stroke()
    }

    // Sweep illumination · additive bright streak right where the arm is.
    ctx.save()
    ctx.translate(HALF, HALF)
    ctx.rotate(sweepAngle)
    const grad = ctx.createLinearGradient(0, 0, RADIUS, 0)
    grad.addColorStop(0, 'rgba(220, 250, 255, 0.0)')
    grad.addColorStop(0.55, 'rgba(220, 250, 255, 0.30)')
    grad.addColorStop(1, 'rgba(220, 250, 255, 0.55)')
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = grad
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(RADIUS, 0)
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
    ctx.restore()

    circularMask(ctx)

    // CRT-style vignette to add depth at the rim.
    const vg = ctx.createRadialGradient(HALF, HALF, RADIUS * 0.55, HALF, HALF, RADIUS)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, SIZE, SIZE)

    frames.push(await toJpeg(canvas, 0.82))
  }
  return frames
}

// ─── Arc Radar HD ───
// Faithful 1:1 reproduction of arcradar.online (referenced from the
// animated GIF i.imgur.com/bXJlFRC). The site uses a pure black field
// with cream/sepia phosphor for the chrome, a single thin tapered
// sweep beam (NOT a wedge), one bright red tracked contact with a long
// curved comet trail and a tiny label, and several extremely faint
// ghost trajectories scattered through the disc as past contacts.

let _arcRadarHdTickRing: OffscreenCanvas | null = null
function getArcRadarHdTickRing(): OffscreenCanvas {
  if (_arcRadarHdTickRing) return _arcRadarHdTickRing
  const cv = new OffscreenCanvas(SIZE, SIZE)
  const c = cv.getContext('2d')!
  c.translate(HALF, HALF)

  // Chromatic aberration: render the ENTIRE tick ring three times in
  // pure R, G, B with small radial shifts, additive-blended. This
  // produces a blue inner / orange outer fringe matching the source's
  // CRT-style RGB separation.
  const drawTicks = (radialShift: number, color: string) => {
    c.strokeStyle = color
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * TAU - Math.PI / 2
      const isMajor = i % 30 === 0
      const isMid = i % 10 === 0
      const isFive = i % 5 === 0
      const len = isMajor ? 14 : isMid ? 9 : isFive ? 6 : 3
      const w = isMajor ? 1.6 : isMid ? 1.2 : 1
      const a0 = isMajor ? 0.95 : isMid ? 0.55 : isFive ? 0.32 : 0.20
      c.lineWidth = w
      c.globalAlpha = a0
      const r0 = RADIUS - len + radialShift
      const r1 = RADIUS - 1 + radialShift
      c.beginPath()
      c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0)
      c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1)
      c.stroke()
    }
  }
  c.globalCompositeOperation = 'lighter'
  drawTicks( 1.6, 'rgb(255, 90, 60)')   // outer red/orange fringe
  drawTicks( 0.0, 'rgb(220, 220, 200)') // central body (cream)
  drawTicks(-1.6, 'rgb(80, 140, 255)')  // inner blue fringe
  c.globalCompositeOperation = 'source-over'
  c.globalAlpha = 1

  // Degree labels in the same chromatic-aberrated style.
  c.font = '13px ui-monospace, "SF Mono", monospace'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  const drawLabels = (dx: number, dy: number, color: string, alpha: number) => {
    c.fillStyle = color
    c.globalAlpha = alpha
    for (let i = 0; i < 12; i++) {
      const deg = i * 30
      const a = (deg / 360) * TAU - Math.PI / 2
      const r = RADIUS - 25
      c.fillText(`${deg === 0 ? 360 : deg}°`, Math.cos(a) * r + dx, Math.sin(a) * r + dy)
    }
  }
  c.globalCompositeOperation = 'lighter'
  drawLabels( 1, 0, 'rgb(255, 80, 50)',  0.55)
  drawLabels( 0, 0, 'rgb(220, 220, 200)', 0.85)
  drawLabels(-1, 0, 'rgb(60, 120, 255)', 0.55)
  c.globalCompositeOperation = 'source-over'
  c.globalAlpha = 1

  _arcRadarHdTickRing = cv
  return cv
}

export async function generateArcRadarHd(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []
  const tickRing = getArcRadarHdTickRing()

  // (No more multi-ghost overlay -- source is much sparser; we render the
  // single active contact only.)

  // The source has multiple contacts that can coexist. Each spawns at a
  // rim point and traces a smooth arc across the disc to another rim
  // point over its lifetime. The trail is a SOLID per-contact color
  // (red or amber/yellow in the source), not an aging gradient. Multiple
  // contacts overlap during transitions.
  type Track = {
    entryAng: number     // rim angle where contact spawns (radians)
    exitAng: number      // rim angle where contact dies
    bow: number          // perpendicular curve of arc (-1..1, * RADIUS)
    color: string        // solid trail color (rgb)
    glowColor: string    // halo color for the head
    callsign: string
    spawnPhase: number   // [0,1) global phase at which this contact spawns
    lifeFrac: number     // fraction of the loop this contact lives for
    counterBase: number  // seconds offset for the readout
  }
  // Two overlapping contacts: red enters first, ages across most of the
  // loop; amber/yellow spawns later and overlaps the red's mid-life.
  const tracks: Track[] = [
    {
      entryAng: -Math.PI * 0.10, exitAng: Math.PI * 1.15, bow: 0.65,
      color: 'rgb(255, 60, 95)', glowColor: 'rgb(255, 130, 150)',
      callsign: 'close serutinu Buried T',
      spawnPhase: 0.00, lifeFrac: 0.85, counterBase: 44 * 60 + 1,
    },
    {
      entryAng: Math.PI * 0.62, exitAng: -Math.PI * 0.10, bow: -0.55,
      color: 'rgb(255, 200, 40)', glowColor: 'rgb(255, 220, 130)',
      callsign: 'Matriarch Blue Gate T',
      spawnPhase: 0.55, lifeFrac: 0.55, counterBase: 44 * 60 + 12,
    },
  ]
  const SWEEP_BEAM = Math.PI / 28
  const TRAIL_SAMPLES = 90

  // Quadratic-bezier arc from entry rim to exit rim, with control point
  // pushed perpendicular to the chord by `bow * RADIUS` for the curving
  // shape (positive = bow toward center / left of travel).
  const trackPos = (tr: Track, lp: number): [number, number] => {
    const ax = HALF + Math.cos(tr.entryAng) * RADIUS
    const ay = HALF + Math.sin(tr.entryAng) * RADIUS
    const bx = HALF + Math.cos(tr.exitAng) * RADIUS
    const by = HALF + Math.sin(tr.exitAng) * RADIUS
    const mx = (ax + bx) / 2, my = (ay + by) / 2
    let dx = bx - ax, dy = by - ay
    const len = Math.hypot(dx, dy) || 1
    dx /= len; dy /= len
    const cx = mx + (-dy) * tr.bow * RADIUS
    const cy = my + ( dx) * tr.bow * RADIUS
    const u = 1 - lp
    return [u*u*ax + 2*u*lp*cx + lp*lp*bx, u*u*ay + 2*u*lp*cy + lp*lp*by]
  }

  // Live counter as DD:HH:MM:SS plus 2-digit hundredths suffix to match
  // the source's "T-00:44:01:78" style readout.
  const fmtCounter = (frac: number, base: number) => {
    const total = base + frac * 60   // 60 seconds of counter per loop
    const sec = total
    const ss = Math.floor(sec) % 60
    const mm = Math.floor(sec / 60) % 60
    const hh = Math.floor(sec / 3600) % 24
    const dd = Math.floor(sec / 86400) % 100
    const cs = Math.floor((sec - Math.floor(sec)) * 100) % 100
    const pad = (v: number) => v.toString().padStart(2, '0')
    return `-${pad(dd)}:${pad(hh)}:${pad(mm)}:${pad(cs)}`
  }

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames

    clear(ctx, '#000')

    // Range rings (subtle, sparse) + faint dashed crosshair graticule.
    ctx.save()
    ctx.translate(HALF, HALF)
    ctx.strokeStyle = 'rgba(180, 175, 160, 0.10)'
    ctx.lineWidth = 1
    for (let i = 1; i <= 6; i++) {
      ctx.beginPath()
      ctx.arc(0, 0, (RADIUS * i) / 6, 0, TAU)
      ctx.stroke()
    }
    // Dashed diagonal graticule (matches the faint dashed lines visible
    // in the source).
    ctx.setLineDash([4, 6])
    ctx.strokeStyle = 'rgba(180, 175, 160, 0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(-RADIUS, 0)
    ctx.lineTo(RADIUS, 0)
    ctx.moveTo(0, -RADIUS)
    ctx.lineTo(0, RADIUS)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()

    ctx.drawImage(tickRing, 0, 0)

    // Thin tapered sweep beam · triangle from rim back toward center,
    // bright tip, fading to nothing at ~70% radius.
    const sweepAngle = phase * TAU - Math.PI / 2
    ctx.save()
    ctx.translate(HALF, HALF)
    ctx.rotate(sweepAngle)
    const beamLen = RADIUS
    const beamSteps = 60
    for (let s = 0; s < beamSteps; s++) {
      const t0 = s / beamSteps
      const t1 = (s + 1) / beamSteps
      const halfW = (1 - t0) * Math.tan(SWEEP_BEAM / 2) * beamLen
      // Bright at the rim (t≈1), zero near center (t≈0).
      const intensity = Math.pow(t0, 2.2)
      ctx.fillStyle = `rgba(235, 220, 165, ${0.85 * intensity})`
      ctx.beginPath()
      ctx.moveTo(t0 * beamLen, -halfW)
      ctx.lineTo(t1 * beamLen, -(1 - t1) * Math.tan(SWEEP_BEAM / 2) * beamLen)
      ctx.lineTo(t1 * beamLen, (1 - t1) * Math.tan(SWEEP_BEAM / 2) * beamLen)
      ctx.lineTo(t0 * beamLen, halfW)
      ctx.closePath()
      ctx.fill()
    }
    // Sharp leading edge.
    ctx.strokeStyle = 'rgba(255, 240, 190, 0.95)'
    ctx.lineWidth = 1.2
    ctx.shadowColor = 'rgba(255, 230, 170, 0.9)'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(beamLen, 0)
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.restore()

    // Render every contact whose lifecycle window contains the current
    // phase. The trail is a SOLID per-contact color (not aging) -- this
    // matches the source where reds stay red and ambers stay amber.
    for (const tr of tracks) {
      // Lifecycle: phase progresses from spawnPhase through spawnPhase +
      // lifeFrac, wrapping mod 1.
      let lp = (phase - tr.spawnPhase + 1) % 1 / tr.lifeFrac
      if (lp <= 0 || lp >= 1) continue
      const slotFade = Math.min(1, lp * 12) * Math.min(1, (1 - lp) * 4)

      // Solid-color trail from spawn (u=0) to current head (u=lp).
      let prev: [number, number] | null = null
      const N = TRAIL_SAMPLES
      for (let s = 0; s <= N; s++) {
        const u = (s / N) * lp
        const pos = trackPos(tr, u)
        if (prev) {
          ctx.strokeStyle = tr.color
          ctx.globalAlpha = 0.92 * slotFade
          ctx.lineWidth = 2.2
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.beginPath()
          ctx.moveTo(prev[0], prev[1])
          ctx.lineTo(pos[0], pos[1])
          ctx.stroke()
        }
        prev = pos
      }
      ctx.globalAlpha = 1

      // Contact head: small white-cream dot with colored halo.
      const [hx, hy] = trackPos(tr, lp)
      ctx.globalAlpha = slotFade
      ctx.shadowColor = tr.glowColor
      ctx.shadowBlur = 12
      ctx.fillStyle = 'rgba(255, 250, 235, 1)'
      ctx.beginPath()
      ctx.arc(hx, hy, 3.0, 0, TAU)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.strokeStyle = 'rgba(255, 250, 235, 0.95)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(hx, hy, 5.5, 0, TAU)
      ctx.stroke()

      // Callsign label with live counter readout. Per-contact, persistent
      // through the contact's life so it doesn't flicker.
      const labelFade = Math.min(1, lp * 6) * Math.min(1, (1 - lp) * 3)
      if (labelFade > 0.02) {
        const text = `${tr.callsign}${fmtCounter(lp, tr.counterBase)}`
        ctx.font = '10px ui-monospace, "SF Mono", monospace'
        ctx.textBaseline = 'middle'
        // Place label to whichever side has more room.
        const offX = hx < HALF ? 10 : -10
        ctx.textAlign = hx < HALF ? 'left' : 'right'
        ctx.fillStyle = `rgba(235, 230, 220, ${0.88 * labelFade})`
        ctx.fillText(text, hx + offX, hy - 10)
      }
      ctx.globalAlpha = 1
    }

    circularMask(ctx)

    // Subtle CRT vignette that does NOT reach the rim, so the chromatic
    // tick ring stays at full brightness throughout the loop.
    const vg = ctx.createRadialGradient(HALF, HALF, RADIUS * 0.40, HALF, HALF, RADIUS * 0.85)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(0,0,0,0.30)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, SIZE, SIZE)

    // Re-stamp the tick ring on top so the vignette can never dim it.
    // This guarantees the chromatic perimeter stays vivid every frame.
    ctx.drawImage(tickRing, 0, 0)

    frames.push(await toJpeg(canvas, 0.78))
  }
  return frames
}
