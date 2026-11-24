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
      let household = null; const householdWrites = [], personWrites = [];
      await host.context.route('**/rest/v1/households**', route => {
        const request = route.request();
        if (request.method() === 'GET') return json(route, household ? [{ ...household, people: [{ id: id(21), name: 'Solo guest', attending: [] }] }] : []);
        const body = request.postDataJSON(); householdWrites.push(body);
        household = { ...household, ...body, id: id(20), token: 'individual-test', invite_status: 'not_sent' };
        return json(route, household);
      });
      await host.context.route('**/rest/v1/people**', route => { personWrites.push(route.request().postDataJSON()); return json(route, null); });
      const page = host.page;
      await page.goto(origin + '/admin/families');
      await page.getByRole('button', { name: '+ Add invitation', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Individual', exact: true }).click();
      await dialog.getByLabel('Guest name', { exact: true }).fill('Solo guest');
      assert.equal(await dialog.getByLabel('Max people', { exact: true }).count(), 0);
      assert.equal(await dialog.getByRole('button', { name: '+ Add person', exact: true }).count(), 0);
      await dialog.getByRole('button', { name: 'Save invitation', exact: true }).click();
      await page.getByRole('row').filter({ hasText: 'Solo guest' }).waitFor();
      assert.equal(householdWrites[0].invitation_type, 'individual'); assert.equal(householdWrites[0].cap, 1);
      assert.equal(personWrites[0].name, 'Solo guest');
      await page.getByRole('row').filter({ hasText: 'Solo guest' }).getByRole('button', { name: 'Edit', exact: true }).click();
      await dialog.getByRole('button', { name: 'Family', exact: true }).click();
      assert.equal(await dialog.getByLabel('Max people', { exact: true }).inputValue(), '6');
      await dialog.getByRole('button', { name: 'Save invitation', exact: true }).click();
      await page.getByRole('row').filter({ hasText: 'Solo guest' }).waitFor();
      assert.equal(householdWrites.at(-1).invitation_type, 'family');
      await host.context.close();

      const guest = await scenario(browser, { width }); const replies = [];
      await guest.context.route('**/rest/v1/household_changes**', route => json(route, []));
      await guest.context.route('**/rest/v1/rpc/invite_bundle', route => json(route, {
        event: { id: eventId, slug: 'anand-susmita', coupleA: 'Anand', coupleB: 'Susmita', startsAt: '2026-11-29T12:28:00+05:30', venue: 'Venue', theme: {} },
        household: { id: id(20), name: 'Solo guest', invitationType: 'individual', cap: 1, coming: replies.length ? 'yes' : null, travel: null, stay: null },
        people: [{ id: id(21), name: 'Solo guest', attending: [] }], functions: [{ id: id(3), nameEn: 'Wedding' }],
      }));
      await guest.context.route('**/rest/v1/rpc/save_rsvp', route => { replies.push(route.request().postDataJSON()); return json(route, null); });
      await guest.page.goto(origin + '/i/individual-test');
      await guest.page.getByLabel('Yes, I will be there', { exact: true }).check();
      assert.equal(await guest.page.getByRole('button', { name: '+ Add family member', exact: true }).count(), 0);
      assert.equal(await guest.page.getByText('Who is replying?', { exact: true }).count(), 0);
      assert.ok(!/family/i.test(await guest.page.locator('.rsvp-card').innerText()));
      await guest.page.screenshot({ path: path.resolve(__dirname, `../artifacts/individual-rsvp-${width}.png`), fullPage: true });
      await guest.page.getByRole('button', { name: 'Continue →', exact: true }).click();
      await guest.page.getByLabel('I live nearby', { exact: true }).check();
      await guest.page.getByLabel('I will confirm this later', { exact: true }).check();
      await guest.page.getByRole('button', { name: 'Continue →', exact: true }).click();
      await guest.page.getByRole('button', { name: 'Send my reply', exact: true }).click();
      await guest.page.waitForURL(origin + '/app');
      await guest.page.getByRole('button', { name: 'Account menu for Guest', exact: true }).click();
      await guest.page.locator('.guest-account-panel').getByRole('link', { name: 'My RSVP', exact: true }).click();
      await guest.page.getByRole('heading', { name: 'Your RSVP', exact: true }).waitFor();
      assert.equal(replies.length, 1); assert.deepEqual(replies[0].p_payload.add, []);
      assert.ok(await guest.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(guest.errors, []); await guest.context.close();
      console.log(`PASS ${width}px: admin Individual/Family switch, cap persistence, personal RSVP wording, one-person flow, and My RSVP profile`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
