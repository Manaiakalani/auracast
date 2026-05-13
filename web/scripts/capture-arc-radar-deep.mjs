#!/usr/bin/env node
// Capture a long sequence of cropped arcradar.online frames so we can
// inspect the actual aesthetic and motion in detail. Writes individual
// PNG frames + a contact-sheet grid for quick visual review.
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'

const OUT = '/tmp/arc-deep'
mkdirSync(OUT, { recursive: true })
// clear old
for (const f of readdirSync(OUT)) execSync(`rm -f "${OUT}/${f}"`)

const FRAME_COUNT = 24
const FRAME_INTERVAL_MS = 1500   // 36s of motion total
const SIZE = 256

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
await page.goto('https://arcradar.online', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(8000)

const canvas = await page.$('canvas')
const box = await canvas.boundingBox()
const side = Math.min(box.width, box.height) * 0.92
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2
const clip = {
  x: Math.max(0, cx - side / 2),
  y: Math.max(0, cy - side / 2),
  width: side,
  height: side,
}

console.log(`recording ${FRAME_COUNT} frames every ${FRAME_INTERVAL_MS}ms (${FRAME_COUNT * FRAME_INTERVAL_MS / 1000}s)`)
const frames = []
for (let i = 0; i < FRAME_COUNT; i++) {
  const buf = await page.screenshot({ clip, type: 'png' })
  const path = `${OUT}/f${String(i).padStart(2, '0')}.png`
  writeFileSync(path, buf)
  frames.push(path)
  await page.waitForTimeout(FRAME_INTERVAL_MS)
}
await browser.close()

for (const f of frames) execSync(`sips -z ${SIZE} ${SIZE} "${f}" --out "${f}" >/dev/null`)

// 6x4 grid contact sheet
const pyPath = `${OUT}/sheet.py`
writeFileSync(pyPath, `
from PIL import Image, ImageDraw, ImageFont
import os
files = sorted([f for f in os.listdir('${OUT}') if f.startswith('f') and f.endswith('.png')])
size = ${SIZE}
cols = 6
rows = (len(files) + cols - 1) // cols
gap = 6
W = cols*size + (cols+1)*gap
H = rows*size + (rows+1)*gap + 28
img = Image.new('RGB', (W, H), (12,12,14))
d = ImageDraw.Draw(img)
try:
    f = ImageFont.truetype('/System/Library/Fonts/SFNSMono.ttf', 13)
except Exception:
    f = ImageFont.load_default()
d.text((gap, 6), f'arcradar.online -- {len(files)} frames @ ${FRAME_INTERVAL_MS}ms', fill=(220,220,220), font=f)
for i, fn in enumerate(files):
    r, c = i // cols, i % cols
    im = Image.open(f'${OUT}/{fn}').convert('RGB')
    x = gap + c*(size+gap)
    y = 28 + gap + r*(size+gap)
    img.paste(im, (x, y))
    d.text((x+4, y+4), fn[:-4], fill=(180,180,180), font=f)
img.save('/tmp/arc-deep-sheet.png')
print('wrote /tmp/arc-deep-sheet.png  size=', img.size)
`)
execSync(`python3 ${pyPath}`, { stdio: 'inherit' })
