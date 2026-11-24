// Real UI and SDK; contact selection and all remote writes use local fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'); }
catch { playwright = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core')); }
const { scenario, wait, origin, eventId, id } = require('./test-wedding-browser.cjs');
const artifacts = path.resolve(__dirname, '../artifacts');
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const upload = (dialog, text, name = 'contacts.vcf') => dialog.getByLabel('Contact file', { exact: true }).setInputFiles({ name, mimeType: 'text/vcard', buffer: Buffer.from(text) });
const vcard = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:File Guest\r\nTEL;TYPE=CELL:9876543212\r\nEND:VCARD\r\n';

async function fits(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page has no horizontal overflow');
  for (const button of await page.locator('button:visible, a.btn:visible').all()) {
    assert.ok(await button.evaluate(el => el.getBoundingClientRect().height >= 43), 'Touch targets are at least 44px');
  }
}

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  const runs = [];
  try {
    for (const width of [1440, 390, 320]) {
      const run = await scenario(browser, { initial: 'host', width }); runs.push(run);
      const { page, context } = run;
      let families = [{ id: id(500), event_id: eventId, name: 'Already invited', token: 'existing', invite_status: 'not_sent', source: 'list', people: [{ id: id(501), name: 'Existing guest', phone: '+919876543210', attending: [] }] }];
      let submissions = [], fail = true, release;
      await context.route(url => url.pathname === '/rest/v1/households', route => json(route, families));
      await context.route(url => url.pathname === '/rest/v1/rpc/import_households', async route => {
        const body = route.request().postDataJSON(); submissions.push(body);
        if (fail) return json(route, { message: 'Temporary import failure' }, 503);
        await new Promise(resolve => { release = resolve; });
        families.push(...body.p_households.map((h, i) => ({ id: id(600 + i), event_id: eventId, name: h.name, token: 'imported-' + i, people: h.people, invite_status: 'not_sent', source: 'list' })));
        return json(route, { created: body.p_households.length, skipped: 0 });
      });
      await context.addInitScript(() => {
        window.pickerMode = 'ok'; window.pickerCalls = [];
        Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select: async (properties, options) => {
          window.pickerCalls.push({ properties, options, activated: navigator.userActivation.isActive });
          if (window.pickerMode !== 'ok') throw new DOMException('Picker closed', window.pickerMode);
          return [
            { name: ['Test Guest'], tel: ['98765 43211', '+44 7700 900123'] },
            { name: ['Existing alias'], tel: ['9876543210'] },
            { name: ['Repeated contact'], tel: ['+91 98765 43211'] },
            { name: ['Bad phone'], tel: ['123'] },
            { name: ['Excluded Guest'], tel: ['8765432100'] }
          ];
        } } });
      });
      await page.goto(origin + '/admin/families');
      const trigger = page.getByRole('button', { name: 'Import contacts', exact: true });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Import contacts', exact: true });
      const choose = () => dialog.getByRole('button', { name: /Choose (phone )?contacts/ }).click();
      await page.evaluate(() => { window.pickerMode = 'AbortError'; });
      await choose(); assert.equal(await dialog.getByRole('alert').count(), 0, 'Picker cancellation is quiet');
      await page.evaluate(() => { window.pickerMode = 'NotAllowedError'; });
      await choose(); await dialog.getByRole('alert').filter({ hasText: 'Contact access was not allowed' }).waitFor();
      await page.evaluate(() => { window.pickerMode = 'ok'; });
      await choose();
      await dialog.getByRole('heading', { name: 'Review contacts', exact: true }).waitFor();
      assert.equal(submissions.length, 0, 'Choosing contacts does not create families');
      assert.equal(await dialog.getByText('Skip duplicate', { exact: true }).count(), 2);
      assert.equal(await dialog.locator('button[type=submit], footer button:last-child').last().isDisabled(), true, 'Invalid phone numbers block import');
      await dialog.getByRole('region', { name: 'Contact 4', exact: true }).getByRole('checkbox').uncheck();
      await dialog.getByRole('region', { name: 'Contact 5', exact: true }).getByRole('checkbox').uncheck();
      const first = dialog.getByRole('region', { name: 'Contact 1', exact: true });
      assert.equal(await first.getByRole('button', { name: 'Individual', exact: true }).getAttribute('aria-pressed'), 'true');
      await first.getByRole('button', { name: 'Family', exact: true }).click();
      assert.equal(await first.getByLabel('WhatsApp number (optional)', { exact: true }).inputValue(), '+919876543211');
      assert.equal(await first.locator('datalist option').count(), 2);
      await first.getByLabel('Family name', { exact: true }).fill('Reviewed family');
      if (width === 390) {
        await page.setViewportSize({ width, height: 400 });
        await wait(async () => await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; }), 'Dialog adapts to a short viewport');
        assert.ok(await dialog.locator('footer').evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; }), 'Import actions stay on screen');
        await page.setViewportSize({ width, height: 900 });
      }
      await fits(page);
      await page.screenshot({ path: path.join(artifacts, `contacts-review-${width}.png`), fullPage: true });
      await dialog.getByRole('button', { name: 'Import 1 invitation', exact: true }).click();
      await dialog.getByRole('alert').filter({ hasText: 'Temporary import failure' }).waitFor();
      assert.equal(await first.getByLabel('Family name', { exact: true }).inputValue(), 'Reviewed family', 'Failed import keeps edits');
      fail = false;
      await dialog.getByRole('button', { name: 'Import 1 invitation', exact: true }).click();
      await wait(() => !!release, 'Import request pending');
      assert.ok(await dialog.getByRole('button', { name: 'Cancel', exact: true }).isDisabled());
      await page.keyboard.press('Escape'); assert.equal(await dialog.count(), 1);
      await dialog.locator('form').evaluate(form => form.requestSubmit());
      assert.equal(submissions.length, 2, 'A pending import cannot be submitted twice');
      release();
      await page.getByRole('status').filter({ hasText: 'Created 1 invitation from contacts.' }).waitFor();
      await page.getByRole('row').filter({ hasText: 'Reviewed family' }).waitFor();
      assert.equal(await trigger.evaluate(button => button === document.activeElement), true, 'Closing returns focus');
      assert.deepEqual(submissions[1].p_households, [{ name: 'Reviewed family', invitationType: 'family', side: null, invitedBy: null, cap: 6, functionIds: [id(3)], people: [{ name: 'Test Guest', phone: '+919876543211', isChild: false }] }]);
      const pickerCalls = await page.evaluate(() => window.pickerCalls);
      assert.deepEqual(pickerCalls[2].properties, ['name', 'tel']);
      assert.equal(pickerCalls[2].options.multiple, true); assert.equal(pickerCalls[2].activated, true);
      // Remove native support: Safari/desktop still have the contact-file path.
      await page.evaluate(() => { delete navigator.contacts; });
      await trigger.click();
      assert.equal(await dialog.getByRole('button', { name: 'Choose phone contacts' }).count(), 0);
      await upload(dialog, 'invalid file');
      await dialog.getByRole('alert').filter({ hasText: 'no readable contacts' }).waitFor();
      await upload(dialog, vcard);
      await dialog.getByRole('heading', { name: 'Review contacts' }).waitFor();
      assert.equal(await dialog.getByLabel('Guest name', { exact: true }).inputValue(), 'File Guest');
      assert.equal(await dialog.getByLabel('WhatsApp number (optional)', { exact: true }).inputValue(), '+919876543212');
      await page.keyboard.press('Escape'); assert.equal(await dialog.count(), 0);
      assert.equal(submissions.length, 2, 'File preview and cancellation do not write data');
      if (width === 390) {
        await trigger.click(); await upload(dialog, vcard);
        await dialog.getByRole('heading', { name: 'Review contacts' }).waitFor();
        release = null;
        await dialog.getByRole('button', { name: 'Import 1 invitation', exact: true }).click();
        await wait(() => !!release, 'Contact-file save pending'); release();
        await page.getByRole('row').filter({ hasText: 'File Guest' }).waitFor();
        assert.equal(submissions.length, 3, 'Contact-file imports save through the host-only import RPC');
      }
      assert.deepEqual(run.errors, []);
      console.log(`PASS ${width}px: contact selection, duplicates, edits, error/retry, pending lock, focus and .vcf fallback`);
    }

    const parser = await runs[0].page.evaluate(async () => {
      const { readContactFile, contactPhone, contactDrafts } = await import('/src/companion/lib/contactImport.ts');
      const encoded = 'BEGIN:VCARD\r\nVERSION:2.1\r\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=E0=B2=86=E0=B2=A8=\r\n=E0=B2=82=E0=B2=A6\r\nTEL;CELL:00919876543213\r\nEND:VCARD';
      const folded = 'BEGIN:VCARD\nVERSION:4.0\nN:Sullad;Anand;;;\nitem1.TEL;VALUE=uri:tel:+91-98765\n 43214\nEND:VCARD';
      let overLimit = false;
      try { contactDrafts(Array.from({ length: 501 }, () => ({ name: ['Guest'] }))); } catch { overLimit = true; }
      return { encoded: readContactFile(encoded), folded: readContactFile(folded), phones: ['9876543210', '09876543210', '00919876543210', '+44 7700 900123'].map(contactPhone), overLimit };
    });
    assert.equal(parser.encoded[0].name[0], 'ಆನಂದ');
    assert.equal(parser.folded[0].name[0], 'Anand Sullad');
    assert.equal(parser.folded[0].tel[0], 'tel:+91-9876543214');
    assert.deepEqual(parser.phones, ['+919876543210', '+919876543210', '+919876543210', '+447700900123']);
    assert.equal(parser.overLimit, true);
    console.log('PASS: vCard 2.1/3/4, Kannada, folded lines, country codes and import limits');

    for (const width of [1440, 390, 320]) {
      const run = await scenario(browser, { width }); runs.push(run);
      const { page, context } = run;
      let searches = 0, joins = [], requests = [], rsvps = [];
      await context.route(url => url.pathname === '/rest/v1/rpc/invite_bundle', route => json(route, {
        event: { id: eventId, slug: 'anand-susmita', coupleA: 'Anand', coupleB: 'Susmita', startsAt: '2026-11-29T12:28:00+05:30', venue: 'Wedding venue', theme: {} },
        functions: [{ id: id(3), nameEn: 'Wedding', startsAt: '2026-11-29T12:28:00+05:30' }],
        household: { id: id(20), name: 'Test family', coming: null, travel: null, stay: null },
        people: [{ id: id(21), name: 'Family guest', isChild: false, attending: [] }]
      }));
      await context.route(url => url.pathname === '/rest/v1/rpc/find_on_list', route => {
        searches++;
        return json(route, route.request().postDataJSON().p_pin === '291126' ? [] : { message: 'Wrong PIN' }, route.request().postDataJSON().p_pin === '291126' ? 200 : 400);
      });
      await context.route(url => url.pathname === '/rest/v1/rpc/open_join', route => { joins.push(route.request().postDataJSON()); return json(route, { householdToken: 'family-private', personId: id(21) }); });
      await context.route(url => url.pathname === '/rest/v1/rpc/request_access', route => { requests.push(route.request().postDataJSON()); return json(route, null); });
      await context.route(url => url.pathname === '/rest/v1/rpc/save_rsvp', route => { rsvps.push(route.request().postDataJSON()); return json(route, null); });
      await page.goto(origin + '/rsvp');
      await page.getByRole('heading', { name: 'Welcome to the wedding' }).waitFor(); await fits(page);
      await page.screenshot({ path: path.join(artifacts, `onboarding-pin-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'No PIN? Ask the hosts' }).click();
      await page.getByLabel('Your name', { exact: true }).fill('Guest');
      await page.getByLabel('WhatsApp number', { exact: true }).fill('9876543210');
      await fits(page);
      await page.getByRole('button', { name: 'Send request', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'The hosts have your request' }).waitFor(); assert.equal(requests.length, 1);
      await page.getByRole('button', { name: '← Back to PIN', exact: true }).click();
      await page.getByLabel('Wedding PIN', { exact: true }).fill('000000');
      await page.getByLabel('Wedding PIN', { exact: true }).press('Enter');
      await page.getByRole('alert').filter({ hasText: 'Wrong PIN' }).waitFor();
      await page.getByLabel('Wedding PIN', { exact: true }).fill('291126');
      await page.getByLabel('Wedding PIN', { exact: true }).press('Enter');
      await page.getByRole('heading', { name: 'Find your family', exact: true }).waitFor();
      assert.equal(await page.locator('#entry-title').evaluate(el => el === document.activeElement), true);
      await page.getByLabel('Your name', { exact: true }).fill('Unknown Guest');
      await page.getByLabel('Your name', { exact: true }).press('Enter');
      await page.getByRole('button', { name: 'I’m not on the list — join' }).click();
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await page.getByLabel('Person 2', { exact: true }).fill('Second Guest');
      await page.getByLabel('Your name', { exact: true }).fill('First Guest');
      await fits(page);
      await page.screenshot({ path: path.join(artifacts, `onboarding-family-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Join the wedding', exact: true }).click();
      await page.getByRole('heading', { name: 'Will you join us?' }).waitFor();
      assert.equal(joins.length, 1); assert.equal(joins[0].p_people.length, 2); assert.equal(searches, 3);
      await page.getByLabel('Yes, we’ll be there', { exact: true }).check();
      await page.getByRole('button', { name: 'Continue →', exact: true }).click();
      await page.getByRole('heading', { name: 'Let’s plan your visit.' }).waitFor();
      await page.getByLabel('We live nearby', { exact: true }).check();
      await page.getByLabel('We’ll confirm this later', { exact: true }).check();
      await fits(page);
      await page.screenshot({ path: path.join(artifacts, `onboarding-arrival-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Continue →', exact: true }).click();
      await page.getByRole('heading', { name: 'Everything look right?' }).waitFor(); await fits(page);
      await page.getByRole('button', { name: 'Send our reply', exact: true }).click();
      await page.waitForURL(origin + '/app');
      assert.equal(rsvps.length, 1); assert.equal(rsvps[0].p_payload.coming, 'yes');
      await fits(page);
      await page.screenshot({ path: path.join(artifacts, `onboarding-complete-${width}.png`), fullPage: true });
      assert.deepEqual(run.errors, []);
      console.log(`PASS ${width}px: PIN error/Enter, host request, family join, arrival, review and saved RSVP`);
    }
  } finally { for (const run of runs) await run.context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
