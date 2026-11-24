const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core'));
const { scenario, origin } = require('./test-wedding-browser.cjs');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      const run = await scenario(browser, { width, initial: 'google', family: true });
      const page = run.page;
      await run.context.route('**/rest/v1/household_changes**', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
      for (const route of ['/app', '/invitation/feed']) {
        await page.goto(origin + route);
        await page.getByRole('button', { name: 'Account menu for Google guest', exact: true }).click();
        const menu = page.locator('.guest-account-panel');
        await menu.getByRole('link', { name: 'Family RSVP', exact: true }).waitFor();
        assert.equal(await menu.getByRole('link', { name: 'Family RSVP', exact: true }).getAttribute('href'), '/app/family');
        assert.equal(await page.getByRole('navigation', { name: 'Wedding', exact: true }).getByRole('link', { name: 'Family', exact: true }).count(), 0);
        await menu.getByRole('link', { name: 'Family RSVP', exact: true }).click();
        await page.waitForURL(origin + '/app/family');
        await page.getByRole('heading', { name: 'Your family', exact: true }).waitFor();
        assert.equal(await page.locator('.guest-account-panel').count(), 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      assert.deepEqual(run.errors, []); await run.context.close();
    }
    const fresh = await scenario(browser);
    for (const route of ['/rsvp', '/e/anand-susmita', '/i/family-private?edit=1', '/app/family']) {
      await fresh.page.goto(origin + route);
      await fresh.page.getByRole('button', { name: 'Continue with Google', exact: true }).waitFor();
      assert.equal(await fresh.page.locator('.rsvp-fields').count(), 0);
    }
    await fresh.page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
    await fresh.page.waitForURL(origin + '/app/family');
    await fresh.page.getByRole('link', { name: 'Find my family', exact: true }).waitFor();
    await fresh.context.close();
    const unlinked = await scenario(browser, { initial: 'google' });
    await unlinked.page.goto(origin + '/invitation');
    await unlinked.page.getByRole('button', { name: 'Account menu for Google guest', exact: true }).click();
    assert.equal(await unlinked.page.locator('.guest-account-panel').getByRole('link', { name: 'Family RSVP', exact: true }).count(), 0);
    await unlinked.context.close();
    console.log('PASS: profile family link at desktop/390/320px, general and family routes, unlinked account, Google gates and OAuth return');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
