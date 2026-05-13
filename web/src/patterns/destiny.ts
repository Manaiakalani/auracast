import { SIZE, HALF, RADIUS, TAU, createCanvas, clear, circularMask, toJpeg, mulberry32 } from './helpers'
import type { PatternOptions } from './helpers'

// ═══════════════════════════════════════════════════════
// Destiny-inspired patterns
// ═══════════════════════════════════════════════════════

// ── Shared helpers for Destiny system-card patterns ─────

// Draw a deep-space backdrop: dark blue-black base, soft nebula blobs,
// and a star field that twinkles on per-star integer cycles.
type DestinyStar = { x: number; y: number; size: number; phase: number; cycles: number; color: string }
type DestinyNebula = { x: number; y: number; r: number; color: string; alpha: number }

function makeDestinyStarfield(seed: number, count = 110): DestinyStar[] {
  const rng = mulberry32(seed)
  const stars: DestinyStar[] = []
  // 80% cool white, ~15% pale gold, ~5% pale cyan to match the cinematic.
  const colors = ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#fff4cf', '#cfe9ff']
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rng() * SIZE,
      y: rng() * SIZE,
      size: 0.4 + Math.pow(rng(), 2.5) * 2.2,
      phase: rng() * TAU,
      cycles: 1 + Math.floor(rng() * 3),
      color: colors[Math.floor(rng() * colors.length)],
    })
  }
  return stars
}

function drawDestinyBackdrop(
  ctx: OffscreenCanvasRenderingContext2D,
  stars: DestinyStar[],
  nebulae: DestinyNebula[],
  phase: number,
  baseColor = '#03050d',
) {
  clear(ctx, baseColor)

  // Soft nebula clouds.
  for (const n of nebulae) {
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r)
    g.addColorStop(0, `rgba(${n.color}, ${n.alpha})`)
    g.addColorStop(1, `rgba(${n.color}, 0)`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, SIZE, SIZE)
  }

  // Stars · pre-sized squares with a 1-pixel cross for the bigger ones.
  for (const s of stars) {
    const tw = 0.45 + 0.55 * Math.sin(s.phase + phase * TAU * s.cycles)
    ctx.globalAlpha = tw
    ctx.fillStyle = s.color
    if (s.size > 1.4) {
      ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size)
      ctx.fillRect(s.x - s.size, s.y - 0.5, s.size * 2, 1)
      ctx.fillRect(s.x - 0.5, s.y - s.size, 1, s.size * 2)
    } else {
      ctx.fillRect(s.x, s.y, 1, 1)
    }
  }
  ctx.globalAlpha = 1
}

// Draw the ornate sacred-geometry overlay (thin gold/silver line work):
// outer ring, inscribed regular polygon, radial spokes at each vertex,
// small marker rings + dots at each vertex, and an optional inner shape.
function drawSacredGeometry(
  ctx: OffscreenCanvasRenderingContext2D,
  cx: number, cy: number,
  outerR: number,
  sides: number,
  innerSides: number,        // 0 = no inner shape
  rotation: number,
  color: string,             // 'r, g, b' triplet
  alpha: number,
) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rotation)
  ctx.strokeStyle = `rgba(${color}, ${alpha})`
  ctx.fillStyle = `rgba(${color}, ${alpha})`
  ctx.lineWidth = 1

  // Outer ring.
  ctx.beginPath()
  ctx.arc(0, 0, outerR, 0, TAU)
  ctx.stroke()

  // Slightly inner ring (faint double-line look).
  ctx.globalAlpha = 0.6
  ctx.beginPath()
  ctx.arc(0, 0, outerR - 6, 0, TAU)
  ctx.stroke()
  ctx.globalAlpha = 1

  // Vertex positions.
  const verts: Array<[number, number]> = []
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * TAU - Math.PI / 2
    verts.push([Math.cos(a) * outerR, Math.sin(a) * outerR])
  }

  // Inscribed polygon connecting all vertices.
  ctx.beginPath()
  for (let i = 0; i < sides; i++) {
    const [x, y] = verts[i]
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.stroke()

  // Radial spokes from centre to vertices (faint).
  ctx.globalAlpha = alpha * 0.55
  for (const [vx, vy] of verts) {
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(vx, vy)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // Vertex markers · small ring + filled dot.
  for (const [vx, vy] of verts) {
    ctx.beginPath()
    ctx.arc(vx, vy, 4, 0, TAU)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(vx, vy, 1.2, 0, TAU)
    ctx.fill()
  }

  // Inner inscribed polygon (e.g. a square inside an octagon).
  if (innerSides > 0) {
    const innerR = outerR * 0.62
    ctx.beginPath()
    for (let i = 0; i < innerSides; i++) {
      const a = (i / innerSides) * TAU - Math.PI / 2 + Math.PI / innerSides
      const x = Math.cos(a) * innerR
      const y = Math.sin(a) * innerR
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.stroke()
  }

  ctx.restore()
}


// ═══════════════════════════════════════════════════════
// Mandalorian HUD bezel · shared between Beskar Sigil and
// Mando Compass. Draws the iconic tracking-fob frame:
// outer rim with notch, shoulder brackets, side cutouts,
// inner tick arcs, two rim dots, and a right-side
// rectangular content bracket. The two patterns differ
// only in what's rendered inside the bezel.
// ═══════════════════════════════════════════════════════

function drawMandoBezel(
  ctx: OffscreenCanvasRenderingContext2D,
  hue: string,           // primary glow color (e.g. 'rgb(255, 90, 60)')
  rimGlyph: string,      // glyph drawn in the bottom-right bracket
  scanPhase: number,     // 0..1 sweep position for the top tick scanner
) {
  ctx.save()
  ctx.translate(HALF, HALF)

  const rimR = RADIUS - 4
  const innerR = RADIUS - 30

  // Outer rim ring (faint, full circle).
  ctx.strokeStyle = hue
  ctx.lineWidth = 2
  ctx.globalAlpha = 0.55
  ctx.beginPath()
  ctx.arc(0, 0, rimR, 0, TAU)
  ctx.stroke()
  ctx.globalAlpha = 1

  // Top arc bracket: thick arc from ~200° to ~340° (top-left to
  // top-right), with a small rectangular notch at top-center.
  ctx.lineWidth = 4
  ctx.lineCap = 'butt'
  ctx.strokeStyle = hue

  // Left half of top arc.
  ctx.beginPath()
  ctx.arc(0, 0, rimR - 8, Math.PI * 1.12, Math.PI * 1.42)
  ctx.stroke()
  // Right half of top arc.
  ctx.beginPath()
  ctx.arc(0, 0, rimR - 8, Math.PI * 1.58, Math.PI * 1.88)
  ctx.stroke()

  // Top-center notch: small upward rectangular protrusion above the gap.
  ctx.strokeStyle = hue
  ctx.lineWidth = 3
  const notchH = 14, notchW = 30
  const notchY = -(rimR - 4)
  ctx.beginPath()
  ctx.moveTo(-notchW / 2, notchY + notchH)
  ctx.lineTo(-notchW / 2, notchY)
  ctx.lineTo(notchW / 2, notchY)
  ctx.lineTo(notchW / 2, notchY + notchH)
  ctx.stroke()

  // Bottom arc bracket: symmetric at ~20° to ~160°.
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(0, 0, rimR - 8, Math.PI * 0.10, Math.PI * 0.42)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, rimR - 8, Math.PI * 0.58, Math.PI * 0.88)
  ctx.stroke()

  // Bottom-center notch (downward).
  ctx.lineWidth = 3
  const bnY = rimR - 4
  ctx.beginPath()
  ctx.moveTo(-notchW / 2, bnY - notchH)
  ctx.lineTo(-notchW / 2, bnY)
  ctx.lineTo(notchW / 2, bnY)
  ctx.lineTo(notchW / 2, bnY - notchH)
  ctx.stroke()

  // Left and right shoulder brackets: rectangular cutouts at 180° and 0°
  // that step the bezel inward at the equator.
  ctx.lineWidth = 3
  const shoulderW = 22
  const shoulderH = 60
  // Left shoulder.
  ctx.beginPath()
  ctx.moveTo(-rimR + 4, -shoulderH / 2)
  ctx.lineTo(-rimR + 4 + shoulderW, -shoulderH / 2)
  ctx.lineTo(-rimR + 4 + shoulderW, shoulderH / 2)
  ctx.lineTo(-rimR + 4, shoulderH / 2)
  ctx.stroke()
  // Right shoulder.
  ctx.beginPath()
  ctx.moveTo(rimR - 4, -shoulderH / 2)
  ctx.lineTo(rimR - 4 - shoulderW, -shoulderH / 2)
  ctx.lineTo(rimR - 4 - shoulderW, shoulderH / 2)
  ctx.lineTo(rimR - 4, shoulderH / 2)
  ctx.stroke()

  // Continuous tick ring · 360 ticks all the way around the inner rim
  // (every 1°), with a traveling "hot" window driven by scanPhase that
  // wraps around the full circle. Looks like a sci-fi data sweep that
  // never resets · the perfect endless-loop motif.
  const tickCount = 180
  for (let i = 0; i < tickCount; i++) {
    const t = i / tickCount
    const a = t * TAU - Math.PI / 2     // start at top, go CW
    const r0 = innerR - 4
    const r1 = innerR - 14
    const dx = Math.cos(a), dy = Math.sin(a)
    // Wrap-aware angular distance from the scanner head.
    const d = Math.min(
      Math.abs(t - scanPhase),
      Math.abs(t - scanPhase - 1),
      Math.abs(t - scanPhase + 1),
    )
    // Trailing tail · brightest at head, fading over ~20% of the ring.
    const ahead = (t - scanPhase + 1) % 1   // 0..1, how far past the head
    const tail = ahead < 0.20 ? (1 - ahead / 0.20) : 0
    const lit = Math.max(tail, d < 0.005 ? 1 : 0)
    ctx.globalAlpha = 0.20 + 0.75 * lit
    ctx.strokeStyle = hue
    ctx.lineWidth = lit > 0.5 ? 2 : 1
    ctx.beginPath()
    ctx.moveTo(dx * r0, dy * r0)
    ctx.lineTo(dx * r1, dy * r1)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // Two filled rim dots: upper-left at ~205° and lower-right at ~25°.
  ctx.fillStyle = hue
  for (const angDeg of [205, 25]) {
    const a = (angDeg * Math.PI) / 180
    ctx.beginPath()
    ctx.arc(Math.cos(a) * (rimR - 22), Math.sin(a) * (rimR - 22), 4, 0, TAU)
    ctx.fill()
  }

  // Bottom-right content bracket: trapezoid containing rimGlyph. Visible
  // in both reference images as a small framed badge at lower-right.
  ctx.strokeStyle = hue
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(70, 90)
  ctx.lineTo(118, 90)
  ctx.lineTo(132, 104)
  ctx.lineTo(132, 130)
  ctx.lineTo(70, 130)
  ctx.closePath()
  ctx.stroke()
  ctx.fillStyle = hue
  ctx.font = 'bold 22px "SF Pro Display", "Helvetica Neue", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(rimGlyph, 101, 112)

  ctx.restore()
}

// Stylized Mandalorian sigil · stacked flowing curves with hooked
// terminals. Renders centered at canvas mid with adjustable scale +
// alpha so the same routine works for primary glyph and the smaller
// stacked accent glyphs.
function drawMandoGlyph(
  ctx: OffscreenCanvasRenderingContext2D,
  cx: number, cy: number,
  scale: number,
  color: string,
  alpha: number,
) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(scale, scale)
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Top hook · curves from upper-left down and right with a flick.
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.moveTo(-32, -28)
  ctx.bezierCurveTo(-14, -42, 18, -36, 22, -14)
  ctx.bezierCurveTo(24, 2, 8, 8, -2, -2)
  ctx.stroke()

  // Middle stroke · S-curve through the center.
  ctx.lineWidth = 9
  ctx.beginPath()
  ctx.moveTo(-28, 0)
  ctx.bezierCurveTo(-6, 14, 18, -6, 30, 14)
  ctx.stroke()

  // Bottom flourish · short upward hook on the right.
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(-20, 22)
  ctx.bezierCurveTo(-4, 36, 14, 32, 26, 24)
  ctx.stroke()

  // Tiny accent dot.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(-30, 12, 2.6, 0, TAU)
  ctx.fill()

  ctx.restore()
  ctx.globalAlpha = 1
}

// ═══════════════════════════════════════════════════════
// Beskar Sigil · Mandalorian tracking-fob HUD in red,
// inspired by the gauntlet display from The Mandalorian.
// Pulsing central glyph, scanning tick strip, traveling
// lens-flare highlight across the dome.
// ═══════════════════════════════════════════════════════

export async function generateBeskarSigil(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []
  const HUE = 'rgb(255, 88, 56)'
  const HUE_DIM = 'rgb(180, 50, 30)'

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames

    clear(ctx, '#0a0403')

    // Subtle radial wash inside the bezel · darker rim, warm center.
    const wash = ctx.createRadialGradient(HALF, HALF, 10, HALF, HALF, RADIUS)
    wash.addColorStop(0, 'rgba(70, 18, 8, 0.55)')
    wash.addColorStop(1, 'rgba(10, 4, 3, 0)')
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, SIZE, SIZE)

    drawMandoBezel(ctx, HUE, '亗', phase)

    // Central pulsing glyph · breathing intensity locks to the loop.
    const pulse = 0.78 + 0.22 * Math.sin(phase * TAU * 2)
    // Outer faint glow pass via shadow.
    ctx.save()
    ctx.shadowColor = HUE
    ctx.shadowBlur = 24
    drawMandoGlyph(ctx, HALF, HALF, 2.0, HUE, 0.95 * pulse)
    ctx.restore()
    // Crisp foreground pass on top, no shadow.
    drawMandoGlyph(ctx, HALF, HALF, 2.0, 'rgb(255, 200, 170)', 0.85 * pulse)

    // Accent glyph to the right of the main one · smaller, dimmer.
    drawMandoGlyph(ctx, HALF + 70, HALF + 8, 0.45, HUE_DIM, 0.65)

    // Orbital lens flare · the highlight travels around the dome on a
    // circular path, never wrapping discontinuously. This is the visual
    // anchor that makes the pattern feel like an endless loop.
    const flareAng = phase * TAU - Math.PI * 0.25
    const flareX = HALF + Math.cos(flareAng) * RADIUS * 0.55
    const flareY = HALF + Math.sin(flareAng) * RADIUS * 0.55
    const flare = ctx.createRadialGradient(flareX, flareY, 0, flareX, flareY, 80)
    flare.addColorStop(0, 'rgba(255, 240, 220, 0.55)')
    flare.addColorStop(0.4, 'rgba(255, 200, 160, 0.22)')
    flare.addColorStop(1, 'rgba(255, 200, 160, 0)')
    ctx.fillStyle = flare
    ctx.fillRect(0, 0, SIZE, SIZE)

    // Bright starburst at the flare center.
    ctx.save()
    ctx.globalAlpha = 0.85
    ctx.strokeStyle = 'rgba(255, 250, 235, 0.9)'
    ctx.lineWidth = 1.4
    ctx.shadowColor = 'rgba(255, 240, 220, 0.9)'
    ctx.shadowBlur = 8
    for (let r = 0; r < 4; r++) {
      const ang = (r * Math.PI) / 4 + phase * TAU * 0.5
      const len = 30
      ctx.beginPath()
      ctx.moveTo(flareX - Math.cos(ang) * len, flareY - Math.sin(ang) * len)
      ctx.lineTo(flareX + Math.cos(ang) * len, flareY + Math.sin(ang) * len)
      ctx.stroke()
    }
    ctx.restore()

    // Reset fillStyle to a solid opaque color before circularMask, so the
    // destination-in mask uses a fully opaque source (otherwise the last
    // gradient's alpha is what gets used to keep pixels).
    ctx.fillStyle = '#fff'
    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.8))
  }
  return frames
}

// ═══════════════════════════════════════════════════════
// Mando Compass · amber tracking-dial HUD with rotating
// needle, green/blue arc segments, and stacked side
// glyphs. Inspired by the second Mandalorian HUD image.
// ═══════════════════════════════════════════════════════

export async function generateMandoCompass(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []
  const HUE = 'rgb(240, 170, 40)'
  const HUE_DIM = 'rgb(170, 110, 20)'

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames

    clear(ctx, '#0a0703')

    // Warm wash.
    const wash = ctx.createRadialGradient(HALF, HALF, 10, HALF, HALF, RADIUS)
    wash.addColorStop(0, 'rgba(70, 44, 8, 0.45)')
    wash.addColorStop(1, 'rgba(10, 7, 3, 0)')
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, SIZE, SIZE)

    drawMandoBezel(ctx, HUE, '亖', phase)

    ctx.save()
    ctx.translate(HALF, HALF)

    // Colored arc segments around the central dial · green wedge in the
    // upper-left, larger blue wedge sweeping the bottom-left. They rotate
    // counter to the needle (one full CCW turn per loop) so the HUD reads
    // as "tracking" and the motion completes an integer cycle for a
    // seamless seam.
    const arcR = RADIUS - 50
    const segPhase = -phase * TAU
    // Green segment.
    ctx.strokeStyle = 'rgb(80, 220, 140)'
    ctx.lineWidth = 9
    ctx.lineCap = 'butt'
    ctx.beginPath()
    ctx.arc(0, 0, arcR, Math.PI * 1.20 + segPhase, Math.PI * 1.36 + segPhase)
    ctx.stroke()
    // Blue segment (larger).
    ctx.strokeStyle = 'rgb(70, 150, 240)'
    ctx.lineWidth = 9
    ctx.beginPath()
    ctx.arc(0, 0, arcR, Math.PI * 0.62 + segPhase, Math.PI * 1.10 + segPhase)
    ctx.stroke()

    // Central dial face · inner tick ring + outer thin ring.
    ctx.strokeStyle = HUE
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.arc(0, 0, arcR - 16, 0, TAU)
    ctx.stroke()
    ctx.globalAlpha = 1

    // Dial ticks · clock-face style, 60 ticks, every 5th longer.
    ctx.strokeStyle = HUE
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU - Math.PI / 2
      const isMajor = i % 5 === 0
      const r0 = arcR - 18
      const r1 = r0 - (isMajor ? 12 : 6)
      ctx.lineWidth = isMajor ? 2 : 1
      ctx.globalAlpha = isMajor ? 0.85 : 0.55
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0)
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Rotating needle · two-toned, classic compass shape.
    const needleAng = phase * TAU - Math.PI / 2
    ctx.save()
    ctx.rotate(needleAng)
    ctx.shadowColor = HUE
    ctx.shadowBlur = 10
    ctx.strokeStyle = 'rgb(255, 220, 130)'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-12, 0)
    ctx.lineTo(arcR - 30, 0)
    ctx.stroke()
    ctx.shadowBlur = 0
    // Tail.
    ctx.strokeStyle = HUE_DIM
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(-30, 0)
    ctx.stroke()
    ctx.restore()

    // Center hub.
    ctx.fillStyle = HUE
    ctx.beginPath()
    ctx.arc(0, 0, 4, 0, TAU)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 240, 200, 0.9)'
    ctx.beginPath()
    ctx.arc(0, 0, 2, 0, TAU)
    ctx.fill()

    ctx.restore()

    // Stacked accent glyphs on the right · three small symbols, the
    // middle one pulses softly to indicate "active target".
    const middlePulse = 0.7 + 0.3 * Math.sin(phase * TAU * 2)
    drawMandoGlyph(ctx, HALF + 78, HALF - 26, 0.38, HUE, 0.8)
    drawMandoGlyph(ctx, HALF + 78, HALF, 0.42, 'rgb(255, 220, 140)', middlePulse)
    drawMandoGlyph(ctx, HALF + 78, HALF + 26, 0.38, HUE_DIM, 0.7)

    // Orbital lens flare · circles the dome on a circular path so the
    // motion never wraps discontinuously, reinforcing the endless-loop feel.
    const flareAng = (1 - phase) * TAU + Math.PI * 0.4   // CCW counter to needle
    const flareX = HALF + Math.cos(flareAng) * RADIUS * 0.5
    const flareY = HALF + Math.sin(flareAng) * RADIUS * 0.5
    const flare = ctx.createRadialGradient(flareX, flareY, 0, flareX, flareY, 90)
    flare.addColorStop(0, 'rgba(255, 240, 200, 0.5)')
    flare.addColorStop(0.4, 'rgba(255, 210, 140, 0.20)')
    flare.addColorStop(1, 'rgba(255, 210, 140, 0)')
    ctx.fillStyle = flare
    ctx.fillRect(0, 0, SIZE, SIZE)

    ctx.fillStyle = '#fff'
    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.8))
  }
  return frames
}




// ── The Traveller ───────────────────────────────────────
// Destiny 2 location card: the pale Traveler sphere centered inside a
// thin sacred-geometry diagram, surrounded by distant planets / galaxies
// and a nebula-rich deep-space backdrop.
export async function generateTheTraveller(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []
  const sphereR = 78
  const sphereR2 = sphereR * sphereR

  const stars = makeDestinyStarfield(0xC0FFEE, 140)
  const nebulae: DestinyNebula[] = [
    { x: HALF - 130, y: HALF - 70, r: 140, color: '90, 110, 200',  alpha: 0.22 },
    { x: HALF + 130, y: HALF + 90, r: 150, color: '180, 130, 200', alpha: 0.18 },
    { x: HALF - 40,  y: HALF + 140, r: 110, color: '120, 80, 180', alpha: 0.16 },
    { x: HALF + 80,  y: HALF - 130, r: 100, color: '200, 160, 130', alpha: 0.14 },
  ]

  // Distant body decorations (small planets / faint orbital marker rings
  // around the edge of the frame, like in the cinematic).
  type Distant = { x: number; y: number; r: number; color: string; ringR: number; ringAlpha: number }
  const distants: Distant[] = [
    { x: 50,        y: 70,        r: 18, color: '#c7c0b8', ringR: 0, ringAlpha: 0 },
    { x: SIZE - 60, y: 90,        r: 22, color: '#d6b27a', ringR: 30, ringAlpha: 0.35 },
    { x: 70,        y: SIZE - 70, r: 14, color: '#8a8a92', ringR: 22, ringAlpha: 0.30 },
    { x: SIZE - 70, y: SIZE - 60, r: 16, color: '#bea180', ringR: 0,  ringAlpha: 0 },
    { x: HALF - 130, y: HALF + 30, r: 8, color: '#aaa6a0', ringR: 0,  ringAlpha: 0 },
    { x: HALF + 140, y: HALF - 20, r: 6, color: '#d2ad7a', ringR: 0,  ringAlpha: 0 },
  ]

  // Fissure great-circles for the Traveler's surface markings.
  const rng2 = mulberry32(7)
  const fissures: Array<[number, number, number]> = []
  for (let i = 0; i < 5; i++) {
    const a = rng2() * TAU
    const b = (rng2() - 0.5) * Math.PI
    fissures.push([Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)])
  }

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames

    drawDestinyBackdrop(ctx, stars, nebulae, phase)

    // Distant orbital marker rings (around small planets).
    for (const d of distants) {
      if (d.ringR > 0) {
        ctx.strokeStyle = `rgba(220, 220, 230, ${d.ringAlpha})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.ringR, 0, TAU)
        ctx.stroke()
        // Tiny cardinal tick marks on the ring.
        for (let i = 0; i < 4; i++) {
          const a = i * (TAU / 4) + phase * TAU * 0
          ctx.beginPath()
          ctx.moveTo(d.x + Math.cos(a) * (d.ringR - 2), d.y + Math.sin(a) * (d.ringR - 2))
          ctx.lineTo(d.x + Math.cos(a) * (d.ringR + 2), d.y + Math.sin(a) * (d.ringR + 2))
          ctx.stroke()
        }
      }
      // Planet disc.
      ctx.fillStyle = d.color
      ctx.beginPath()
      ctx.arc(d.x, d.y, d.r, 0, TAU)
      ctx.fill()
      // Faint shading on planet.
      const sh = ctx.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.3, 0, d.x, d.y, d.r)
      sh.addColorStop(0, 'rgba(255,255,255,0.18)')
      sh.addColorStop(1, 'rgba(0,0,0,0.55)')
      ctx.fillStyle = sh
      ctx.beginPath()
      ctx.arc(d.x, d.y, d.r, 0, TAU)
      ctx.fill()
    }

    // Sacred-geometry overlay around the Traveler · 8-sided ring with no
    // inner inscribed shape (clean, like the cinematic).  Rotates slowly:
    // 1 full turn per loop for a seamless seam.
    drawSacredGeometry(
      ctx,
      HALF, HALF,
      sphereR + 38,
      8, 0,
      phase * TAU * 0.5,
      '230, 220, 200',
      0.65,
    )
    // Extra concentric thin ring for the cinematic "double frame" feel.
    drawSacredGeometry(
      ctx,
      HALF, HALF,
      sphereR + 60,
      16, 0,
      -phase * TAU * 0.5,
      '180, 170, 150',
      0.30,
    )

    // The Traveler · pale cream sphere with subtle surface striations.
    // The cinematic is essentially a static glamour shot · keep the sphere
    // still (no yaw) so we don't get a fast, jarring spin.  All loop motion
    // comes from the slowly counter-rotating sacred-geometry rings, the
    // twinkling starfield, and a tiny breathing pulse on the halo below.
    const imageData = ctx.getImageData(0, 0, SIZE, SIZE)
    const data = imageData.data
    const yaw = 0
    const cy = Math.cos(yaw), sy = Math.sin(yaw)
    const lx = -0.4, ly = -0.5, lz = 0.75
    const llen = Math.sqrt(lx * lx + ly * ly + lz * lz)
    const Lx = lx / llen, Ly = ly / llen, Lz = lz / llen

    for (let py = HALF - sphereR; py <= HALF + sphereR; py++) {
      for (let px = HALF - sphereR; px <= HALF + sphereR; px++) {
        const dx = px - HALF, dy = py - HALF
        const r2 = dx * dx + dy * dy
        if (r2 > sphereR2) continue
        const nx = dx / sphereR, ny = dy / sphereR
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
        const bx = cy * nx - sy * nz
        const by = ny
        const bz = sy * nx + cy * nz
        const lambert = Math.max(0, nx * Lx + ny * Ly + nz * Lz)
        const rim = Math.pow(1 - nz, 3) * 0.35
        const shade = 0.32 + 0.72 * lambert + rim

        let fis = 0
        for (const fn of fissures) {
          const d = Math.abs(bx * fn[0] + by * fn[1] + bz * fn[2])
          if (d < 0.05) fis += (1 - d / 0.05) * 0.18
        }

        let r = 220 * shade + 30 * fis
        let g = 220 * shade + 25 * fis
        let b = 210 * shade + 12 * fis
        if (lambert < 0.15) { r *= 0.78; g *= 0.82; b *= 0.95 }

        const i = (py * SIZE + px) * 4
        data[i]     = Math.min(255, r)
        data[i + 1] = Math.min(255, g)
        data[i + 2] = Math.min(255, b)
        data[i + 3] = 255
      }
    }
    ctx.putImageData(imageData, 0, 0)

    // Soft halo just outside the sphere · tiny breathing pulse (2 cycles).
    const breath = 0.32 + 0.06 * Math.sin(phase * TAU * 2)
    const aura = ctx.createRadialGradient(HALF, HALF, sphereR - 4, HALF, HALF, sphereR + 22)
    aura.addColorStop(0, `rgba(245, 235, 215, ${breath})`)
    aura.addColorStop(1, 'rgba(245, 235, 215, 0)')
    ctx.fillStyle = aura
    ctx.fillRect(0, 0, SIZE, SIZE)

    ctx.fillStyle = '#fff'
    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.7))
  }
  return frames
}

// ── Campus 9 ────────────────────────────────────────────
export async function generateCampus9(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []

  // Ping-pong loop · forward render then mirror back to keep the synthwave
  // scroll perfectly seamless (no visible seam from grid rows / pillars
  // snapping back to 0).  Same algorithm as generateHypnoticSpirals.
  const half = Math.floor(opts.frames / 2) + 1

  async function renderFrame(f: number): Promise<Uint8Array> {
    const phase = (half === 1) ? 0 : f / (half - 1)

    const bg = ctx.createLinearGradient(0, 0, 0, SIZE)
    bg.addColorStop(0.00, '#1a0033')
    bg.addColorStop(0.45, '#3a1066')
    bg.addColorStop(0.50, '#0a0014')
    bg.addColorStop(0.52, '#1a0220')
    bg.addColorStop(1.00, '#04000a')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, SIZE, SIZE)

    // Synthwave sun with horizontal scan-lines.
    const sunR = 70, sunCx = HALF, sunCy = HALF - 8
    const sun = ctx.createRadialGradient(sunCx, sunCy, 0, sunCx, sunCy, sunR)
    sun.addColorStop(0.00, '#ff6ee0')
    sun.addColorStop(0.45, '#ff2090')
    sun.addColorStop(1.00, '#5a0040')
    ctx.fillStyle = sun
    ctx.beginPath()
    ctx.arc(sunCx, sunCy, sunR, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#04000a'
    for (let i = 1; i <= 5; i++) {
      const y = sunCy - sunR + (i / 5) * sunR + 4
      ctx.fillRect(sunCx - sunR, y, sunR * 2, 3 + i)
    }

    const horizonY = SIZE * 0.5
    const vpX = HALF

    // Floor grid scrolling forward · integer cycle (1 row per loop).
    const rows = 14
    ctx.strokeStyle = 'rgba(120, 240, 255, 0.85)'
    ctx.lineWidth = 1.5
    for (let i = 0; i < rows; i++) {
      const u = (i + phase) / rows
      const depth = u * u
      const y = horizonY + depth * (SIZE - horizonY)
      ctx.globalAlpha = 0.15 + 0.7 * (1 - u)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(SIZE, y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Perspective lines from the vanishing point.
    const cols = 13
    ctx.strokeStyle = 'rgba(255, 80, 200, 0.6)'
    ctx.lineWidth = 1.2
    for (let i = 0; i <= cols; i++) {
      const t = i / cols
      const xEnd = -SIZE * 0.6 + t * (SIZE * 2.2)
      ctx.beginPath()
      ctx.moveTo(vpX, horizonY)
      ctx.lineTo(xEnd, SIZE)
      ctx.stroke()
    }

    // Vertical neon "light columns" flowing toward the viewer.
    const pillarCount = 8
    for (let i = 0; i < pillarCount; i++) {
      const u = (i + phase) / pillarCount
      if (u <= 0.02) continue
      const depth = u * u
      const xOffset = (1 - depth) * (SIZE * 0.55) + 28
      const pillarH = 30 + depth * 140
      const yTop = horizonY - pillarH * 0.2
      const a = 0.25 + 0.7 * (1 - u)
      for (const side of [-1, 1]) {
        const cx = vpX + side * xOffset * (0.2 + 0.8 * depth)
        const glow = ctx.createRadialGradient(cx, yTop + pillarH / 2, 0, cx, yTop + pillarH / 2, pillarH * 0.5)
        glow.addColorStop(0, `rgba(120, 240, 255, ${a})`)
        glow.addColorStop(1, 'rgba(120, 240, 255, 0)')
        ctx.fillStyle = glow
        ctx.fillRect(cx - pillarH, yTop, pillarH * 2, pillarH)
        ctx.fillStyle = `rgba(255, 255, 255, ${a})`
        ctx.fillRect(cx - 0.8, yTop, 1.6, pillarH)
      }
    }

    // Horizon glow strip.
    const horizonGlow = ctx.createLinearGradient(0, horizonY - 4, 0, horizonY + 4)
    horizonGlow.addColorStop(0, 'rgba(255, 100, 220, 0)')
    horizonGlow.addColorStop(0.5, 'rgba(255, 100, 220, 0.85)')
    horizonGlow.addColorStop(1, 'rgba(255, 100, 220, 0)')
    ctx.fillStyle = horizonGlow
    ctx.fillRect(0, horizonY - 4, SIZE, 8)

    ctx.fillStyle = '#fff'
    circularMask(ctx)
    return await toJpeg(canvas, 0.75)
  }

  const forward: Uint8Array[] = []
  for (let f = 0; f < half; f++) forward.push(await renderFrame(f))
  for (let f = 0; f < half; f++) frames.push(forward[f])
  for (let f = half - 2; f >= 1 && frames.length < opts.frames; f--) frames.push(forward[f])
  while (frames.length < opts.frames) frames.push(forward[forward.length - 1])
  return frames
}

// ── Ishtar Sink ─────────────────────────────────────────
// Destiny 2 "Campus 9 / Ishtar Sink, Venus" cinematic, frames t=2685-2690:
// concentric sacred-geometry rings around a hexagonal frame with vertex
// markers, faint Venusian disc behind the diagram, and a large bronze
// Hunter class glyph (three stacked chevrons) glowing at the centre.
// All motion uses integer cycles for a perfect seamless loop.
export async function generateIshtarSink(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []

  const stars = makeDestinyStarfield(0x15741A, 130)
  const nebulae: DestinyNebula[] = [
    { x: HALF - 130, y: HALF - 50, r: 170, color: '55, 90, 150',  alpha: 0.22 },
    { x: HALF + 130, y: HALF + 70, r: 160, color: '40, 70, 130',  alpha: 0.20 },
    { x: HALF,       y: HALF - 130, r: 130, color: '80, 110, 180', alpha: 0.14 },
    { x: HALF + 60,  y: HALF + 130, r: 120, color: '30, 50, 100', alpha: 0.18 },
  ]

  // Pre-computed bronze noise texture (small tile, sampled with modulo).
  const NOISE = 64
  const noise = new Uint8Array(NOISE * NOISE)
  {
    const rng = mulberry32(0xB0BBED)
    for (let i = 0; i < NOISE * NOISE; i++) noise[i] = (rng() * 255) | 0
  }

  // Hunter glyph geometry: three stacked V chevrons.  We render each
  // chevron as a thick stroked V (line-join round, line-cap round) which
  // matches the Hunter class symbol much more faithfully than a filled
  // polygon.
  const GW = 36                   // half-width of widest chevron
  const GH = 62                   // total glyph height
  const GTHICK = 11               // chevron stroke thickness
  const GSPACE = 5                // gap between chevrons
  const eachH = (GH - 2 * GSPACE) / 3
  const drawChevrons = (ctx2: OffscreenCanvasRenderingContext2D) => {
    ctx2.lineCap = 'round'
    ctx2.lineJoin = 'round'
    for (let i = 0; i < 3; i++) {
      const yTop = -GH / 2 + i * (eachH + GSPACE)
      const w = GW * (1 - i * 0.06)
      ctx2.beginPath()
      ctx2.moveTo(-w, yTop + eachH)
      ctx2.lineTo(0, yTop)
      ctx2.lineTo(w, yTop + eachH)
      ctx2.stroke()
    }
  }

  const RINGS = [
    { r: 138, dash: null,        alpha: 0.55, width: 1.0 },
    { r: 130, dash: [2, 3] as number[], alpha: 0.32, width: 0.7 },
    { r: 122, dash: [3, 4] as number[], alpha: 0.40, width: 0.8 },
    { r: 110, dash: null,        alpha: 0.70, width: 1.1 }, // hex inscribed here
    { r:  96, dash: [2, 6] as number[], alpha: 0.35, width: 0.8 },
    { r:  86, dash: [4, 4] as number[], alpha: 0.30, width: 0.7 },
    { r:  80, dash: null,        alpha: 0.55, width: 1.0 },
  ]
  const hexR = 110
  const planetR = 78

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames

    // 1. Backdrop: deep navy with faint blue nebula and stars.
    drawDestinyBackdrop(ctx, stars, nebulae, phase, '#050813')

    // 2. Faint Venus disc behind the geometry.  Mostly dark with a thin
    //    rim-lit crescent so it reads as a planet, not a flat blob.
    ctx.save()
    ctx.translate(HALF, HALF)
    const planet = ctx.createRadialGradient(-planetR * 0.35, -planetR * 0.4, 0, 0, 0, planetR)
    planet.addColorStop(0.00, 'rgba(90, 80, 70, 0.55)')
    planet.addColorStop(0.55, 'rgba(40, 35, 50, 0.55)')
    planet.addColorStop(1.00, 'rgba(15, 18, 30, 0.85)')
    ctx.fillStyle = planet
    ctx.beginPath()
    ctx.arc(0, 0, planetR, 0, TAU)
    ctx.fill()
    // Thin warm rim-light on the far side.
    ctx.strokeStyle = 'rgba(200, 160, 110, 0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(0, 0, planetR, Math.PI * 0.15, Math.PI * 0.85)
    ctx.stroke()
    ctx.restore()

    // 3. Concentric rings.  Outermost rotates CCW (1 turn/loop), every
    //    other layer alternates direction so the diagram feels alive.
    ctx.save()
    ctx.translate(HALF, HALF)
    RINGS.forEach((ring, idx) => {
      ctx.save()
      const dir = idx % 2 === 0 ? -1 : 1
      // Inner ring spins twice as fast for visual interest.
      const cycles = idx === RINGS.length - 1 ? 2 : 1
      ctx.rotate(dir * phase * TAU * cycles)
      ctx.strokeStyle = `rgba(195, 215, 245, ${ring.alpha})`
      ctx.lineWidth = ring.width
      if (ring.dash) ctx.setLineDash(ring.dash); else ctx.setLineDash([])
      ctx.beginPath()
      ctx.arc(0, 0, ring.r, 0, TAU)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    })
    ctx.restore()

    // 4. Cardinal tick marks on the outermost ring (12 ticks).
    ctx.save()
    ctx.translate(HALF, HALF)
    ctx.rotate(-phase * TAU)
    ctx.strokeStyle = 'rgba(210, 225, 250, 0.7)'
    ctx.lineWidth = 1
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU
      const inner = 138 - (i % 3 === 0 ? 8 : 4)
      const outer = 138
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner)
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer)
      ctx.stroke()
    }
    ctx.restore()

    // 5. Hexagon (vertex pointing UP, inscribed in the third ring) with
    //    counter-rotation (1 CW turn/loop).
    ctx.save()
    ctx.translate(HALF, HALF)
    ctx.rotate(phase * TAU)
    ctx.strokeStyle = 'rgba(210, 225, 250, 0.85)'
    ctx.lineWidth = 1.3
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU - Math.PI / 2
      const x = Math.cos(a) * hexR, y = Math.sin(a) * hexR
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.stroke()

    // Diamond markers + small open rings at each hex vertex.  Pulse on
    //    an integer cycle for the heartbeat feel.
    const pulse = 0.8 + 0.2 * Math.sin(phase * TAU * 2)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU - Math.PI / 2
      const x = Math.cos(a) * hexR, y = Math.sin(a) * hexR
      // Open ring around the vertex.
      ctx.strokeStyle = `rgba(220, 230, 250, ${0.85 * pulse})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, TAU)
      ctx.stroke()
      // Diamond at the vertex.
      ctx.fillStyle = `rgba(235, 240, 255, ${pulse})`
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(Math.PI / 4)
      ctx.fillRect(-2, -2, 4, 4)
      ctx.restore()
    }

    // Radial spokes from inner ring to second ring at the 6 hex angles.
    ctx.strokeStyle = 'rgba(180, 200, 230, 0.30)'
    ctx.lineWidth = 0.8
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU - Math.PI / 2
      const c = Math.cos(a), s = Math.sin(a)
      ctx.beginPath()
      ctx.moveTo(c * 80, s * 80)
      ctx.lineTo(c * 122, s * 122)
      ctx.stroke()
    }
    ctx.restore()

    // 6. Soft warm halo behind the glyph.
    const halo = ctx.createRadialGradient(HALF, HALF, 4, HALF, HALF, 65)
    const haloAlpha = 0.22 + 0.08 * Math.sin(phase * TAU * 2)
    halo.addColorStop(0.00, `rgba(255, 195, 110, ${haloAlpha})`)
    halo.addColorStop(0.55, `rgba(200, 130, 70, ${haloAlpha * 0.35})`)
    halo.addColorStop(1.00, 'rgba(160, 80, 40, 0)')
    ctx.fillStyle = halo
    ctx.fillRect(0, 0, SIZE, SIZE)

    // 7. Bronze Hunter glyph: 3 stacked V chevrons, large and centred.
    //    Strokes use a bronze vertical gradient, then we sprinkle noise
    //    speckles inside a clip of the same path for weathered texture.
    const glyphPulse = 0.85 + 0.15 * Math.sin(phase * TAU * 2)

    ctx.save()
    ctx.translate(HALF, HALF + 2)

    // Bronze vertical gradient for the chevron strokes.
    const bronze = ctx.createLinearGradient(0, -GH / 2, 0, GH / 2)
    bronze.addColorStop(0.00, `rgba(255, 225, 160, ${0.95 * glyphPulse})`)
    bronze.addColorStop(0.35, `rgba(225, 165,  85, ${0.95 * glyphPulse})`)
    bronze.addColorStop(0.70, `rgba(180, 120,  55, ${0.92 * glyphPulse})`)
    bronze.addColorStop(1.00, `rgba(135,  85,  45, ${0.88 * glyphPulse})`)
    ctx.strokeStyle = bronze
    ctx.lineWidth = GTHICK
    ctx.shadowColor = 'rgba(255, 200, 120, 0.55)'
    ctx.shadowBlur = 6
    drawChevrons(ctx)
    ctx.shadowBlur = 0

    // Weathered metal texture: clip to the chevron stroke region by
    // re-stroking with a very wide line and using it as a clip mask via
    // a second offscreen pass.  Simpler approach: re-stroke at slightly
    // narrower width with semi-random brightness modulation.
    ctx.save()
    // Use the chevron stroke region as a clip: stroke into a path object
    // is not directly clip-able, so we tile noise behind a second very
    // slim re-stroke that adds bright/dark speckles.
    ctx.lineWidth = GTHICK - 1
    for (let i = 0; i < 3; i++) {
      const yTop = -GH / 2 + i * (eachH + GSPACE)
      const w = GW * (1 - i * 0.06)
      // Bright high-noise specks along the top arm.
      const seg = 18
      for (let s = 0; s < seg; s++) {
        const t = (s + 0.5) / seg
        // Left arm.
        const lx = -w + (0 - (-w)) * t
        const ly = (yTop + eachH) + (yTop - (yTop + eachH)) * t
        // Right arm.
        const rx = 0 + (w - 0) * t
        const ry = yTop + (yTop + eachH - yTop) * t
        for (const [px, py] of [[lx, ly], [rx, ry]]) {
          const nx = (((px * 1.7) | 0) + NOISE * 4) % NOISE
          const ny = (((py * 1.7) | 0) + NOISE * 4) % NOISE
          const n = noise[ny * NOISE + nx]
          if (n > 200) {
            ctx.fillStyle = `rgba(255, 240, 200, ${(n - 200) / 70})`
            ctx.fillRect(px - 1, py - 1, 2, 2)
          } else if (n < 55) {
            ctx.fillStyle = `rgba(50, 25, 15, ${(55 - n) / 70})`
            ctx.fillRect(px - 1, py - 1, 2, 2)
          }
        }
      }
    }
    ctx.restore()

    // Thin warm highlight outline on top.
    ctx.strokeStyle = `rgba(255, 235, 180, ${0.55 * glyphPulse})`
    ctx.lineWidth = 1
    drawChevrons(ctx)
    ctx.restore()

    // 8. Mask to circle and emit frame.
    ctx.fillStyle = '#fff'
    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.75))
  }
  return frames
}


// ── Altar of Oryx ───────────────────────────────────────
export async function generateAltarOfOryx(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []

  const rng = mulberry32(0xDEADBEEF)
  type Flame = { x: number; baseY: number; rise: number; w: number; phase: number; cycles: number; hueGreen: boolean }
  const flames: Flame[] = []
  for (let i = 0; i < 28; i++) {
    flames.push({
      x: HALF + (rng() - 0.5) * 200,
      baseY: HALF + 70 + rng() * 16,
      rise: 70 + rng() * 80,
      w: 18 + rng() * 28,
      phase: rng() * TAU,
      cycles: 1 + Math.floor(rng() * 2),
      hueGreen: rng() > 0.25,
    })
  }

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames

    clear(ctx, '#040208')
    const wash = ctx.createRadialGradient(HALF, HALF + 20, 20, HALF, HALF + 20, RADIUS)
    wash.addColorStop(0, 'rgba(60, 20, 90, 0.45)')
    wash.addColorStop(0.6, 'rgba(20, 8, 32, 0.4)')
    wash.addColorStop(1, 'rgba(4, 2, 8, 0)')
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, SIZE, SIZE)

    // Drifting taken-purple haze (integer-cycle orbits).
    for (let i = 0; i < 2; i++) {
      const ang = phase * TAU * (i === 0 ? 1 : -1) + i * Math.PI
      const cx = HALF + Math.cos(ang) * 60
      const cy = HALF - 40 + Math.sin(ang) * 30
      const haze = ctx.createRadialGradient(cx, cy, 0, cx, cy, 110)
      haze.addColorStop(0, 'rgba(140, 70, 220, 0.18)')
      haze.addColorStop(1, 'rgba(140, 70, 220, 0)')
      ctx.fillStyle = haze
      ctx.fillRect(0, 0, SIZE, SIZE)
    }

    // Altar slab.
    ctx.save()
    ctx.translate(HALF, HALF + 90)
    const slab = ctx.createLinearGradient(0, -50, 0, 50)
    slab.addColorStop(0, '#1a1424')
    slab.addColorStop(1, '#080610')
    ctx.fillStyle = slab
    ctx.beginPath()
    ctx.moveTo(-110, -50)
    ctx.lineTo(110, -50)
    ctx.lineTo(130, 50)
    ctx.lineTo(-130, 50)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(80, 200, 100, 0.35)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-110, -50)
    ctx.lineTo(110, -50)
    ctx.stroke()
    ctx.restore()

    // Floating hex sigil · 1 full rotation per loop.
    ctx.save()
    ctx.translate(HALF, HALF - 28)
    ctx.rotate(phase * TAU)
    ctx.strokeStyle = 'rgba(120, 255, 130, 0.85)'
    ctx.lineWidth = 2
    ctx.shadowColor = 'rgba(120, 255, 130, 0.8)'
    ctx.shadowBlur = 10
    const hexR = 36
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU - Math.PI / 2
      const x = Math.cos(a) * hexR
      const y = Math.sin(a) * hexR
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.stroke()
    ctx.rotate(-phase * TAU * 2)
    ctx.beginPath()
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU - Math.PI / 2
      const x = Math.cos(a) * (hexR * 0.55)
      const y = Math.sin(a) * (hexR * 0.55)
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.restore()

    // Flames · additive radial gradients flickering on integer cycles.
    ctx.globalCompositeOperation = 'lighter'
    for (const fl of flames) {
      const t = Math.sin(fl.phase + phase * TAU * fl.cycles) * 0.5 + 0.5
      const h = fl.rise * (0.7 + t * 0.5)
      const cy = fl.baseY - h
      const grad = ctx.createRadialGradient(fl.x, fl.baseY, 4, fl.x, cy, fl.w + h * 0.4)
      if (fl.hueGreen) {
        grad.addColorStop(0.00, `rgba(180, 255, 160, ${0.55 + 0.25 * t})`)
        grad.addColorStop(0.35, `rgba(60, 220, 90, ${0.35 * t})`)
        grad.addColorStop(1.00, 'rgba(20, 80, 30, 0)')
      } else {
        grad.addColorStop(0.00, `rgba(180, 110, 255, ${0.45 + 0.25 * t})`)
        grad.addColorStop(0.35, `rgba(120, 60, 200, ${0.35 * t})`)
        grad.addColorStop(1.00, 'rgba(40, 20, 80, 0)')
      }
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(fl.x, fl.baseY - h * 0.4, fl.w + h * 0.3, 0, TAU)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'

    ctx.fillStyle = '#fff'
    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.7))
  }
  return frames
}

// ── The Dawning ─────────────────────────────────────────
// Destiny 2 "The Dawning" location card: a brilliant cyan-teal nova
// starburst with a bright yellow-white core radiating rays/streaks,
// flanked by a cool blue-green nebula on the left and a warm orange-red
// nebula on the right, set against a star-rich deep-space backdrop with
// lens-flare circles.  All motion on integer cycles for a seamless loop.
export async function generateTheDawning(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []

  const stars = makeDestinyStarfield(0xDA47A1, 150)
  const nebulae: DestinyNebula[] = [
    // Cool blue-green cloud on the left.
    { x: HALF - 130, y: HALF - 20, r: 170, color: '70, 180, 200',  alpha: 0.32 },
    { x: HALF - 90,  y: HALF + 90, r: 130, color: '60, 200, 170',  alpha: 0.22 },
    // Warm orange-red cloud on the right.
    { x: HALF + 130, y: HALF + 30, r: 170, color: '230, 110, 70',  alpha: 0.30 },
    { x: HALF + 90,  y: HALF - 90, r: 120, color: '240, 160, 90',  alpha: 0.20 },
    // Subtle teal wash across the centre.
    { x: HALF,       y: HALF,      r: 200, color: '90, 220, 220',  alpha: 0.10 },
  ]

  // Ray angles for the radiating starburst · fixed seed, varied lengths.
  const rng = mulberry32(0x0DA70E)
  type Ray = { angle: number; length: number; width: number; alpha: number }
  const rays: Ray[] = []
  for (let i = 0; i < 28; i++) {
    rays.push({
      angle: (i / 28) * TAU + (rng() - 0.5) * 0.04,
      length: 60 + rng() * 90,
      width: 0.6 + rng() * 1.6,
      alpha: 0.35 + rng() * 0.5,
    })
  }
  // A second sparser set of long bright streaks.
  const longRays: Ray[] = []
  for (let i = 0; i < 8; i++) {
    longRays.push({
      angle: rng() * TAU,
      length: 140 + rng() * 50,
      width: 1.2 + rng() * 1.2,
      alpha: 0.55 + rng() * 0.35,
    })
  }

  for (let f = 0; f < opts.frames; f++) {
    const phase = f / opts.frames

    drawDestinyBackdrop(ctx, stars, nebulae, phase, '#04060f')

    // Gentle nebula drift · re-paint a soft offset wash so the clouds
    // appear to breathe on 1 integer cycle.
    const drift = Math.sin(phase * TAU) * 6
    const breath = ctx.createRadialGradient(HALF + drift, HALF, 30, HALF, HALF, RADIUS)
    breath.addColorStop(0, 'rgba(120, 220, 210, 0.10)')
    breath.addColorStop(1, 'rgba(120, 220, 210, 0)')
    ctx.fillStyle = breath
    ctx.fillRect(0, 0, SIZE, SIZE)

    // Nova rotation · 1 full turn per loop for seamless seam.
    const novaRot = phase * TAU
    // Nova pulse · 2 cycles per loop.
    const pulse = 0.85 + 0.15 * Math.sin(phase * TAU * 2)

    ctx.save()
    ctx.translate(HALF, HALF)

    // Outer rays · rotate slowly.
    ctx.rotate(novaRot)
    ctx.lineCap = 'round'
    for (const r of rays) {
      const a = r.angle
      const len = r.length * pulse
      const grad = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len)
      grad.addColorStop(0.00, `rgba(255, 250, 220, ${r.alpha})`)
      grad.addColorStop(0.35, `rgba(140, 235, 220, ${r.alpha * 0.85})`)
      grad.addColorStop(1.00, 'rgba(60, 160, 180, 0)')
      ctx.strokeStyle = grad
      ctx.lineWidth = r.width
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len)
      ctx.stroke()
    }

    // Long bright streaks · rotate the other way for richer motion.
    ctx.rotate(-novaRot * 2)
    for (const r of longRays) {
      const a = r.angle
      const len = r.length * pulse
      const grad = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len)
      grad.addColorStop(0.00, `rgba(255, 255, 240, ${r.alpha})`)
      grad.addColorStop(0.40, `rgba(180, 240, 230, ${r.alpha * 0.7})`)
      grad.addColorStop(1.00, 'rgba(40, 120, 160, 0)')
      ctx.strokeStyle = grad
      ctx.lineWidth = r.width
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len)
      ctx.stroke()
    }
    ctx.restore()

    // Big teal halo behind core.
    const haloR = 95 * pulse
    const halo = ctx.createRadialGradient(HALF, HALF, 0, HALF, HALF, haloR)
    halo.addColorStop(0.00, 'rgba(180, 255, 240, 0.55)')
    halo.addColorStop(0.40, 'rgba(90, 220, 220, 0.35)')
    halo.addColorStop(0.80, 'rgba(40, 140, 180, 0.10)')
    halo.addColorStop(1.00, 'rgba(20, 80, 120, 0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(HALF, HALF, haloR, 0, TAU)
    ctx.fill()

    // Bright cyan/teal inner core.
    const coreR = 40 * pulse
    const core = ctx.createRadialGradient(HALF, HALF, 0, HALF, HALF, coreR)
    core.addColorStop(0.00, 'rgba(255, 255, 255, 1)')
    core.addColorStop(0.20, 'rgba(255, 250, 200, 0.95)')
    core.addColorStop(0.55, 'rgba(160, 245, 230, 0.75)')
    core.addColorStop(1.00, 'rgba(60, 200, 210, 0)')
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(HALF, HALF, coreR, 0, TAU)
    ctx.fill()

    // Hot white pinpoint at the very centre.
    ctx.fillStyle = 'rgba(255, 255, 255, 1)'
    ctx.beginPath()
    ctx.arc(HALF, HALF, 6 * pulse, 0, TAU)
    ctx.fill()

    // Lens-flare circles along a diagonal · classic anamorphic ghosts.
    // Drift along the diagonal on 1 integer cycle.
    const flares: Array<[number, number, string, number]> = [
      [-0.6,  0.6, '180, 240, 220', 14],
      [-0.3,  0.3, '255, 220, 160', 8],
      [ 0.4, -0.4, '160, 220, 255', 11],
      [ 0.75, -0.75, '255, 180, 140', 7],
    ]
    const flareT = Math.sin(phase * TAU) * 4
    for (const [fx, fy, col, fr] of flares) {
      const cx = HALF + fx * 120 + flareT
      const cy = HALF + fy * 120 - flareT
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, fr)
      g.addColorStop(0, `rgba(${col}, 0.55)`)
      g.addColorStop(1, `rgba(${col}, 0)`)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cx, cy, fr, 0, TAU)
      ctx.fill()
    }

    // A few bright "lens-flare star" sparkles (cross + diagonal).
    const sparks: Array<[number, number, number]> = [
      [HALF - 80, HALF + 60, 0.8],
      [HALF + 95, HALF - 50, 0.9],
      [HALF + 60, HALF + 95, 0.7],
    ]
    for (const [sx, sy, base] of sparks) {
      const tw = base * (0.7 + 0.3 * Math.sin(phase * TAU * 2 + sx))
      ctx.strokeStyle = `rgba(255, 250, 230, ${tw})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(sx - 8, sy); ctx.lineTo(sx + 8, sy)
      ctx.moveTo(sx, sy - 8); ctx.lineTo(sx, sy + 8)
      ctx.moveTo(sx - 5, sy - 5); ctx.lineTo(sx + 5, sy + 5)
      ctx.moveTo(sx - 5, sy + 5); ctx.lineTo(sx + 5, sy - 5)
      ctx.stroke()
      ctx.fillStyle = `rgba(255, 255, 255, ${tw})`
      ctx.beginPath()
      ctx.arc(sx, sy, 1.4, 0, TAU)
      ctx.fill()
    }

    ctx.fillStyle = '#fff'
    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.7))
  }
  return frames
}
