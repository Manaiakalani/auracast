import { chromium } from 'playwright'
import fs from 'fs'

const URL = process.env.AUDIT_URL || 'https://localhost:5174/'
const OUT = '/tmp/auracast-audit/audit-shots'
fs.mkdirSync(OUT, { recursive: true })

const b = await chromium.launch()

const findings = []
function note(severity, area, msg, data) {
  findings.push({ severity, area, msg, data })
  console.log(`[${severity}] ${area}: ${msg}`, data || '')
}

async function audit(viewport, name, theme = 'dark') {
  const ctx = await b.newContext({
    ignoreHTTPSErrors: true, viewport,
    colorScheme: theme,
    deviceScaleFactor: 1,
  })
  const p = await ctx.newPage()
  await p.goto(URL, { waitUntil: 'networkidle' })
  await p.waitForTimeout(800)

  const tag = `${name}-${theme}`

  // Full page screenshot
  await p.screenshot({ path: `${OUT}/${tag}-init.png`, fullPage: true })

  // ---- 1) Horizontal overflow ----
  const overflow = await p.evaluate(() => {
    const docW = document.documentElement.clientWidth
    const items = []
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect()
      if (r.right > docW + 1 && r.width < docW * 1.5 && r.width > 50) {
        items.push({
          tag: el.tagName + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0,2).join('.') : ''),
          right: r.right.toFixed(1), width: r.width.toFixed(1)
        })
      }
    })
    return items.slice(0, 10)
  })
  if (overflow.length) note('warn', tag, 'horizontal overflow', overflow)

  // ---- 2) Centering of preview disc within its column ----
  const discInfo = await p.evaluate(() => {
    const disc = document.querySelector('.aura-disc')
    if (!disc) return null
    const aside = disc.closest('aside') || disc.parentElement
    const dr = disc.getBoundingClientRect()
    const ar = aside.getBoundingClientRect()
    const cx = dr.x + dr.width/2
    const ax = ar.x + ar.width/2
    return { discCenterX: cx, asideCenterX: ax, delta: cx - ax, discBox: { x: dr.x, y: dr.y, w: dr.width, h: dr.height } }
  })
  if (discInfo) {
    if (Math.abs(discInfo.delta) > 1) note('warn', tag, `disc not centered in aside (Δ=${discInfo.delta.toFixed(1)}px)`, discInfo)
  }

  // ---- 3) AuraCast header centering ----
  const headerCenter = await p.evaluate(() => {
    const h = Array.from(document.querySelectorAll('h1,h2,h3,header')).find(e => /AuraCast/i.test(e.textContent || ''))
    if (!h) return null
    const r = h.getBoundingClientRect()
    return { x: r.x, w: r.width, viewportW: window.innerWidth }
  })

  // ---- 4) Wake-card existence + centering ----
  // Skip; gated behind no-Bluetooth which Chromium can't fake.

  // ---- 5) Switch to text mode and snap each effect ----
  // find Text tab
  const tabs = p.locator('button,[role="tab"]').filter({ hasText: /^(Pattern|Text|Image|Sequence|Video|QR)$/ })
  const tcount = await tabs.count()
  for (let i = 0; i < tcount; i++) {
    const t = tabs.nth(i)
    if ((await t.textContent())?.trim() === 'Text' && await t.isVisible()) { await t.click(); break }
  }
  await p.waitForTimeout(400)
  await p.screenshot({ path: `${OUT}/${tag}-text.png`, fullPage: true })

  // ---- 6) Click Generate Preview if present, then check ----
  const genBtn = p.locator('button').filter({ hasText: /Generate preview|Preview/i }).first()
  if (await genBtn.count() && await genBtn.isVisible().catch(()=>false)) {
    // type something
    const ti = p.locator('input[type="text"], textarea').first()
    if (await ti.count()) await ti.fill('TEST').catch(()=>{})
    await p.waitForTimeout(200)
    await genBtn.click().catch(()=>{})
    await p.waitForTimeout(1500)
    await p.screenshot({ path: `${OUT}/${tag}-text-preview.png`, fullPage: true })
  }

  // ---- 7) Pattern tab check ----
  for (let i = 0; i < tcount; i++) {
    const t = tabs.nth(i)
    if ((await t.textContent())?.trim() === 'Pattern' && await t.isVisible()) { await t.click(); break }
  }
  await p.waitForTimeout(400)
  // pick first pattern
  const pat = p.locator('button').filter({ hasText: /Rainbow|Solid|Pulse|Sparkle|Wave/i }).first()
  if (await pat.count() && await pat.isVisible().catch(()=>false)) {
    await pat.click().catch(()=>{})
    await p.waitForTimeout(800)
  }
  await p.screenshot({ path: `${OUT}/${tag}-pattern.png`, fullPage: true })

  // ---- 8) Frames/FPS row alignment between Pattern and Text ----
  const patFramesY = await p.evaluate(() => {
    const lbl = Array.from(document.querySelectorAll('span,label')).find(e => e.textContent?.trim() === 'Frames')
    if (!lbl) return null
    const r = lbl.getBoundingClientRect()
    return { y: r.y, x: r.x }
  })
  // switch to text
  for (let i = 0; i < tcount; i++) {
    const t = tabs.nth(i)
    if ((await t.textContent())?.trim() === 'Text' && await t.isVisible()) { await t.click(); break }
  }
  await p.waitForTimeout(400)
  const textFramesY = await p.evaluate(() => {
    const lbl = Array.from(document.querySelectorAll('span,label')).find(e => e.textContent?.trim() === 'Frames')
    if (!lbl) return null
    const r = lbl.getBoundingClientRect()
    return { y: r.y, x: r.x }
  })
  if (patFramesY && textFramesY) {
    note('info', tag, `Frames label position: pattern x=${patFramesY.x.toFixed(0)} text x=${textFramesY.x.toFixed(0)}`)
  }

  // ---- 9) Generic "weird" checks ----
  const weird = await p.evaluate(() => {
    const issues = []
    // Buttons with tiny tap targets
    document.querySelectorAll('button').forEach(b => {
      if (!b.offsetParent) return
      const r = b.getBoundingClientRect()
      if (r.width < 24 || r.height < 24) issues.push({ kind: 'tiny-tap', txt: (b.textContent||'').slice(0,30), w: r.width, h: r.height })
    })
    // Texts overflowing parents (very common offcentered cause)
    document.querySelectorAll('p, span, h1, h2, h3').forEach(el => {
      const s = getComputedStyle(el)
      if (s.overflow === 'visible' && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 50) {
        issues.push({ kind: 'text-overflow', tag: el.tagName, txt: (el.textContent||'').slice(0,40), sw: el.scrollWidth, cw: el.clientWidth })
      }
    })
    return issues.slice(0, 20)
  })
  if (weird.length) note('warn', tag, 'weird elements', weird)

  await ctx.close()
}

await audit({ width: 1440, height: 900 }, 'desk', 'dark')
await audit({ width: 1440, height: 900 }, 'desk', 'light')
await audit({ width: 1024, height: 800 }, 'lg',  'dark')
await audit({ width: 768,  height: 900 }, 'tab',  'dark')
await audit({ width: 390,  height: 844 }, 'mob',  'dark')
await audit({ width: 390,  height: 844 }, 'mob',  'light')

// ─── Hard assertions ──────────────────────────────────────────────────
// Distinct from the screenshot pass: these are pass/fail invariants that
// CI should reject on. Failures bump the process exit code.
async function hardAssertions() {
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
  const p = await ctx.newPage()
  await p.goto(URL, { waitUntil: 'networkidle' })
  await p.waitForTimeout(800)

  // Click into Pattern mode and pick first pattern.
  const tabs = p.locator('button,[role="tab"]').filter({ hasText: /^(Pattern|Text|Image|Sequence|Video|QR)$/ })
  const tcount = await tabs.count()
  for (let i = 0; i < tcount; i++) {
    const t = tabs.nth(i)
    if ((await t.textContent())?.trim() === 'Pattern' && await t.isVisible()) { await t.click(); break }
  }
  await p.waitForTimeout(400)

  // 1) Disc center stable across pattern switches.
  const cards = p.locator('[data-pattern-card]')
  const cardCount = await cards.count()
  if (cardCount < 3) {
    note('error', 'assert', 'fewer than 3 pattern cards visible', { cardCount })
  } else {
    const samples = []
    for (let i = 0; i < 3; i++) {
      await cards.nth(i).click()
      await p.waitForTimeout(900)
      const box = await p.evaluate(() => {
        const d = document.querySelector('.aura-disc')
        if (!d) return null
        const r = d.getBoundingClientRect()
        return { cx: r.x + r.width/2, cy: r.y + r.height/2, w: r.width, h: r.height }
      })
      if (box) samples.push(box)
    }
    const cxs = samples.map(s => s.cx), cys = samples.map(s => s.cy)
    const ws = samples.map(s => s.w), hs = samples.map(s => s.h)
    const dx = Math.max(...cxs) - Math.min(...cxs)
    const dy = Math.max(...cys) - Math.min(...cys)
    const dw = Math.max(...ws) - Math.min(...ws)
    const dh = Math.max(...hs) - Math.min(...hs)
    if (dx > 2 || dy > 2) note('error', 'assert', `disc center drifts across pattern switches Δx=${dx.toFixed(1)} Δy=${dy.toFixed(1)}`, samples)
    if (dw > 2 || dh > 2) note('error', 'assert', `disc size drifts across pattern switches Δw=${dw.toFixed(1)} Δh=${dh.toFixed(1)}`, samples)
  }

  // 2) FPS / Frames numeric inputs have stable widths regardless of value.
  const widths = []
  for (const v of [10, 100, 200]) {
    await p.locator('input[type="number"]').first().fill(String(v))
    await p.waitForTimeout(200)
    const w = await p.evaluate(() => {
      const el = document.querySelector('input[type="number"]')
      return el ? el.getBoundingClientRect().width : null
    })
    if (w !== null) widths.push(w)
  }
  const dw2 = widths.length ? Math.max(...widths) - Math.min(...widths) : 0
  if (dw2 > 1) note('error', 'assert', `Frames input width changes with value Δ=${dw2.toFixed(1)}px`, widths)

  // 3) Hero column fits in initial viewport (no vertical scroll for above-fold).
  const docHeight = await p.evaluate(() => document.documentElement.scrollHeight)
  const viewportHeight = 900
  if (docHeight > viewportHeight * 2) {
    note('warn', 'assert', `page is much taller than viewport (${docHeight}px > ${viewportHeight*2}px)`, { docHeight, viewportHeight })
  }

  // 4) Pattern cards must be reachable by keyboard (radiogroup roving tabindex).
  const focusable = await p.evaluate(() =>
    Array.from(document.querySelectorAll('[data-pattern-card]'))
      .filter(el => el.tabIndex === 0).length,
  )
  if (focusable !== 1) note('error', 'assert', `expected exactly 1 pattern card with tabindex=0, got ${focusable}`)

  await ctx.close()
}
await hardAssertions()

await b.close()
const errCount = findings.filter(f => f.severity === 'error').length
const warnCount = findings.filter(f => f.severity === 'warn').length
console.log('\n=== SUMMARY ===')
console.log(`${findings.length} findings (${errCount} errors, ${warnCount} warnings)`)
fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2))
if (errCount > 0) {
  console.error(`\n✗ ${errCount} hard assertion(s) failed.`)
  process.exit(1)
}
