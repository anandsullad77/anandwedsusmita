const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'); }
catch { playwright = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core')); }
const { scenario, wait, origin, eventId, id } = require('./test-wedding-browser.cjs');
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  const runs = [];
  try {
    for (const width of [1440, 390, 320]) {
      const run = await scenario(browser, { initial: 'host', width }); runs.push(run);
      let families = [
        { id: id(500), event_id: eventId, name: 'Test family', token: 'delete-test', invite_status: 'responded', coming: 'yes', source: 'list', people: [{ id: id(501), name: 'Test guest', attending: [id(3)] }] },
        { id: id(510), event_id: eventId, name: 'Keep family', token: 'keep-test', invite_status: 'not_sent', source: 'list', people: [] }
      ];
      let fail = false, missing = false, deletes = 0, release;
      await run.context.route(url => url.pathname === '/rest/v1/households', async route => {
        const request = route.request(), url = new URL(request.url());
        const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (request.method() === 'GET') return json(families);
        assert.equal(request.method(), 'DELETE');
        assert.equal(url.searchParams.get('event_id'), 'eq.' + eventId);
        assert.equal(url.searchParams.get('id'), 'eq.' + id(500));
        assert.equal(url.searchParams.get('select'), 'id');
        deletes++;
        if (fail) return json({ message: 'Temporary deletion failure' }, 503);
        if (missing) return json(null);
        await new Promise(resolve => { release = resolve; });
        families = families.filter(family => family.id !== id(500));
        return json({ id: id(500) });
      });
      const page = run.page;
      await page.goto(origin + '/admin/families');
      const row = page.getByRole('row').filter({ hasText: 'Test family' });
      const open = () => row.getByRole('button', { name: 'Delete Test family', exact: true }).click();
      const dialog = page.getByRole('alertdialog');
      await open();
      await dialog.waitFor();
      assert.match(await dialog.innerText(), /Test family/);
      assert.match(await dialog.innerText(), /cannot be undone/);
      assert.equal(await dialog.getByRole('button', { name: 'Cancel', exact: true }).evaluate(button => button === document.activeElement), true, 'Cancel receives initial focus');
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.equal(await dialog.count(), 0);
      assert.equal(deletes, 0);
      assert.equal(await row.count(), 1);
      await open(); await page.keyboard.press('Escape');
      assert.equal(await dialog.count(), 0);
      assert.equal(deletes, 0, 'Escape cancels without a delete request');
      assert.equal(await row.getByRole('button', { name: 'Delete Test family', exact: true }).evaluate(button => button === document.activeElement), true, 'Cancel restores focus');

      fail = true;
      await open();
      await dialog.getByRole('button', { name: 'Delete family', exact: true }).click();
      await dialog.getByRole('alert').filter({ hasText: 'Temporary deletion failure' }).waitFor();
      assert.equal(await row.count(), 1, 'Failure keeps the family in the list');
      assert.equal(await dialog.getByRole('button', { name: 'Delete family', exact: true }).isEnabled(), true, 'Failure can be retried');
      fail = false; missing = true;
      await dialog.getByRole('button', { name: 'Delete family', exact: true }).click();
      await dialog.getByRole('alert').filter({ hasText: 'Family not found' }).waitFor();
      assert.equal(await row.count(), 1, 'A zero-row response never reports success');
      missing = false;

      await dialog.getByRole('button', { name: 'Delete family', exact: true }).click();
      await wait(() => !!release, 'Delete request pending');
      assert.equal(await dialog.getByRole('button', { name: 'Deleting…', exact: true }).isDisabled(), true);
      assert.equal(await dialog.getByRole('button', { name: 'Cancel', exact: true }).isDisabled(), true);
      await page.keyboard.press('Escape');
      assert.equal(await dialog.count(), 1, 'Pending deletion keeps the dialog open');
      await page.evaluate(() => document.querySelector('.family-delete-dialog form').requestSubmit());
      assert.equal(deletes, 3, 'Pending requests cannot be submitted twice');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow at ' + width);
      assert.ok(await dialog.evaluate(element => { const r = element.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; }), 'Confirmation fits the viewport');
      fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
      await page.screenshot({ path: path.join(root, `artifacts/family-delete-${width}.png`) });
      release();
      await page.getByRole('status').filter({ hasText: 'Test family deleted.' }).waitFor();
      await wait(async () => await row.count() === 0, 'Deleted family removed from the list');
      assert.equal(await page.getByRole('row').filter({ hasText: 'Keep family' }).count(), 1);
      assert.match(await page.locator('header').filter({ hasText: 'Families & invites' }).innerText(), /1 families/);
      assert.equal(await page.locator('#fq').evaluate(input => input === document.activeElement), true, 'Success returns focus to the family search');
      await page.reload();
      await page.getByRole('row').filter({ hasText: 'Keep family' }).waitFor();
      assert.equal(await row.count(), 0, 'Removal persists through reload');
      assert.deepEqual(run.errors, []);
      console.log(`PASS: ${width}px admin deletion, Cancel/Escape, error/retry, missing family, duplicate protection, focus and list refresh`);
    }

    // Exercise the browser demo implementation, including its persisted cleanup.
    const demo = runs[0].page;
    const result = await demo.evaluate(async () => {
      const { localBackend: api } = await import('/src/companion/lib/localBackend.ts');
      const { demoEvent } = await import('/src/companion/lib/demoSeed.ts');
      const event = demoEvent.id, key = 'as-wedding-demo-db-v1';
      let denied = false;
      try { await api.deleteHousehold(event, 'missing'); } catch (error) { denied = /Only hosts/.test(error.message); }
      await api.hostSignIn('host@example.com', 'demo-password');
      await api.adminData(event);
      const db = JSON.parse(localStorage.getItem(key)), family = db.households[0], otherIds = db.households.slice(1).map(h => h.id);
      db.devices.push({ device: 'linked-device', eventId: event, householdId: family.id, personId: family.people[0].id });
      db.changes.push({ householdId: family.id, byName: 'Guest', summary: 'RSVP', at: new Date().toISOString() });
      db.photos.push({ id: 'kept-photo', eventId: event, personId: family.people[0].id, uploaderName: 'Guest', akshateBy: [], flaggedBy: [] });
      db.wishes.push({ id: 'kept-wish', eventId: event, device: 'linked-device', name: 'Guest', message: 'Best wishes!' });
      localStorage.setItem(key, JSON.stringify(db));
      let mismatched = false;
      try { await api.deleteHousehold('another-event', family.id); } catch { mismatched = true; }
      const before = localStorage.getItem(key);
      await api.deleteHousehold(event, family.id);
      const after = JSON.parse(localStorage.getItem(key));
      return { denied, mismatched, changed: before !== localStorage.getItem(key),
        otherIds, remainingIds: after.households.map(h => h.id),
        devices: after.devices.filter(d => d.householdId === family.id), changes: after.changes.filter(c => c.householdId === family.id),
        photo: after.photos.find(p => p.id === 'kept-photo'), wishes: after.wishes,
        bundle: await api.inviteBundle(family.token) };
    });
    assert.ok(result.denied && result.mismatched && result.changed);
    assert.deepEqual(result.remainingIds, result.otherIds);
    assert.deepEqual(result.devices, []); assert.deepEqual(result.changes, []);
    assert.equal(result.photo.personId, null); assert.equal(result.wishes[0].id, 'kept-wish');
    assert.equal(result.bundle, null);
    console.log('PASS: demo host-only deletion cleans up members, links and history, preserves photos/wishes and invalidates the invite');
  } finally { for (const run of runs) await run.context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
