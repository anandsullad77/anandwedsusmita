const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core'));
const { scenario, origin, eventId, id } = require('./test-wedding-browser.cjs');
const json = (route, value) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
const wedding = { id: id(3), nameEn: 'Wedding' };
const reception = { id: id(4), nameEn: 'Reception' };
const person = (n, attending = []) => ({ id: id(n), name: `Guest ${n}`, isChild: false, attending });

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const test of [
      { name: 'individual first reply', coming: null },
      { name: 'individual incomplete saved yes', coming: 'yes' },
      { name: 'individual changes decline to yes', coming: 'no' },
      { name: 'individual removed event', coming: 'yes', people: [person(21, [id(99)])] },
      { name: 'family changes decline to yes', kind: 'family', coming: 'no', people: [person(21), person(22)] },
      { name: 'family incomplete saved yes', kind: 'family', coming: 'yes', people: [person(21), person(22)] },
      { name: 'family preserves partial attendance', kind: 'family', coming: 'yes', people: [person(21, [id(3), id(99)]), person(22)], functions: [wedding, reception], expected: [[id(3)], []] },
      { name: 'family keeps explicit deselections', kind: 'family', coming: null, people: [person(21), person(22)], functions: [wedding, reception], deselect: true, expected: [[id(3)], []] },
      { name: 'missing event gives host correction', coming: null, functions: [], missingEvent: true },
    ]) {
      const run = await scenario(browser, { width: 390 });
      const { page, context } = run;
      const people = test.people || [person(21)], functions = test.functions || [wedding], replies = [];
      const kind = test.kind || 'individual';
      await context.route('**/rest/v1/rpc/invite_bundle', route => json(route, {
        event: { id: eventId, slug: 'anand-susmita', coupleA: 'Anand', coupleB: 'Susmita', startsAt: '2026-11-29T12:28:00+05:30', venue: 'Venue', theme: {} },
        household: { id: id(20), name: 'Rony', invitationType: kind, cap: people.length, coming: test.coming, travel: null, stay: null },
        people, functions,
      }));
      await context.route('**/rest/v1/rpc/save_rsvp', route => { replies.push(route.request().postDataJSON().p_payload); return json(route, null); });
      await page.goto(origin + '/i/rsvp-regression');
      await page.getByRole('heading', { name: 'Will you join us?', exact: true }).waitFor();
      if (kind === 'family') await page.getByLabel('Who is replying?').selectOption(id(21));
      await page.getByLabel(/^Yes,/).check();
      if (test.deselect) {
        await page.getByRole('group', { name: 'Who is coming?' }).getByLabel('Guest 22', { exact: true }).uncheck();
        await page.getByRole('group', { name: 'Which events will you attend?' }).getByLabel('Reception', { exact: true }).uncheck();
      }
      await page.getByRole('button', { name: /^Continue/ }).click();
      if (test.missingEvent) {
        await page.getByRole('alert').filter({ hasText: 'hosts need to add an event' }).waitFor();
        assert.equal(replies.length, 0);
        // A decline does not need an event, and must remain possible.
        await page.getByLabel(/^Sorry,/).check();
        await page.getByRole('button', { name: /^Continue/ }).click();
      } else {
        await page.getByRole('heading', { name: 'Let’s plan your visit.', exact: true }).waitFor();
        await page.getByLabel(/confirm this later$/).check();
        await page.getByRole('button', { name: /^Continue/ }).click();
      }
      await page.getByRole('button', { name: /^Send (my|our) reply$/ }).click();
      await page.waitForURL(origin + '/app');
      assert.equal(replies.length, 1);
      assert.equal(replies[0].coming, test.missingEvent ? 'no' : 'yes');
      assert.deepEqual(replies[0].attendance, people.map((p, i) => ({ personId: p.id, functionIds: test.missingEvent ? [] : test.expected?.[i] ?? functions.map(f => f.id) })));
      assert.equal(run.exchanges, 0, 'Family RSVP needs no Google login');
      assert.deepEqual(run.errors, []);
      await context.close();
      console.log(`PASS: ${test.name}`);
    }

    const run = await scenario(browser, { initial: 'host', width: 390 });
    const writes = [];
    await run.context.route('**/rest/v1/households**', route => {
      if (route.request().method() === 'GET') return json(route, [{ id: id(20), name: 'Rony', token: 'legacy-invitation', invitation_type: 'individual', function_ids: [], cap: 1, people: [person(21)] }]);
      writes.push(route.request().postDataJSON());
      return json(route, { id: id(20), ...writes.at(-1) });
    });
    await run.context.route('**/rest/v1/people**', route => json(route, null));
    await run.page.goto(origin + '/admin/families');
    await run.page.getByRole('row').filter({ hasText: 'Rony' }).getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = run.page.getByRole('dialog');
    const event = dialog.getByRole('button', { name: 'Muhurta & Akshate', exact: true });
    assert.equal(await event.getAttribute('aria-pressed'), 'true', 'An empty legacy invitation defaults to the sole wedding event');
    await event.click();
    await dialog.getByRole('button', { name: 'Save invitation', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'Choose at least one event' }).waitFor();
    assert.equal(writes.length, 0, 'An unusable invitation is never saved');
    await event.click();
    await dialog.getByRole('button', { name: 'Save invitation', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(writes[0].function_ids, [id(3)]);
    assert.deepEqual(run.errors, []);
    await run.context.close();
    console.log('PASS: host repairs missing event on the same invitation and cannot save an empty event list');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
