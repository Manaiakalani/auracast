#!/usr/bin/env node
// Capture frames from arcradar.online via Playwright and compare them
// against our generated pattern frames at /tmp/auracast-audit/visuals/
// Outputs a side-by-side strip to /tmp/arc-compare.png
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const OUT = '/tmp/arc-compare'
mkdirSync(OUT, { recursive: true })

const FRAME_COUNT = 8
const FRAME_INTERVAL_MS = 900
const SIZE = 368

console.log('launching chromium')
const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--enable-webgl',
    '--disable-blink-features=AutomationControlled',
  ],
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1280 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
console.log('navigating to arcradar.online')
await page.goto('https://arcradar.online', { waitUntil: 'networkidle', timeout: 30000 })
// Full page screenshot for debugging.
await page.screenshot({ path: `${OUT}/_full-debug.png`, fullPage: false })
const dbg = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  return c ? { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight, ctxLost: !c.getContext('webgl2') && !c.getContext('webgl') } : null
})
console.log('canvas debug:', dbg)
// Let WebGL settle and contacts populate
await page.waitForTimeout(8000)

const canvas = await page.$('canvas')
if (!canvas) throw new Error('no canvas found on arcradar.online')
const box = await canvas.boundingBox()
console.log('canvas box:', box)

// Crop to the center disc area: smaller of width/height, centered.
const side = Math.min(box.width, box.height) * 0.92
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2
const clip = {
  x: Math.max(0, cx - side / 2),
  y: Math.max(0, cy - side / 2),
  width: side,
  height: side,
}

console.log(`capturing ${FRAME_COUNT} frames every ${FRAME_INTERVAL_MS}ms`)
const refFrames = []
for (let i = 0; i < FRAME_COUNT; i++) {
  const buf = await page.screenshot({ clip, type: 'png' })
  const path = `${OUT}/ref-${i}.png`
  writeFileSync(path, buf)
  refFrames.push(path)
  await page.waitForTimeout(FRAME_INTERVAL_MS)
}
await browser.close()

// Resize ref frames to 368 and put alongside our pattern frames.
// Our audit only emits f0, f4, f8 — cycle through what's available.
const availOur = [0, 4, 8].filter((n) => existsSync(`/tmp/auracast-audit/visuals/pattern-arc-radar-hd-f${n}.jpg`))
if (availOur.length === 0) throw new Error('no our-pattern frames found')
console.log('our frames available:', availOur)

// Use sips (macOS) to resize ref frames to SIZE x SIZE.
for (const f of refFrames) {
  execSync(`sips -z ${SIZE} ${SIZE} "${f}" --out "${f}" >/dev/null`)
}

// Build comparison grid via temp python file (avoids shell escaping pain).
const pyPath = `${OUT}/_compare.py`
writeFileSync(pyPath, `
from PIL import Image, ImageDraw, ImageFont
size = ${SIZE}
cols = ${FRAME_COUNT}
gap = 8
W = cols*size + (cols+1)*gap
H = 2*size + 3*gap + 30
img = Image.new('RGB', (W, H), (16, 16, 18))
d = ImageDraw.Draw(img)
try:
    f = ImageFont.truetype('/System/Library/Fonts/SFNSMono.ttf', 14)
except Exception:
    f = ImageFont.load_default()
d.text((gap, 4), 'TOP: arcradar.online   BOTTOM: AuraCast Arc Radar HD', fill=(220,220,220), font=f)
avail = [${availOur.join(', ')}]
for i in range(cols):
    ref = Image.open(f'${OUT}/ref-{i}.png').convert('RGB')
    fn = avail[i % len(avail)]
    our = Image.open(f'/tmp/auracast-audit/visuals/pattern-arc-radar-hd-f{fn}.jpg').convert('RGB')
    x = gap + i*(size+gap)
    img.paste(ref, (x, 30+gap))
    img.paste(our, (x, 30+gap*2+size))
img.save('/tmp/arc-compare.png')
print('wrote /tmp/arc-compare.png  size=', img.size)
`)
execSync(`python3 ${pyPath}`, { stdio: 'inherit' })
console.log('done')
