import { chromium } from '@playwright/test';
import { join } from 'path';

const BASE = 'https://localhost:4175';
const OUT = join(import.meta.dirname, '..', 'docs', 'screenshots');

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();

  // 1. Hero shot - main app UI
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, 'hero-dark.png'), fullPage: false });
  console.log('  hero-dark.png');

  // 2. Light mode hero
  await ctx.close();
  const ctxLight = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
    colorScheme: 'light',
  });
  const pageLight = await ctxLight.newPage();
  await pageLight.goto(BASE, { waitUntil: 'networkidle' });
  await pageLight.waitForTimeout(2000);
  await pageLight.screenshot({ path: join(OUT, 'hero-light.png'), fullPage: false });
  console.log('  hero-light.png');

  // 3. Pattern picker - click Patterns tab
  const ctxPatterns = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
    colorScheme: 'dark',
  });
  const pagePatterns = await ctxPatterns.newPage();
  await pagePatterns.goto(BASE, { waitUntil: 'networkidle' });
  await pagePatterns.waitForTimeout(1000);

  // Try to find and click the Patterns tab
  const patternsTab = await pagePatterns.locator('button, [role="tab"]').filter({ hasText: /pattern/i }).first();
  if (await patternsTab.count() > 0) {
    await patternsTab.click();
    await pagePatterns.waitForTimeout(2000);
  }
  await pagePatterns.screenshot({ path: join(OUT, 'patterns.png'), fullPage: false });
  console.log('  patterns.png');

  // 4. Text mode
  const ctxText = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
    colorScheme: 'dark',
  });
  const pageText = await ctxText.newPage();
  await pageText.goto(BASE, { waitUntil: 'networkidle' });
  await pageText.waitForTimeout(1000);

  const textTab = await pageText.locator('button, [role="tab"]').filter({ hasText: /text/i }).first();
  if (await textTab.count() > 0) {
    await textTab.click();
    await pageText.waitForTimeout(1500);
  }
  await pageText.screenshot({ path: join(OUT, 'text-mode.png'), fullPage: false });
  console.log('  text-mode.png');

  // 5. Mobile viewport
  const ctxMobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: true,
    colorScheme: 'dark',
    deviceScaleFactor: 3,
  });
  const pageMobile = await ctxMobile.newPage();
  await pageMobile.goto(BASE, { waitUntil: 'networkidle' });
  await pageMobile.waitForTimeout(2000);
  await pageMobile.screenshot({ path: join(OUT, 'mobile.png'), fullPage: false });
  console.log('  mobile.png');

  await browser.close();
  console.log('Done! Screenshots saved to docs/screenshots/');
}

main().catch(e => { console.error(e); process.exit(1); });
