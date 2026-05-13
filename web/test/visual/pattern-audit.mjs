/**
 * Pattern + text generator content audit.
 *
 * Renders every pattern (12) and text effect (8) via the in-page
 * __AURACAST_PATTERNS__ / __AURACAST_TEXT__ debug hooks, captures sample
 * frames as 368x368 JPEGs and 3x nearest-neighbour upscaled PNGs for
 * visual review, and writes a manifest with size + perceptual fingerprint.
 *
 * Run modes:
 *   node test/visual/pattern-audit.mjs          → write samples + manifest
 *   node test/visual/pattern-audit.mjs --check  → compare against baseline,
 *     fail if any frame's size or fingerprint drifts beyond threshold
 *   node test/visual/pattern-audit.mjs --update → overwrite the baseline
 *
 * The baseline lives at test/visual/baseline/pattern-audit.json. Sample
 * images go to /tmp/auracast-audit/visuals/ (gitignored).
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = path.join(__dirname, 'baseline', 'pattern-audit.json')
const OUT = '/tmp/auracast-audit/visuals'
const URL = process.env.AUDIT_URL || 'https://localhost:5173/'

const mode = process.argv.includes('--check')
  ? 'check'
  : process.argv.includes('--update')
    ? 'update'
    : 'snap'

mkdirSync(OUT, { recursive: true })
mkdirSync(path.dirname(BASELINE_PATH), { recursive: true })

// Average-hash via a tiny 8x8 luminance grid; tolerant to JPEG noise but
// still flags structural changes. Returns 64-bit hex string.
function ahash64FromPixels(rgba8x8) {
  const lumas = new Array(64)
  let sum = 0
  for (let i = 0; i < 64; i++) {
    const r = rgba8x8[i * 4]
    const g = rgba8x8[i * 4 + 1]
    const b = rgba8x8[i * 4 + 2]
    lumas[i] = 0.299 * r + 0.587 * g + 0.114 * b
    sum += lumas[i]
  }
  const avg = sum / 64
  let bits = 0n
  for (let i = 0; i < 64; i++) if (lumas[i] >= avg) bits |= (1n << BigInt(i))
  return bits.toString(16).padStart(16, '0')
}

function hammingHex(a, b) {
  let n = BigInt('0x' + a) ^ BigInt('0x' + b)
  let d = 0
  while (n) { d += Number(n & 1n); n >>= 1n }
  return d
}

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.click('button[aria-label="Patterns"]'); await page.waitForTimeout(500)
await page.click('button[aria-label="Text"]'); await page.waitForTimeout(800)

async function jpegToHashAndUpscale(jpegBytes, label, writeImages) {
  if (writeImages) writeFileSync(`${OUT}/${label}.jpg`, Buffer.from(jpegBytes))
  // Decode in-page (createImageBitmap is browser-only), downsample to 8x8
  // for the perceptual hash, and optionally produce a 3x upscale PNG.
  const result = await page.evaluate(async ({ bytes, scale, wantPng }) => {
    const u = new Uint8Array(bytes)
    const blob = new Blob([u], { type: 'image/jpeg' })
    const bm = await createImageBitmap(blob)
    // Hash sample
    const hc = new OffscreenCanvas(8, 8)
    const hctx = hc.getContext('2d')
    hctx.imageSmoothingEnabled = true
    hctx.drawImage(bm, 0, 0, 8, 8)
    const hashPx = Array.from(hctx.getImageData(0, 0, 8, 8).data)
    let pngBytes = null
    if (wantPng) {
      const c = new OffscreenCanvas(368 * scale, 368 * scale)
      const cctx = c.getContext('2d')
      cctx.imageSmoothingEnabled = false
      cctx.drawImage(bm, 0, 0, 368 * scale, 368 * scale)
      const b = await c.convertToBlob({ type: 'image/png' })
      pngBytes = Array.from(new Uint8Array(await b.arrayBuffer()))
    }
    return { hashPx, pngBytes }
  }, { bytes: Array.from(jpegBytes), scale: 3, wantPng: writeImages })
  if (writeImages && result.pngBytes) {
    writeFileSync(`${OUT}/${label}.png`, Buffer.from(result.pngBytes))
  }
  return ahash64FromPixels(result.hashPx)
}

const manifest = { generatedAt: new Date().toISOString(), patterns: {}, text: {} }
const writeImages = mode !== 'check'

// Patterns
const patternIds = await page.evaluate(() => window.__AURACAST_PATTERNS__.map((p) => p.id))
// Skip seam test for these:
// - Ping-pong patterns loop by mirroring; their phase=0 ≠ phase=1 by design.
// - Stochastic patterns (matrix, game-of-life, braille) use randomised column
//   speeds or cellular automata that don't guarantee mathematical periodicity.
const SEAM_SKIP = new Set(['spirals', 'campus-9', 'matrix', 'gameoflife', 'braille'])
const SEAM_TOLERANCE = 10  // max Hamming bits between adjacent frames at loop point

for (const id of patternIds) {
  const jpegs = await page.evaluate(async (pid) => {
    const def = window.__AURACAST_PATTERNS__.find((p) => p.id === pid)
    const out = await def.generate({ frames: 12, fps: 12 })
    return out.map((u) => Array.from(u))
  }, id)
  const sampleIdxs = [0, 4, 8]
  const samples = []
  for (const i of sampleIdxs) {
    const hash = await jpegToHashAndUpscale(jpegs[i], `pattern-${id}-f${i}`, writeImages)
    samples.push({ frame: i, bytes: jpegs[i].length, ahash: hash })
  }
  manifest.patterns[id] = { samples, totalBytes: jpegs.reduce((a, j) => a + j.length, 0) }

  // Loop-seam check: compare the last frame to the first frame of a sequence.
  // For a seamless loop, frame N-1 should visually flow into frame 0.
  // Use a higher frame count (60) so adjacent frames are closer in phase
  // (Δphase = 1/60 ≈ 0.017 vs 1/12 ≈ 0.083).
  if (!SEAM_SKIP.has(id)) {
    const [firstHash, lastHash] = await page.evaluate(async (pid) => {
      const def = window.__AURACAST_PATTERNS__.find((p) => p.id === pid)
      const out = await def.generate({ frames: 60, fps: 12 })
      return [Array.from(out[0]), Array.from(out[out.length - 1])]
    }, id)
    const h0 = await jpegToHashAndUpscale(firstHash, `pattern-${id}-seam0`, false)
    const hN = await jpegToHashAndUpscale(lastHash, `pattern-${id}-seamN`, false)
    const seamDist = hammingHex(h0, hN)
    manifest.patterns[id].seamDist = seamDist
    if (seamDist > SEAM_TOLERANCE) {
      console.log(`⚠ pattern ${id}: loop seam Δ=${seamDist} bits (>${SEAM_TOLERANCE})`)
    }
  }

  console.log(`✓ pattern ${id}`)
}

// Text effects
const textEffects = ['static', 'marquee', 'rainbow', 'blink', 'bounce', 'typewriter', 'glow', 'wave']
for (const eff of textEffects) {
  const jpegs = await page.evaluate(async (e) => {
    const T = window.__AURACAST_TEXT__
    const out = await T.generateTextFrames({
      text: 'AURA', effect: e, fps: 18, frames: e === 'static' ? 1 : 18,
      fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 700,
      color: '#ffffff', background: '#000000',
    })
    return out.map((u) => Array.from(u))
  }, eff)
  const sampleIdxs = jpegs.length === 1 ? [0] : [0, Math.floor(jpegs.length / 2), jpegs.length - 1]
  const samples = []
  for (const i of sampleIdxs) {
    const hash = await jpegToHashAndUpscale(jpegs[i], `text-${eff}-f${i}`, writeImages)
    samples.push({ frame: i, bytes: jpegs[i].length, ahash: hash })
  }
  manifest.text[eff] = { samples, totalBytes: jpegs.reduce((a, j) => a + j.length, 0) }
  console.log(`✓ text ${eff}`)
}

await browser.close()

const manifestPath = `${OUT}/audit.json`
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
console.log(`\nmanifest: ${manifestPath}`)

if (mode === 'update') {
  writeFileSync(BASELINE_PATH, JSON.stringify(manifest, null, 2))
  console.log(`baseline updated: ${BASELINE_PATH}`)
  process.exit(0)
}

if (mode === 'check') {
  if (!existsSync(BASELINE_PATH)) {
    console.error(`\n✗ no baseline found at ${BASELINE_PATH}`)
    console.error(`  run with --update to create one`)
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const failures = []
  // Tunables: total bytes can drift up to ±25% (JPEG encoder is platform-
  // dependent), per-frame ahash up to 8 bits of Hamming distance (out of 64).
  const BYTE_TOLERANCE = 0.25
  const HASH_TOLERANCE = 8
  for (const kind of ['patterns', 'text']) {
    for (const [id, snap] of Object.entries(manifest[kind])) {
      const ref = baseline[kind]?.[id]
      if (!ref) { failures.push(`${kind}/${id}: missing in baseline`); continue }
      const drift = Math.abs(snap.totalBytes - ref.totalBytes) / ref.totalBytes
      if (drift > BYTE_TOLERANCE) {
        failures.push(`${kind}/${id}: total bytes drifted ${(drift * 100).toFixed(1)}% (${ref.totalBytes} → ${snap.totalBytes})`)
      }
      for (const s of snap.samples) {
        const r = ref.samples.find((x) => x.frame === s.frame)
        if (!r) { failures.push(`${kind}/${id} f${s.frame}: missing in baseline`); continue }
        const d = hammingHex(s.ahash, r.ahash)
        if (d > HASH_TOLERANCE) {
          failures.push(`${kind}/${id} f${s.frame}: ahash drift Δ=${d} bits (${r.ahash} → ${s.ahash})`)
        }
      }
    }
  }
  if (failures.length) {
    console.error(`\n✗ ${failures.length} regression(s):\n  - ${failures.join('\n  - ')}`)
    console.error(`\nIf the change is intentional, re-run with --update`)
    process.exit(1)
  }

  // Check loop-seam distances for non-skipped patterns.
  const seamWarnings = []
  for (const [id, snap] of Object.entries(manifest.patterns)) {
    if (SEAM_SKIP.has(id)) continue
    if (snap.seamDist != null && snap.seamDist > SEAM_TOLERANCE) {
      seamWarnings.push(`${id}: seam Δ=${snap.seamDist} bits`)
    }
  }
  if (seamWarnings.length) {
    console.warn(`\n⚠ ${seamWarnings.length} loop-seam warning(s):\n  - ${seamWarnings.join('\n  - ')}`)
  }

  console.log(`\n✓ all generators within tolerance vs baseline`)
}
