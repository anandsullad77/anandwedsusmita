const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'); }
catch { playwright = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core')); }
const { scenario, origin, wait, eventId, id } = require('./test-wedding-browser.cjs');
const results = [], tests = [];
const test = (name, run) => tests.push({ name, run });
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const close = async context => { await context.unrouteAll({ behavior: 'ignoreErrors' }); await context.close(); };
const scale = async (page, client, value) => { await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: value }); await wait(() => page.evaluate(expected => Math.abs(visualViewport.scale - expected) < .01, value), 'Browser zoom changes'); await frames(page); };
async function pan(client, vertical = false) {
  const start = { x: vertical ? 195 : 300, y: vertical ? 650 : 400 };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  for (let i = 1; i <= 8; i++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x - (vertical ? 0 : i * 22), y: start.y - (vertical ? i * 40 : 0) }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function touchSwipe(stage, multi = false) {
  await stage.evaluate((el, multi) => {
    const first = new Touch({ identifier: 1, target: el, clientX: 240, clientY: 200 });
    const end = new Touch({ identifier: 1, target: el, clientX: 80, clientY: 200 });
    const second = new Touch({ identifier: 2, target: el, clientX: 280, clientY: 200 });
    const emit = (type, touches, changedTouches = touches) => el.dispatchEvent(new TouchEvent(type, { touches, targetTouches: touches, changedTouches, bubbles: true }));
    emit('touchstart', [first]);
    if (multi) { emit('touchstart', [first, second], [second]); emit('touchmove', [first, second]); emit('touchend', [first], [second]); }
    emit('touchmove', [end]); emit('touchend', [], [end]);
  }, multi);
}

test('gallery: 200% and 300% zoom pans without changing photos, then swipes resume', async browser => {
  const run = await scenario(browser, { initial: 'google', mobile: true });
  const { page, context } = run;
  try {
    const client = await context.newCDPSession(page);
    await page.goto(origin + '/invitation/feed'); await page.locator('.gallery-tile').nth(1).click();
    const viewer = page.getByRole('dialog', { name: 'Photo viewer', exact: true });
    const position = viewer.locator('.photo-viewer-position');
    const initial = await position.innerText();
    for (const value of [2, 3]) {
      await scale(page, client, value);
      const beforePan = await page.evaluate(() => visualViewport.offsetLeft);
      await pan(client); await frames(page);
      if (value === 2) assert.ok(await page.evaluate(before => visualViewport.offsetLeft > before + 2, beforePan), 'The browser actually pans across the enlarged photo');
      assert.equal(await position.innerText(), initial, 'Horizontal panning keeps the same photo');
      await pan(client, true); await frames(page);
      assert.equal(await position.innerText(), initial, 'Vertical panning keeps the same photo');
      assert.equal(await viewer.locator('.photo-viewer-track').evaluate(el => getComputedStyle(el).touchAction), 'auto', 'Native zoomed panning is unrestricted');
    }
    for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 900 }]) {
      await page.setViewportSize(viewport); await frames(page);
      await wait(() => viewer.locator('.photo-viewer-track').evaluate(el => Math.abs(el.scrollTop / el.clientHeight - 1) < .01), 'Rotation keeps the same photo aligned while magnified');
      assert.equal(await position.innerText(), initial);
    }
    await scale(page, client, 1);
    await touchSwipe(viewer.locator('.photo-viewer-track'), true); await frames(page);
    assert.equal(await position.innerText(), initial, 'A two-finger gesture never becomes a photo swipe or a tap');
    await pan(client); await wait(async () => (await position.innerText()) !== initial, 'Normal photo swipes resume after zooming out');
    await scale(page, client, 2); await page.keyboard.press('Escape');
    assert.equal(await viewer.count(), 0); assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    assert.deepEqual(run.errors, []);
  } finally { await close(context); }
});

test('childhood photo viewer: zoomed pans and two-finger gestures preserve the memory', async browser => {
  const run = await scenario(browser, { initial: 'google', mobile: true });
  const { page, context } = run;
  try {
    const client = await context.newCDPSession(page);
    await page.goto(origin + '/invitation/nostalgia'); await page.locator('.nostalgia-tile').first().click();
    const viewer = page.locator('.nostalgia-viewer'), stage = viewer.locator('.nostalgia-viewer-stage');
    const title = await viewer.locator('h2').innerText();
    for (const value of [2, 3]) {
      await scale(page, client, value); await touchSwipe(stage); await frames(page);
      assert.equal(await viewer.locator('h2').innerText(), title, 'Panning a magnified memory keeps the same image');
      assert.equal(await stage.evaluate(el => getComputedStyle(el).touchAction), 'auto');
    }
    await scale(page, client, 1); await touchSwipe(stage, true); await frames(page);
    assert.equal(await viewer.locator('h2').innerText(), title, 'Lifting one finger after a pinch cannot change the photo');
    await touchSwipe(stage); await wait(async () => (await viewer.locator('h2').innerText()) !== title, 'Normal memory swipe resumes');
    await viewer.getByRole('button', { name: 'Previous photo', exact: true }).click();
    assert.equal(await viewer.locator('h2').innerText(), title);
    await page.keyboard.press('ArrowRight'); await wait(async () => (await viewer.locator('h2').innerText()) !== title, 'Memory keyboard navigation resumes');
    await scale(page, client, 2); await page.keyboard.press('Escape'); assert.equal(await viewer.count(), 0);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    assert.deepEqual(run.errors, []);
  } finally { await close(context); }
});

for (const route of ['/invitation', '/i/zoom-test']) test(`${route}: mobile page zoom and desktop reflow preserve layout and form state`, async browser => {
  const run = await scenario(browser, { initial: 'anonymous', mobile: true });
  const { page, context } = run;
  try {
    if (route.startsWith('/i/')) await context.route('**/rest/v1/rpc/invite_bundle', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ event: { id: eventId, slug: 'anand-susmita', coupleA: 'Anand', coupleB: 'Susmita', startsAt: '2026-11-29T12:28:00+05:30', theme: {} }, household: { id: id(20), name: 'Zoom guest', invitationType: 'individual', cap: 1, coming: null, travel: null, stay: null }, people: [{ id: id(21), name: 'Zoom guest', attending: [] }], functions: [{ id: id(3), nameEn: 'Wedding' }] }) }));
    await page.goto(origin + route);
    await page.locator(route.startsWith('/i/') ? '.rsvp-card h2' : '.general-nav').waitFor();
    const client = await context.newCDPSession(page);
    const viewport = await page.locator('meta[name=viewport]').getAttribute('content');
    assert.ok(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1\b/.test(viewport), 'Browser magnification remains available');
    if (route.startsWith('/i/')) await page.getByLabel('Yes, I will be there', { exact: true }).check();
    for (const value of [2, 3]) {
      await scale(page, client, value);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Zoom does not inflate the layout width');
      if (route.startsWith('/i/')) assert.equal(await page.getByLabel('Yes, I will be there', { exact: true }).isChecked(), true);
    }
    await scale(page, client, 1);
    for (const width of [720, 360]) {
      await page.setViewportSize({ width, height: 600 }); await frames(page);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px reflow fits`);
    }
    if (route.startsWith('/i/')) {
      await page.getByRole('button', { name: /^Continue/ }).click();
      await page.getByRole('heading', { name: 'Let’s plan your visit.', exact: true }).waitFor();
    }
    assert.deepEqual(run.errors, []);
  } finally { await close(context); }
});

(async () => {
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  try {
    for (const { name, run } of tests) {
      try { await run(browser); results.push({ name, passed: true }); console.log('PASS: ' + name); }
      catch (error) { results.push({ name, passed: false, error: error.message }); console.error('FAIL: ' + name + '\n' + error.message); }
    }
  } finally { await browser.close(); fs.mkdirSync(path.resolve(__dirname, '../artifacts'), { recursive: true }); fs.writeFileSync(path.resolve(__dirname, '../artifacts/zoom-qa-results.json'), JSON.stringify(results, null, 2)); }
  if (results.some(r => !r.passed)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
