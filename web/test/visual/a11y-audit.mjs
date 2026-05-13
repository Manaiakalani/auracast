/**
 * Accessibility audit: runs axe-core against the live app at multiple
 * viewports + theme combinations, plus the major mode tabs (Pattern/Text).
 * Exits non-zero if any 'serious' or 'critical' violations are found.
 *
 * Usage: AUDIT_URL=https://localhost:5173/ node test/visual/a11y-audit.mjs
 */
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import fs from 'fs'

const URL = process.env.AUDIT_URL || 'https://localhost:5174/'
const OUT = '/tmp/auracast-audit/a11y'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const allViolations = []

async function clickTab(page, label) {
  const tabs = page.locator('button,[role="tab"]').filter({ hasText: new RegExp(`^${label}$`) })
  const n = await tabs.count()
  for (let i = 0; i < n; i++) {
    const t = tabs.nth(i)
    if ((await t.textContent())?.trim() === label && await t.isVisible()) {
      await t.click(); await page.waitForTimeout(500); return true
    }
  }
  return false
}

async function audit(viewport, name, theme) {
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true, viewport, colorScheme: theme,
  })
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  for (const mode of ['Pattern', 'Text']) {
    if (mode !== 'Pattern') await clickTab(page, mode)
    await page.waitForTimeout(400)
    const tag = `${name}-${theme}-${mode.toLowerCase()}`
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze()

    fs.writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(result, null, 2))
    if (result.violations.length) {
      console.log(`\n[${tag}] ${result.violations.length} axe violations:`)
      for (const v of result.violations) {
        console.log(`  - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})`)
        for (const node of v.nodes.slice(0, 3)) {
          console.log(`      ${node.target.join(' ')}`)
        }
        allViolations.push({ tag, ...v })
      }
    } else {
      console.log(`[${tag}] ✓ no violations`)
    }
  }

  await ctx.close()
}

await audit({ width: 1440, height: 900 }, 'desk', 'dark')
await audit({ width: 1440, height: 900 }, 'desk', 'light')
await audit({ width: 768,  height: 900 }, 'tab',  'dark')
await audit({ width: 390,  height: 844 }, 'mob',  'light')

await browser.close()

const serious = allViolations.filter(v => v.impact === 'serious' || v.impact === 'critical')
const moderate = allViolations.filter(v => v.impact === 'moderate')
const minor = allViolations.filter(v => v.impact === 'minor')
console.log('\n=== A11Y SUMMARY ===')
console.log(`Total violations: ${allViolations.length}`)
console.log(`  critical/serious: ${serious.length}`)
console.log(`  moderate: ${moderate.length}`)
console.log(`  minor: ${minor.length}`)
fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(allViolations, null, 2))
if (serious.length > 0) {
  console.error(`\n✗ ${serious.length} critical/serious accessibility issue(s) found.`)
  process.exit(1)
}
