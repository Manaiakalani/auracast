import { chromium } from 'playwright'
const URL = process.env.AUDIT_URL || 'https://localhost:5174/'
const b = await chromium.launch()
for (const theme of ['dark', 'light']) {
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 }, colorScheme: theme })
  const p = await ctx.newPage()
  await p.goto(URL, { waitUntil: 'networkidle' })
  await p.waitForTimeout(800)
  await p.screenshot({ path: `/tmp/auracast-audit/audit-shots/disc-${theme}.png`, clip: { x: 180, y: 170, width: 480, height: 520 } })
  await ctx.close()
}
await b.close()
console.log('done')
