// Runs the real RSVP UI and SDK against isolated, stateful invitation fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'); }
catch { playwright = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core')); }
const { scenario, origin, eventId, id } = require('./test-wedding-browser.cjs');
const artifacts = path.resolve(__dirname, '../artifacts');
const json = (route, value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
const guest = (n, attending = []) => ({ id: id(n), name: `Guest ${n}`, isChild: false, attending });
const fn = n => ({ id: id(n), nameEn: n === 3 ? 'Wedding' : 'Reception' });
const next = page => page.getByRole('button', { name: /^Continue/ }).click();
const back = page => page.getByRole('button', { name: 'Back', exact: true }).click();
const review = page => page.getByRole('heading', { name: 'Everything look right?', exact: true }).waitFor();
const send = page => page.getByRole('button', { name: /^Send (my|our) reply$/ }).click();
const tests = [], results = [];
const test = (name, run) => tests.push({ name, run });

async function fixture(browser, options = {}) {
  const run = await scenario(browser, { width: options.width || 390, family: options.session || false });
  const { page, context } = run;
  page.setDefaultTimeout(6000);
  const bundle = {
    event: { id: eventId, slug: 'anand-susmita', coupleA: 'Anand', coupleB: 'Susmita', startsAt: '2026-11-29T12:28:00+05:30', venue: 'Venue', theme: { travelPoints: { train: 'Railway station' } } },
    household: { id: id(20), name: 'QA invitation', invitationType: options.kind || 'individual', cap: options.cap || 4, coming: null, travel: null, stay: null, blessing: '', ...options.household },
    functions: options.functions || [fn(3)], people: options.people || [guest(21)],
  };
  let failClaim = false, failSave = false, delaySave = 0, loseResponse = false, committed = false;
  const attempts = [], saved = [], claims = [];
  await context.route('**/rest/v1/rpc/invite_bundle', route => json(route, bundle));
  await context.route('**/rest/v1/rpc/claim_person', route => {
    claims.push(route.request().postDataJSON());
    return failClaim ? json(route, { message: 'Cannot open this invitation. Please retry.' }, 503) : json(route, bundle.people[0]?.id);
  });
  await context.route('**/rest/v1/rpc/save_rsvp', async route => {
    const reply = route.request().postDataJSON().p_payload;
    attempts.push(reply);
    if (delaySave) await new Promise(resolve => setTimeout(resolve, delaySave));
    if (failSave) return json(route, { message: 'Your reply could not be saved. Please retry.' }, 503);
    if (!saved.some(previous => previous.requestId === reply.requestId)) {
      saved.push(reply);
      for (const [key, value] of Object.entries(reply)) if (['coming', 'travel', 'stay', 'blessing'].includes(key)) bundle.household[key] = value;
      for (const p of bundle.people) p.attending = reply.attendance.find(a => a.personId === p.id)?.functionIds || [];
      bundle.people.push(...reply.add.map((p, i) => ({ ...p, id: id(100 + i), attending: p.functionIds })));
    }
    committed = true;
    if (loseResponse) { loseResponse = false; return route.abort('failed'); }
    return json(route, null);
  });
  return { ...run, bundle, attempts, saved, claims,
    set failClaim(value) { failClaim = value; }, set failSave(value) { failSave = value; },
    set delaySave(value) { delaySave = value; }, set loseResponse(value) { loseResponse = value; },
    get committed() { return committed; },
    async open() { await page.goto(origin + '/i/qa-invitation'); await page.getByRole('heading', { name: 'Will you join us?', exact: true }).waitFor(); },
    async yes() { if (bundle.household.invitationType === 'family') await page.getByLabel('Who is replying?').selectOption(bundle.people[0].id); await page.getByLabel(/^Yes,/).check(); await next(page); },
    async finish() { await send(page); await page.waitForURL(origin + '/app'); assert.equal(run.exchanges, 0); assert.deepEqual(run.errors, []); },
  };
}

for (const width of [320, 390, 768, 1440]) test(`layout, keyboard, back and saved details at ${width}px`, async browser => {
  const run = await fixture(browser, { width, kind: 'family', people: [guest(21), guest(22)], functions: [fn(3), fn(4)] });
  try {
    const { page } = run;
    await run.open(); await run.yes();
    await page.getByLabel('Train', { exact: true }).check();
    assert.equal(await page.getByLabel('Arrival location (optional)').inputValue(), 'Railway station');
    await next(page); await page.getByRole('alert').filter({ hasText: 'arrival time' }).waitFor();
    await page.getByLabel('When will you arrive?').selectOption('Day before · evening');
    await next(page); await page.getByRole('alert').filter({ hasText: 'accommodation' }).waitFor();
    await page.getByLabel(/please help us with a stay$/).check();
    await next(page); await page.getByRole('alert').filter({ hasText: 'nights' }).waitFor();
    await page.getByLabel('Night before', { exact: true }).check();
    await page.getByLabel('Wedding night', { exact: true }).check();
    await next(page); await review(page);
    assert.equal(await page.getByRole('heading', { name: 'Everything look right?', exact: true }).evaluate(el => el === document.activeElement), true, 'Step heading receives keyboard focus');
    assert.match(await page.locator('.rsvp-review').innerText(), /Wedding|Reception/, 'Review shows the selected events');
    await back(page);
    assert.equal(await page.getByLabel('When will you arrive?').inputValue(), 'Day before · evening');
    assert.equal(await page.getByLabel('Night before', { exact: true }).isChecked(), true);
    await next(page);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
    for (const button of await page.locator('.rsvp-actions button:visible').all()) assert.ok(await button.evaluate(el => el.getBoundingClientRect().height >= 44));
    await page.screenshot({ path: path.join(artifacts, `rsvp-qa-review-${width}.png`), fullPage: true });
    await run.finish();
    assert.deepEqual(run.saved[0].travel, { mode: 'train', point: 'Railway station', window: 'Day before · evening' });
    assert.deepEqual(run.saved[0].stay, { manage: false, nights: ['Night before', 'Wedding night'] });
    await run.open(); await run.yes();
    assert.equal(await page.getByLabel('When will you arrive?').inputValue(), 'Day before · evening');
    assert.equal(await page.getByLabel('Wedding night', { exact: true }).isChecked(), true);
  } finally { await run.context.close(); }
});

for (const mode of ['near', 'car', 'bus', 'flight']) test(`${mode} travel and own stay`, async browser => {
  const run = await fixture(browser);
  try {
    await run.open(); await run.yes();
    await run.page.getByLabel(mode === 'near' ? 'I live nearby' : mode[0].toUpperCase() + mode.slice(1), { exact: true }).check();
    if (mode !== 'near') await run.page.getByLabel('When will you arrive?').selectOption('Not sure yet');
    await run.page.getByLabel('No, I will arrange my own stay', { exact: true }).check();
    await next(run.page); await run.finish();
    assert.equal(run.saved[0].travel.mode, mode);
    assert.deepEqual(run.saved[0].stay, { manage: true, nights: [] });
  } finally { await run.context.close(); }
});

test('explicitly undecided stay survives reopening', async browser => {
  const run = await fixture(browser);
  try {
    await run.open(); await run.yes();
    await run.page.getByLabel('I will confirm this later', { exact: true }).check();
    await next(run.page); await run.finish();
    assert.equal(run.saved[0].travel, null); assert.equal(run.saved[0].stay, null);
    await run.open(); await run.yes();
    assert.equal(await run.page.getByLabel('I will confirm this later', { exact: true }).isChecked(), true);
  } finally { await run.context.close(); }
});

test('arrival update preserves each family member’s existing events', async browser => {
  const run = await fixture(browser, { kind: 'family', household: { coming: 'yes', stay: { manage: true, nights: [] } }, people: [guest(21, [id(3)]), guest(22, [id(4)])], functions: [fn(3), fn(4)] });
  try {
    await run.open(); await run.yes(); await next(run.page); await run.finish();
    assert.deepEqual(run.saved[0].attendance, [{ personId: id(21), functionIds: [id(3)] }, { personId: id(22), functionIds: [id(4)] }]);
  } finally { await run.context.close(); }
});

test('changing family events deliberately updates selected guests', async browser => {
  const run = await fixture(browser, { kind: 'family', household: { coming: 'yes', stay: { manage: true, nights: [] } }, people: [guest(21, [id(3)]), guest(22, [id(4)])], functions: [fn(3), fn(4)] });
  try {
    await run.open(); await run.page.getByLabel('Who is replying?').selectOption(id(21));
    await run.page.getByRole('group', { name: 'Which events will you attend?' }).getByLabel('Reception', { exact: true }).uncheck();
    await next(run.page); await next(run.page); await run.finish();
    assert.deepEqual(run.saved[0].attendance.map(p => p.functionIds), [[id(3)], [id(3)]]);
  } finally { await run.context.close(); }
});

test('decline clears attendance, travel and stay but keeps the message', async browser => {
  const run = await fixture(browser, { household: { coming: 'yes', travel: { mode: 'car', window: 'Wedding day · morning' }, stay: { manage: false, nights: ['Wedding night'] }, blessing: 'See you soon' }, people: [guest(21, [id(3)])] });
  try {
    await run.open(); await run.page.getByLabel(/^Sorry,/).check();
    await run.page.getByLabel('Message to the hosts (optional)').fill('Sending our love');
    await next(run.page); await back(run.page);
    assert.equal(await run.page.getByLabel('Message to the hosts (optional)').inputValue(), 'Sending our love');
    await next(run.page); await run.finish();
    assert.equal(run.saved[0].coming, 'no'); assert.deepEqual(run.saved[0].attendance[0].functionIds, []);
    assert.equal(run.saved[0].travel, null); assert.equal(run.saved[0].stay, null);
    await run.open(); assert.equal(await run.page.getByLabel('Message to the hosts (optional)').inputValue(), 'Sending our love');
    await run.page.getByLabel(/^Yes,/).check(); await next(run.page);
    await run.page.getByLabel('I will confirm this later', { exact: true }).check();
    await next(run.page); await run.finish();
    assert.equal(run.saved[1].coming, 'yes'); assert.equal(run.saved[1].blessing, 'Sending our love');
    assert.notEqual(run.saved[0].requestId, run.saved[1].requestId);
  } finally { await run.context.close(); }
});

test('required respondent, answer, guest and event validation', async browser => {
  const run = await fixture(browser, { kind: 'family', people: [guest(21), guest(22)], functions: [fn(3), fn(4)] });
  try {
    const { page } = run; await run.open(); await next(page); await page.getByRole('alert').waitFor();
    await page.getByLabel('Who is replying?').selectOption(id(21)); await next(page); await page.getByRole('alert').waitFor();
    await page.getByLabel(/^Yes,/).check();
    const guests = page.getByRole('group', { name: 'Who is coming?' }), events = page.getByRole('group', { name: 'Which events will you attend?' });
    await guests.getByLabel('Guest 21', { exact: true }).uncheck(); await guests.getByLabel('Guest 22', { exact: true }).uncheck();
    await next(page); await page.getByRole('alert').filter({ hasText: 'at least one guest' }).waitFor();
    await guests.getByLabel('Guest 22', { exact: true }).check();
    await events.getByLabel('Wedding', { exact: true }).uncheck(); await events.getByLabel('Reception', { exact: true }).uncheck();
    await next(page); await page.getByRole('alert').filter({ hasText: 'at least one event' }).waitFor();
    assert.equal(run.attempts.length, 0);
  } finally { await run.context.close(); }
});

test('claim failure, save failure, unchanged retry and double submission', async browser => {
  const run = await fixture(browser);
  try {
    const { page } = run; await run.open(); await run.yes();
    await page.getByLabel('I will confirm this later', { exact: true }).check(); await next(page);
    run.failClaim = true; await send(page); await page.getByRole('alert').filter({ hasText: 'Cannot open' }).waitFor();
    assert.equal(run.attempts.length, 0); assert.ok(page.url().includes('/i/qa-invitation'));
    run.failClaim = false; run.failSave = true;
    await send(page); await page.getByRole('alert').filter({ hasText: 'could not be saved' }).waitFor();
    const first = run.attempts[0];
    run.failSave = false; run.delaySave = 400;
    await page.getByRole('button', { name: /^Send my reply$/ }).evaluate(el => { el.click(); el.click(); });
    await page.waitForURL(origin + '/app');
    assert.equal(run.attempts.length, 2); assert.deepEqual(run.attempts[1], first, 'Retries keep the same request and draft');
    assert.equal(run.saved.length, 1);
  } finally { await run.context.close(); }
});

test('lost response retry adds members only once', async browser => {
  const run = await fixture(browser, { kind: 'family', cap: 2 });
  try {
    const { page } = run; await run.open();
    await page.getByLabel(/^Yes,/).check(); await page.getByRole('button', { name: '+ Add family member', exact: true }).click();
    await page.getByLabel('New family member 1', { exact: true }).fill('Second guest');
    await next(page); await page.getByLabel(/confirm this later$/).check(); await next(page);
    run.loseResponse = true; await send(page); await page.getByRole('alert').waitFor();
    assert.equal(run.committed, true); await run.finish();
    assert.equal(run.attempts.length, 2); assert.equal(run.saved.length, 1); assert.equal(run.bundle.people.length, 2);
  } finally { await run.context.close(); }
});

test('switching invitation links clears the previous family and draft', async browser => {
  const run = await fixture(browser, { kind: 'family', cap: 3 });
  try {
    const { page, context } = run;
    await run.open(); await page.getByLabel(/^Yes,/).check();
    await page.getByRole('button', { name: '+ Add family member', exact: true }).click();
    await page.getByLabel('New family member 1', { exact: true }).fill('First family draft');
    await next(page);
    await context.route('**/rest/v1/rpc/invite_bundle', route => route.request().postDataJSON().p_token === 'other-invitation'
      ? json(route, { ...run.bundle, household: { ...run.bundle.household, name: 'Different family' }, people: [guest(25)] }) : json(route, null));
    await page.evaluate(() => { history.pushState({}, '', '/i/other-invitation'); dispatchEvent(new PopStateEvent('popstate')); });
    await page.getByText('Different family', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Will you join us?', exact: true }).waitFor();
    await page.getByLabel(/^Yes,/).check();
    assert.equal(await page.locator('.rsvp-added-member').count(), 0, 'New invitation has no draft members from the previous family');
    await page.evaluate(() => { history.pushState({}, '', '/i/invalid-invitation'); dispatchEvent(new PopStateEvent('popstate')); });
    await page.getByRole('heading', { name: 'Invitation unavailable', exact: true }).waitFor();
    assert.equal(await page.getByText('Different family', { exact: true }).count(), 0);
  } finally { await run.context.close(); }
});

test('a changed reply after a lost response offers a safe reload', async browser => {
  const run = await fixture(browser);
  try {
    const { page, context } = run; await run.open(); await run.yes();
    await page.getByLabel('I will confirm this later', { exact: true }).check(); await next(page);
    run.loseResponse = true; await send(page); await page.getByRole('alert').waitFor();
    await context.route('**/rest/v1/rpc/save_rsvp', route => json(route, { message: 'This reply was already received. Reopen your invitation before making further changes.' }, 400));
    await back(page); await back(page); await page.getByLabel(/^Sorry,/).check(); await next(page); await send(page);
    await page.getByRole('alert').filter({ hasText: 'already received' }).waitFor();
    await page.getByRole('link', { name: 'Reload saved reply', exact: true }).click();
    await page.getByRole('heading', { name: 'Will you join us?', exact: true }).waitFor();
    assert.equal(await page.getByLabel(/^Yes,/).isChecked(), true, 'The saved reply is restored instead of pretending the changed retry succeeded');
  } finally { await run.context.close(); }
});

test('a slow old invitation cannot replace the newly opened invitation', async browser => {
  const run = await fixture(browser);
  let release;
  try {
    const { page, context } = run;
    const pending = new Promise(resolve => { release = resolve; });
    let started;
    const requested = new Promise(resolve => { started = resolve; });
    await context.route('**/rest/v1/rpc/invite_bundle', async route => {
      if (route.request().postDataJSON().p_token === 'slow-invitation') { started(); await pending; return json(route, run.bundle); }
      return json(route, { ...run.bundle, household: { ...run.bundle.household, name: 'Newest invitation' } });
    });
    await page.goto(origin + '/i/slow-invitation'); await requested;
    await page.evaluate(() => { history.pushState({}, '', '/i/new-invitation'); dispatchEvent(new PopStateEvent('popstate')); });
    await page.getByText('Newest invitation', { exact: true }).waitFor();
    const response = page.waitForResponse(r => r.url().endsWith('/rpc/invite_bundle') && r.request().postDataJSON().p_token === 'slow-invitation');
    release(); await response;
    assert.equal(await page.getByText('Newest invitation', { exact: true }).count(), 1);
  } finally { release?.(); await run.context.close(); }
});

test('a pending claim from an old invitation cannot submit the new invitation', async browser => {
  const run = await fixture(browser);
  let release;
  try {
    const { page, context } = run; await run.open(); await run.yes();
    await page.getByLabel('I will confirm this later', { exact: true }).check(); await next(page);
    let started;
    const requested = new Promise(resolve => { started = resolve; });
    const pending = new Promise(resolve => { release = resolve; });
    await context.route('**/rest/v1/rpc/claim_person', async route => { started(); await pending; return json(route, id(21)); });
    await send(page); await requested;
    await page.evaluate(() => { history.pushState({}, '', '/i/new-invitation'); dispatchEvent(new PopStateEvent('popstate')); });
    await page.getByRole('heading', { name: 'Will you join us?', exact: true }).waitFor();
    const response = page.waitForResponse(r => r.url().endsWith('/rpc/claim_person'));
    release(); await response;
    // Allow the SDK to consume the completed response before asserting no save.
    await page.waitForTimeout(150);
    assert.equal(run.attempts.length, 0); assert.ok(page.url().endsWith('/i/new-invitation'));
  } finally { release?.(); await run.context.close(); }
});

for (const failure of ['invalid link', 'server error', 'empty guest list']) test(failure, async browser => {
  const run = await fixture(browser);
  try {
    await run.context.route('**/rest/v1/rpc/invite_bundle', route => failure === 'invalid link' ? json(route, null)
      : failure === 'server error' ? json(route, { message: 'Temporary invitation error. Please retry.' }, 503) : json(route, { ...run.bundle, people: [] }));
    await run.page.goto(origin + '/i/broken-link');
    await run.page.getByRole('heading', { name: 'Invitation unavailable', exact: true }).waitFor();
    await run.page.getByRole('alert').waitFor();
    assert.equal(await run.page.getByRole('button', { name: /^Continue/ }).count(), 0);
    await run.page.getByRole('link', { name: 'Find my family', exact: true }).waitFor();
  } finally { await run.context.close(); }
});

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  try {
    for (const { name, run } of tests.filter(t => !process.env.QA_FILTER || t.name.includes(process.env.QA_FILTER))) {
      const start = Date.now();
      try { await run(browser); results.push({ name, status: 'passed', ms: Date.now() - start }); console.log('PASS: ' + name); }
      catch (error) { results.push({ name, status: 'failed', error: error.message, ms: Date.now() - start }); console.error('FAIL: ' + name + '\n' + error.message); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(artifacts, 'rsvp-qa-results.json'), JSON.stringify(results, null, 2)); }
  const failures = results.filter(t => t.status === 'failed');
  console.log(`${results.length - failures.length}/${results.length} RSVP QA scenarios passed`);
  if (failures.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
