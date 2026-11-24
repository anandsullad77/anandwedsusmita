const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core'));
const { scenario, origin, eventId, id } = require('./test-wedding-browser.cjs');
const json = (route, value) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      const host = await scenario(browser, { initial: 'host', width });
      const writes = [];
      const households = ['individual', 'family'].map((type, i) => ({ id: id(20 + i), event_id: eventId, name: i ? 'Sullad' : 'Prashant', token: `personal-${type}`, invitation_type: type, cap: i ? 6 : 1, invite_status: 'not_sent', people: [{ id: id(30 + i), name: 'Prashant', phone: '+919876543210', attending: [] }] }));
      await host.context.route('**/rest/v1/households**', route => {
        if (route.request().method() === 'GET') return json(route, households);
        writes.push(route.request().postDataJSON()); return json(route, null);
      });
      await host.context.addInitScript(() => {
        window.sharedInvitations = []; window.shareOutcome = 'cancel'; window.copiedMessage = '';
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: data => data.files?.[0]?.type === 'image/png' });
        Object.defineProperty(navigator, 'share', { configurable: true, value: async data => {
          if (window.shareOutcome === 'cancel') throw new DOMException('Canceled', 'AbortError');
          if (window.shareOutcome === 'error') throw new DOMException('Blocked', 'NotAllowedError');
          window.sharedInvitations.push({ text: data.text, name: data.files[0].name, size: data.files[0].size });
        } });
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedMessage = text; } } });
      });
      const page = host.page;
      await page.goto(origin + '/admin/families');
      await page.getByRole('row').filter({ hasText: 'Prashant' }).first().getByRole('button', { name: 'Send on WhatsApp', exact: true }).click();
      const dialog = page.getByRole('dialog');
      const share = dialog.getByRole('button', { name: 'Share picture & message', exact: true });
      await share.waitFor();
      const text = await dialog.getByLabel('Personal invitation message').inputValue();
      assert.ok((await dialog.getByLabel('Personal invitation message').boundingBox()).height >= 330, 'Message preview remains readable on narrow screens');
      assert.ok(text.startsWith('Dear Prashant,\n\n*Your invitation to Anand & Susmita’s wedding is here! ❤️*'));
      assert.ok(text.includes(`\n\n${origin}/i/personal-individual\n\n`));
      assert.ok(text.includes('29 November 2026 · 12:28 PM IST'));
      assert.ok(!text.includes('291126'), 'No wedding PIN included');
      assert.ok(await dialog.locator('img').evaluate(async img => { await img.decode(); return Math.abs(img.naturalWidth / img.naturalHeight - 1.75) < 0.01; }));
      assert.equal(writes.length, 0, 'Preview does not mark invitation as sent');
      await share.click();
      assert.equal(writes.length, 0, 'Cancel does not mark invitation as sent');
      await page.evaluate(() => { window.shareOutcome = 'error'; });
      await share.click();
      await dialog.getByRole('alert').waitFor();
      assert.equal(writes.length, 0, 'Failed share does not mark invitation as sent');
      await dialog.getByRole('button', { name: 'Copy message', exact: true }).click();
      assert.equal(await page.evaluate(() => window.copiedMessage), text);
      const url = new URL(await dialog.getByRole('link', { name: 'Open WhatsApp', exact: true }).getAttribute('href'));
      assert.equal(url.pathname, '/919876543210'); assert.equal(url.searchParams.get('text'), text);
      await page.evaluate(() => { window.shareOutcome = 'success'; });
      await share.click();
      await dialog.getByRole('status').filter({ hasText: 'handed' }).waitFor();
      assert.equal((await page.evaluate(() => window.sharedInvitations))[0].text, text);
      assert.ok((await page.evaluate(() => window.sharedInvitations))[0].size > 10000);
      await page.waitForTimeout(100);
      assert.deepEqual(writes, [{ invite_status: 'sent' }]);
      await page.screenshot({ path: path.resolve(__dirname, `../artifacts/invitation-sharing-${width}.png`) });
      assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await dialog.getByRole('button', { name: 'Close invitation sharing' }).click();

      // Unsupported devices retain both the downloadable picture and personal text.
      await page.evaluate(() => { Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }); });
      await page.getByRole('row').filter({ hasText: 'Sullad' }).getByRole('button', { name: 'Send on WhatsApp', exact: true }).click();
      await dialog.getByText('Download the picture, then open WhatsApp and attach it above the prepared message.', { exact: true }).waitFor();
      assert.ok((await dialog.getByLabel('Personal invitation message').inputValue()).startsWith('Dear Sullad and family,'));
      assert.ok((await dialog.getByLabel('Personal invitation message').inputValue()).includes('/i/personal-family'));
      assert.equal(await share.count(), 0);
      const download = page.waitForEvent('download');
      await dialog.getByRole('link', { name: 'Download picture', exact: true }).click();
      assert.equal((await download).suggestedFilename(), 'Anand-and-Susmita-wedding.png');
      assert.deepEqual(host.errors, []);
      await host.context.close();
    }
    console.log('PASS: 3.5:2 image; personalized individual/family copy and links; native image+text sharing; cancellation/failure status; clipboard; WhatsApp and download fallback; 320–1440px');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
