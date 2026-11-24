const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core'));
const { scenario, origin, id, eventId } = require('./test-wedding-browser.cjs');
const json = (route, body) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      const run = await scenario(browser, { width });
      const { page, context } = run;
      let people = [{ id: id(21), name: 'Original guest', attending: [], isChild: false }];
      const saves = [];
      await context.route('**/rest/v1/household_changes**', route => json(route, []));
      await context.route('**/rest/v1/rpc/invite_bundle', route => json(route, {
        event: { id: eventId, slug: 'anand-susmita', coupleA: 'Anand', coupleB: 'Susmita', startsAt: '2026-11-29T12:28:00+05:30', venue: 'Venue', theme: {} },
        household: { id: id(20), name: 'Test family', cap: 3, coming: saves.length ? 'yes' : null, travel: null, stay: null },
        functions: [{ id: id(3), nameEn: 'Wedding' }], people,
      }));
      await context.route('**/rest/v1/rpc/save_rsvp', route => {
        const body = route.request().postDataJSON(); saves.push(body);
        const added = body.p_payload.add;
        assert.equal(people.length + added.length <= 3, true);
        people = [...people.map(p => ({ ...p, attending: [id(3)] })), ...added.map((p, i) => ({ ...p, id: id(100 + i), attending: p.functionIds }))];
        return json(route, null);
      });
      await page.goto(origin + '/i/family-private');
      await page.getByRole('heading', { name: 'Will you join us?', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Continue with Google' }).count(), 0);
      await page.getByLabel('Yes, we’ll be there', { exact: true }).check();
      const add = page.getByRole('button', { name: '+ Add family member', exact: true });
      await add.click(); await add.click(); assert.equal(await add.isDisabled(), true);
      await page.getByRole('button', { name: 'Continue →', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Enter a name' }).waitFor();
      await page.getByLabel('New family member 1', { exact: true }).fill('Adult guest');
      await page.getByLabel('New family member 2', { exact: true }).fill('Child guest');
      await page.locator('.rsvp-added-member').nth(1).getByLabel('Child', { exact: true }).check();
      await page.getByRole('button', { name: 'Remove member 1', exact: true }).click();
      assert.equal(await add.isDisabled(), false); await add.click();
      await page.getByLabel('New family member 2', { exact: true }).fill('Adult guest');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.resolve(__dirname, `../artifacts/family-rsvp-capacity-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Continue →', exact: true }).click();
      await page.getByLabel('We live nearby', { exact: true }).check();
      await page.getByLabel('We’ll confirm this later', { exact: true }).check();
      await page.getByRole('button', { name: 'Continue →', exact: true }).click();
      assert.match(await page.locator('.rsvp-review').innerText(), /3 coming/);
      await page.getByRole('button', { name: 'Send our reply', exact: true }).click();
      await page.waitForURL(origin + '/app');
      assert.equal(saves.length, 1); assert.equal(saves[0].p_payload.add.length, 2);
      assert.equal(saves[0].p_payload.add[0].isChild, true);
      await page.goto(origin + '/i/family-private?edit=1');
      await page.getByRole('heading', { name: 'Will you join us?', exact: true }).waitFor();
      assert.equal(await page.locator('.rsvp-added-member').count(), 0, 'Saved members become existing members');
      assert.equal(await add.isDisabled(), true, 'Saved members consume the host-set capacity');
      await page.goto(origin + '/app');
      await page.getByRole('button', { name: 'Account menu for Family', exact: true }).click();
      await page.locator('.guest-account-panel').getByRole('link', { name: 'Family RSVP', exact: true }).waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('button', { name: 'Continue with Google' }).count(), 0);
      for (const route of ['/app/feed', '/app/create?type=wish', '/app/create?type=photos']) {
        await page.goto(origin + route);
        await page.getByRole('button', { name: 'Continue with Google', exact: true }).waitFor();
      }
      await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
      await page.waitForURL(origin + '/app/create?type=photos');
      await page.getByRole('heading', { name: 'Upload Photos', exact: true }).waitFor();
      assert.equal(run.claims, 2, 'OAuth reclaims the family for the Google account');
      if (width === 390) {
        let rejectSave = true;
        await context.route('**/rest/v1/rpc/save_rsvp', route => rejectSave
          ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Please retry your reply' }) })
          : json(route, null));
        await page.goto(origin + '/i/family-private');
        await page.getByLabel('Sorry, we can’t attend', { exact: true }).check();
        await page.getByRole('button', { name: 'Continue →', exact: true }).click();
        await page.getByRole('button', { name: 'Send our reply', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'Please retry your reply' }).waitFor();
        assert.ok(page.url().includes('/i/family-private'), 'A failed save stays on the review screen');
        rejectSave = false;
        await page.getByRole('button', { name: 'Send our reply', exact: true }).click();
        await page.waitForURL(origin + '/app');
      }
      assert.deepEqual(run.errors, []); await context.close();
      console.log(`PASS ${width}px: anonymous RSVP, host cap, add/remove/child validation, save/re-edit, public invitation/profile, protected feed/wish/upload and Google return`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
