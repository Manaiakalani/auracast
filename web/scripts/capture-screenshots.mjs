/**
 * Refresh docs/screenshots from the running app.
 *
 *   AUDIT_URL=https://127.0.0.1:5173/ node scripts/capture-screenshots.mjs
 *
 * Sizes match the files already in the README:
 *   hero / patterns / text-mode  1280x900
 *   desktop-*                    1440x900 at 2x
 *   mobile.png                   390x844 at 3x
 *   mobile-*                     414x896 at 2x
 */
import { chromium } from 'playwright'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const URL = process.env.AUDIT_URL || 'https://127.0.0.1:5173/'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'screenshots')

const MODES = {
  pattern: ['Patterns', 'Pattern'],
  text: ['Text'],
  image: ['Image'],
  images: ['Sequence', 'Seq'],
  video: ['Video'],
  qr: ['QR code', 'QR'],
}

async function clickVisible(page, name) {
  const buttons = page.getByRole('button', { name, exact: true })
  const count = await buttons.count()
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i)
    if (await button.isVisible()) {
      await button.click()
      return
    }
  }
  throw new Error(`No visible button named ${name}`)
}

async function clickMode(page, key) {
  let lastError = null
  for (const name of MODES[key]) {
    try {
      await clickVisible(page, name)
      await page.waitForTimeout(400)
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: false })
  console.log(`  ${name}`)
}

async function openHelp(page) {
  const opened = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button[aria-label="Help and troubleshooting"]')]
    const visible = buttons.find((button) => {
      const style = getComputedStyle(button)
      if (style.display === 'none' || style.visibility === 'hidden') return false
      const rect = button.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth
    })
    if (!(visible instanceof HTMLElement)) return false
    visible.click()
    return true
  })
  if (!opened) throw new Error('No visible help button')
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
  await page.waitForTimeout(400)
}

function placeLogScript() {
  const details = document.querySelector('.activity-log-card')
  if (!(details instanceof HTMLDetailsElement)) return { ok: false, reason: 'missing' }
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  details.open = true
  const list = details.querySelector('ul')
  if (!list) return { ok: false, reason: 'structure' }
  let scroller = details.parentElement
  while (scroller && scroller !== document.body) {
    const style = getComputedStyle(scroller)
    const scrolls = (style.overflowY === 'auto' || style.overflowY === 'scroll') && scroller.scrollHeight > scroller.clientHeight + 2
    if (scrolls) break
    scroller = scroller.parentElement
  }
  if (!scroller || scroller === document.body) scroller = document.scrollingElement
  scroller.style.overflowAnchor = 'none'
  let obstruction = 0
  for (const el of document.querySelectorAll('div')) {
    const style = getComputedStyle(el)
    if (style.position !== 'fixed' || style.display === 'none') continue
    const rect = el.getBoundingClientRect()
    if (rect.height < 24 || rect.top < innerHeight * 0.55) continue
    obstruction = Math.max(obstruction, innerHeight - rect.top)
  }
  const bandTop = 72
  const bandBottom = innerHeight - obstruction - 24
  const card = details.getBoundingClientRect()
  const bandMid = (bandTop + bandBottom) / 2
  const cardMid = (card.top + card.bottom) / 2
  scroller.scrollTop += cardMid - bandMid
  let after = details.getBoundingClientRect()
  if (after.top < bandTop) scroller.scrollTop += after.top - bandTop
  after = details.getBoundingClientRect()
  if (after.bottom > bandBottom) scroller.scrollTop += after.bottom - bandBottom
  after = details.getBoundingClientRect()
  const afterList = list.getBoundingClientRect()
  return {
    ok: after.height > 40 && after.top >= bandTop - 2 && after.bottom <= bandBottom + 2 && afterList.bottom <= bandBottom + 2,
    top: Math.round(after.top),
    bottom: Math.round(after.bottom),
    cardHeight: Math.round(after.height),
    listTop: Math.round(afterList.top),
    bandBottom: Math.round(bandBottom),
    scrollTop: Math.round(scroller.scrollTop),
    scrollHeight: scroller.scrollHeight,
    clientHeight: scroller.clientHeight,
    text: (list.innerText || '').replace(/\s+/g, ' ').slice(0, 180),
  }
}

async function revealActivityLog(page) {
  await page.waitForFunction(() => {
    const card = document.querySelector('.activity-log-card')
    if (!card || getComputedStyle(card).display === 'none') return false
    const text = card.querySelector('ul')?.textContent || ''
    return /Preview ready|Still ready|Image preview ready/.test(text)
  }, { timeout: 60000 })

  await page.evaluate(placeLogScript)
  await page.waitForTimeout(400)
  const placed = await page.evaluate(placeLogScript)
  console.log(`  log ${JSON.stringify(placed)}`)
  if (!placed.ok) throw new Error('Activity log is not fully in the viewport')
}

async function selectMatrix(page) {
  await page.evaluate(() => {
    const card = document.querySelector('[data-pattern-card="matrix"]')
    if (!(card instanceof HTMLElement)) throw new Error('no matrix card')
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function waitForThumbs(page, cardId) {
  await page.waitForFunction((id) => {
    const card = document.querySelector(`[data-pattern-card="${id}"] canvas`)
    return !!card && getComputedStyle(card).opacity !== '0'
  }, cardId, { timeout: 180000 })
  await page.waitForTimeout(450)
}

async function waitForPreview(page, selector) {
  await page.waitForSelector(selector, { timeout: 20000 })
  await page.waitForTimeout(500)
}

async function openFresh(browser, width, height, scale, scheme) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    ignoreHTTPSErrors: true,
    colorScheme: scheme,
  })
  const page = await context.newPage()
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  return { context, page }
}

const ONLY = process.env.ONLY || ''
const browser = await chromium.launch()

if (ONLY === 'logs') {
  {
    const { context, page } = await openFresh(browser, 1440, 900, 2, 'dark')
    await selectMatrix(page)
    await revealActivityLog(page)
    await shot(page, 'desktop-activity-log.png')
    await context.close()
  }
  {
    const { context, page } = await openFresh(browser, 414, 896, 2, 'dark')
    await selectMatrix(page)
    await revealActivityLog(page)
    await shot(page, 'mobile-activity-log.png')
    await openHelp(page)
    await shot(page, 'mobile-help-modal.png')
    await context.close()
  }
  await browser.close()
  console.log(`Done. Screenshots in ${OUT}`)
  process.exit(0)
}

// README hero and the older 1x pattern/text names.
{
  const { context, page } = await openFresh(browser, 1280, 900, 1, 'dark')
  await waitForThumbs(page, 'painted-base')
  await shot(page, 'hero-dark.png')
  await shot(page, 'patterns.png')
  await clickMode(page, 'text')
  await waitForPreview(page, '.auracast-preview-hero canvas, .auracast-preview-hero img')
  await shot(page, 'text-mode.png')
  await context.close()
}

{
  const { context, page } = await openFresh(browser, 1280, 900, 1, 'light')
  await waitForThumbs(page, 'painted-base')
  await shot(page, 'hero-light.png')
  await context.close()
}

// Desktop README set. 1440x900 at 2x is 2880x1800.
{
  const { context, page } = await openFresh(browser, 1440, 900, 2, 'dark')
  await waitForThumbs(page, 'painted-base')
  await shot(page, 'desktop-pattern.png')

  await clickMode(page, 'text')
  await waitForPreview(page, '.auracast-preview-hero canvas, .auracast-preview-hero img')
  await shot(page, 'desktop-text.png')

  await clickMode(page, 'image')
  await shot(page, 'desktop-image.png')

  await clickMode(page, 'images')
  await shot(page, 'desktop-images.png')

  await clickMode(page, 'video')
  await shot(page, 'desktop-video.png')

  await clickMode(page, 'qr')
  await waitForPreview(page, 'img[alt="QR code"]')
  await shot(page, 'desktop-qr.png')

  await clickMode(page, 'pattern')
  await selectMatrix(page)
  await revealActivityLog(page)
  await shot(page, 'desktop-activity-log.png')

  await openHelp(page)
  await shot(page, 'desktop-help-modal.png')
  await context.close()
}

// Phone hero used in the README. 390x844 at 3x is 1170x2532.
{
  const { context, page } = await openFresh(browser, 390, 844, 3, 'dark')
  await waitForThumbs(page, 'matrix')
  await shot(page, 'mobile.png')
  await context.close()
}

// The rest of the phone set. 414x896 at 2x is 828x1792.
{
  const { context, page } = await openFresh(browser, 414, 896, 2, 'dark')
  await waitForThumbs(page, 'matrix')
  await shot(page, 'mobile-pattern.png')

  await clickMode(page, 'text')
  await waitForPreview(page, '.auracast-preview-hero canvas, .auracast-preview-hero img')
  await shot(page, 'mobile-text.png')

  await clickMode(page, 'image')
  await shot(page, 'mobile-image.png')

  await clickMode(page, 'images')
  await shot(page, 'mobile-images.png')

  await clickMode(page, 'video')
  await shot(page, 'mobile-video.png')

  await clickMode(page, 'qr')
  await waitForPreview(page, 'img[alt="QR code"]')
  await shot(page, 'mobile-qr.png')

  await clickMode(page, 'pattern')
  await selectMatrix(page)
  await revealActivityLog(page)
  await shot(page, 'mobile-activity-log.png')

  await openHelp(page)
  await shot(page, 'mobile-help-modal.png')
  await context.close()
}

await browser.close()
console.log(`Done. Screenshots in ${OUT}`)
