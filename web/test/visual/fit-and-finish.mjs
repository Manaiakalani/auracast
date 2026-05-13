/**
 * Fit-and-finish visual sweep across all modes, themes and breakpoints.
 *
 * Usage: AUDIT_URL=https://localhost:4173/ node test/visual/fit-and-finish.mjs
 */
import { chromium } from 'playwright'
import fs from 'fs'

const URL = process.env.AUDIT_URL || 'https://localhost:4173/'
const OUT = process.env.OUT || '/tmp/auracast-audit/fitfinish'
fs.mkdirSync(OUT, { recursive: true })

const MODES = ['pattern', 'text', 'image', 'images', 'video', 'qr']
const VIEWPORTS = [
  { name: 'desk', width: 1440, height: 900 },
  { name: 'tab',  width: 768,  height: 1024 },
  { name: 'mob',  width: 375,  height: 812 },
]
const THEMES = ['dark', 'light']

const b = await chromium.launch()

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    if (t === 'light') document.documentElement.dataset.theme = 'light'
    else delete document.documentElement.dataset.theme
    try { localStorage.setItem('auracast.colorScheme', t) } catch {}
  }, theme)
}

async function selectMode(page, mode) {
  // Try desktop rail first, then mobile nav bar
  const ok = await page.evaluate((m) => {
    const candidates = Array.from(document.querySelectorAll('button, [role="tab"], a'))
    const want = {
      pattern: /^pattern/i,
      text: /^text$/i,
      image: /^image$/i,
      images: /^(seq|sequence)/i,
      video: /^video$/i,
      qr: /^(qr|qr code)/i,
    }[m]
    for (const el of candidates) {
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim()
      if (want.test(label)) {
        el.click()
        return label
      }
    }
    return null
  }, mode)
  await page.waitForTimeout(450)
  return ok
}

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    const ctx = await b.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: vp.width, height: vp.height },
      colorScheme: theme,
      deviceScaleFactor: 1,
    })
    const page = await ctx.newPage()
    await page.goto(URL, { waitUntil: 'networkidle' })
    await setTheme(page, theme)
    await page.waitForTimeout(500)

    // Initial connect/hero
    await page.screenshot({ path: `${OUT}/${vp.name}-${theme}-00-connect.png`, fullPage: true })

    for (const m of MODES) {
      const lab = await selectMode(page, m)
      await page.waitForTimeout(550)
      await page.screenshot({ path: `${OUT}/${vp.name}-${theme}-${m}.png`, fullPage: true })

      // Inside QR, scroll to slider area
      if (m === 'qr') {
        const sliderRect = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input[type="range"]'))
          if (!inputs.length) return null
          inputs[0].scrollIntoView({ block: 'center' })
          return inputs[0].getBoundingClientRect().toJSON()
        })
        if (sliderRect) {
          await page.waitForTimeout(200)
          await page.screenshot({ path: `${OUT}/${vp.name}-${theme}-${m}-sliders.png`, fullPage: false })
        }
      }
    }

    await ctx.close()
  }
}

await b.close()
console.log(`done, screenshots in ${OUT}`)
