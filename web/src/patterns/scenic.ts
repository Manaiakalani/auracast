import { HALF, TAU, createCanvas, clear, circularMask, toJpeg } from './helpers'
import type { PatternOptions } from './helpers'

// Hand-painted round miniature base: cadmium cottage, gray lane with
// marching yellow dashes, a fountain, and a gatehouse cropped by the rim.
// Motion is an integer number of cycles so frame 0 matches the frame
// after the last one.

const INK = '#1c140e'
const GRASS = '#3fa332'
const GRASS_SHADE = '#2f8528'
const GRASS_LIGHT = '#5cb84a'
const BUSH = '#173e20'
const ROAD = '#8f918c'
const DASH = '#f2d34a'
const WALL = '#f6d24c'
const ROOF = '#e23b32'
const OPENING = '#3a76d4'
const WATER = '#3ec4ee'
const WATER_DEEP = '#1490c8'

const ROAD_WIDTH = 34
const DASH_ON = 12
const DASH_GAP = 11
const DASH_PERIOD = DASH_ON + DASH_GAP

type Pt = [number, number]

export async function generatePaintedBase(opts: PatternOptions): Promise<Uint8Array[]> {
  const [canvas, ctx] = createCanvas()
  const frames: Uint8Array[] = []
  const count = Math.max(0, opts.frames)

  for (let f = 0; f < count; f++) {
    const phase = count <= 1 ? 0.35 : f / count
    clear(ctx, GRASS)
    drawLawn(ctx)
    drawRoads(ctx, phase)
    drawBushes(ctx)
    drawCottage(ctx, phase)
    drawFountain(ctx, phase)
    drawGatehouse(ctx)
    drawButterfly(ctx, phase)
    circularMask(ctx)
    frames.push(await toJpeg(canvas, 0.86))
  }
  return frames
}

function drawLawn(ctx: OffscreenCanvasRenderingContext2D) {
  const dabs: Array<[number, number, number, number, string]> = [
    [130, 118, 54, 28, GRASS_SHADE],
    [250, 196, 46, 22, GRASS_SHADE],
    [78, 196, 32, 18, GRASS_LIGHT],
    [300, 108, 28, 16, GRASS_LIGHT],
    [150, 268, 40, 16, GRASS_SHADE],
  ]
  for (const [x, y, rx, ry, color] of dabs) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU)
    ctx.fill()
  }
}

function traceRoad(ctx: OffscreenCanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i += 2) {
    const c = pts[i]
    const p = pts[i + 1]
    ctx.quadraticCurveTo(c[0], c[1], p[0], p[1])
  }
}

function drawRoads(ctx: OffscreenCanvasRenderingContext2D, phase: number) {
  // Each path is move, then (control, end) pairs for quadraticCurveTo.
  const paths: Pt[][] = [
    // North lane, bowed across the top of the disc.
    [[18, 112], [100, 28], [176, 58], [268, 78], [292, 46], [352, 28], [348, 108]],
    // West lane down to the crossroad.
    [[46, 86], [22, 150], [86, 214]],
    // Lane just east of the cottage.
    [[196, 64], [236, 130], [206, 214]],
    // East lane curling around the fountain.
    [[300, 52], [362, 110], [338, 168], [324, 214], [268, 228]],
    // Crossroad under the cottage and fountain.
    [[6, 214], [180, 242], [362, 220]],
  ]

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([])

  for (const path of paths) {
    ctx.lineWidth = ROAD_WIDTH + 8
    ctx.strokeStyle = INK
    traceRoad(ctx, path)
    ctx.stroke()
  }
  for (const path of paths) {
    ctx.lineWidth = ROAD_WIDTH
    ctx.strokeStyle = ROAD
    traceRoad(ctx, path)
    ctx.stroke()
  }

  // Two dash-cycles per loop. Offset of one full period matches phase 0.
  ctx.lineWidth = 3.5
  ctx.strokeStyle = DASH
  ctx.setLineDash([DASH_ON, DASH_GAP])
  ctx.lineDashOffset = -phase * DASH_PERIOD * 2
  for (const path of paths) {
    traceRoad(ctx, path)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.lineDashOffset = 0
}

function drawBushes(ctx: OffscreenCanvasRenderingContext2D) {
  // One outline each, so the shrubs read as painted blobs rather than clusters of rings.
  const bushes: Array<[number, number, number]> = [
    [112, 108, 15],
    [240, 100, 12],
    [58, 168, 11],
    [332, 112, 11],
    [96, 256, 10],
    [304, 252, 11],
    [164, 104, 8],
  ]
  ctx.fillStyle = BUSH
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  for (const [x, y, r] of bushes) {
    ctx.beginPath()
    ctx.moveTo(x, y - r)
    ctx.bezierCurveTo(x + r * 1.05, y - r * 0.85, x + r * 1.15, y + r * 0.15, x + r * 0.72, y + r * 0.55)
    ctx.bezierCurveTo(x + r * 0.35, y + r * 1.05, x - r * 0.45, y + r * 0.95, x - r * 0.82, y + r * 0.32)
    ctx.bezierCurveTo(x - r * 1.15, y - r * 0.25, x - r * 0.35, y - r * 1.1, x, y - r)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
}

function inkStroke(ctx: OffscreenCanvasRenderingContext2D) {
  ctx.strokeStyle = INK
  ctx.lineWidth = 4
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()
}

function drawCottage(ctx: OffscreenCanvasRenderingContext2D, phase: number) {
  const x = 108
  const y = 146
  const w = 92
  const h = 56

  // Roof, peak nudged left so the gable is not a perfect isosceles.
  ctx.fillStyle = ROOF
  ctx.beginPath()
  ctx.moveTo(x - 12, y + 6)
  ctx.lineTo(x + w * 0.42, y - 46)
  ctx.lineTo(x + w + 12, y + 6)
  ctx.closePath()
  ctx.fill()
  inkStroke(ctx)

  // Chimney on the left slope, before the wall so the wall overlaps its base.
  const chimX = x + 16
  const chimY = y - 34
  ctx.fillStyle = ROOF
  ctx.fillRect(chimX, chimY, 12, 30)
  ctx.strokeRect(chimX, chimY, 12, 30)
  ctx.fillStyle = '#9a221c'
  ctx.fillRect(chimX - 2, chimY - 4, 16, 6)
  ctx.strokeRect(chimX - 2, chimY - 4, 16, 6)

  ctx.fillStyle = WALL
  ctx.fillRect(x, y, w, h)
  ctx.strokeRect(x, y, w, h)

  // Arched door.
  archedOpening(ctx, x + 30, y + 16, 18, 40, OPENING)
  ctx.fillStyle = '#f2d34a'
  ctx.beginPath()
  ctx.arc(x + 44, y + 40, 1.6, 0, TAU)
  ctx.fill()

  // Arched window.
  archedOpening(ctx, x + 60, y + 18, 20, 24, OPENING)
  ctx.strokeStyle = '#d6ecff'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x + 70, y + 20)
  ctx.lineTo(x + 70, y + 40)
  ctx.moveTo(x + 62, y + 30)
  ctx.lineTo(x + 78, y + 30)
  ctx.stroke()

  drawSmoke(ctx, chimX + 6, chimY - 4, phase)
}

function archedOpening(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, fill: string,
) {
  const r = w / 2
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.moveTo(x, y + h)
  ctx.lineTo(x, y + r)
  ctx.arc(x + r, y + r, r, Math.PI, 0)
  ctx.lineTo(x + w, y + h)
  ctx.closePath()
  ctx.fill()
  inkStroke(ctx)
}

function drawSmoke(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, phase: number) {
  // Three puffs, one rise each per loop. Alpha is 0 at birth and at the wrap.
  for (let i = 0; i < 3; i++) {
    const life = (phase + i / 3) % 1
    const alpha = Math.sin(life * Math.PI) * 0.72
    const puffY = y - life * 46
    const puffX = x + Math.sin((life + i) * TAU) * 7
    const r = 4 + life * 7
    ctx.fillStyle = `rgba(236, 236, 226, ${alpha})`
    ctx.beginPath()
    ctx.arc(puffX, puffY, r, 0, TAU)
    ctx.fill()
  }
}

function drawFountain(ctx: OffscreenCanvasRenderingContext2D, phase: number) {
  const cx = 286
  const cy = 156

  ctx.fillStyle = ROOF
  ctx.beginPath()
  ctx.arc(cx, cy, 36, 0, TAU)
  ctx.fill()
  inkStroke(ctx)

  ctx.fillStyle = WATER
  ctx.beginPath()
  ctx.arc(cx, cy, 26, 0, TAU)
  ctx.fill()
  inkStroke(ctx)

  // Deeper center of the basin. Kept circular so it does not read as an eye.
  ctx.fillStyle = WATER_DEEP
  ctx.beginPath()
  ctx.arc(cx, cy + 1, 7, 0, TAU)
  ctx.fill()

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, 24, 0, TAU)
  ctx.clip()
  for (let i = 0; i < 3; i++) {
    const life = (phase * 2 + i / 3) % 1
    ctx.globalAlpha = (1 - life) * 0.85
    ctx.strokeStyle = '#f4fdff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, 4 + life * 18, 0, TAU)
    ctx.stroke()
  }
  ctx.restore()
  ctx.globalAlpha = 1

  // Three droplets. Each one rises and fades over half a loop, two passes total.
  for (let i = 0; i < 3; i++) {
    const life = (phase * 2 + i / 3) % 1
    const rise = Math.sin(life * Math.PI)
    ctx.fillStyle = `rgba(214, 244, 255, ${0.35 + rise * 0.65})`
    ctx.beginPath()
    ctx.arc(cx + (i - 1) * 6, cy - 6 - rise * 18, 2.2 + rise * 1.4, 0, TAU)
    ctx.fill()
  }
}

function cone(ctx: OffscreenCanvasRenderingContext2D, x: number, top: number, w: number, h: number) {
  ctx.fillStyle = ROOF
  ctx.beginPath()
  ctx.moveTo(x, top + h)
  ctx.lineTo(x + w * 0.5, top)
  ctx.lineTo(x + w, top + h)
  ctx.closePath()
  ctx.fill()
  inkStroke(ctx)
}

function drawGatehouse(ctx: OffscreenCanvasRenderingContext2D) {
  // Sits low so the circular mask crops the walls, matching a base edge.
  const left = 96
  const right = 232
  const wallTop = 292

  ctx.fillStyle = WALL
  ctx.fillRect(78, wallTop + 8, 214, 110)
  ctx.strokeRect(78, wallTop + 8, 214, 110)

  // Central gable, lower than the tower cones.
  ctx.fillStyle = ROOF
  ctx.beginPath()
  ctx.moveTo(132, wallTop + 28)
  ctx.lineTo(HALF, wallTop - 8)
  ctx.lineTo(236, wallTop + 28)
  ctx.closePath()
  ctx.fill()
  inkStroke(ctx)

  ctx.fillStyle = WALL
  ctx.fillRect(left, wallTop, 40, 90)
  ctx.strokeRect(left, wallTop, 40, 90)
  ctx.fillRect(right, wallTop, 40, 90)
  ctx.strokeRect(right, wallTop, 40, 90)

  cone(ctx, left - 6, wallTop - 48, 52, 52)
  cone(ctx, right - 6, wallTop - 48, 52, 52)

  archedOpening(ctx, left + 8, wallTop + 28, 22, 48, ROOF)
  archedOpening(ctx, right + 9, wallTop + 28, 22, 48, ROOF)
  archedOpening(ctx, HALF - 14, wallTop + 36, 28, 52, '#c4322c')
}

function drawButterfly(ctx: OffscreenCanvasRenderingContext2D, phase: number) {
  // One orbit and four wingbeats per loop, both integer, so the seam matches.
  // Kept in the grass between the cottage roof and the fountain.
  const t = phase * TAU
  const cx = 222 + Math.cos(t) * 16
  const cy = 112 + Math.sin(t) * 10
  const flap = 0.45 + 0.55 * Math.abs(Math.sin(phase * TAU * 2))
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(Math.cos(t) * 0.5)
  ctx.fillStyle = DASH
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(-6, 0, 7, 4.5 * flap, -0.5, 0, TAU)
  ctx.ellipse(6, 0, 7, 4.5 * flap, 0.5, 0, TAU)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = INK
  ctx.fillRect(-1.2, -5, 2.4, 10)
  ctx.restore()
}
