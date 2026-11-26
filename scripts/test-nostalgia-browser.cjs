// Real local photos and UI; backend requests use the existing isolated fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'); }
catch { playwright = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core')); }
const { scenario, origin } = require('./test-wedding-browser.cjs');
const artifacts = path.resolve(__dirname, '../artifacts');
const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const width of [320, 390, 768, 1024, 1440]) {
      const run = await scenario(browser, { width, initial: 'google' });
      const { page } = run;
      try {
        const failedPhotos = [];
        page.on('response', response => { if (response.url().includes('/images/nostalgia/') && !response.ok()) failedPhotos.push(response.url()); });
        await page.goto(origin + '/invitation/nostalgia');
        await page.getByRole('heading', { name: 'Before We Said Yes', exact: true }).waitFor();
        assert.equal(await page.locator('.nostalgia-memory').count(), 13);
        assert.equal(await page.getByRole('button', { name: 'Continue with Google' }).count(), 0, 'Albums are available without sign-in');
        assert.ok(await fits(page), `${width}px page fits`);
        await page.evaluate(() => document.fonts.ready);
        await page.locator('.nostalgia-cover img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
        assert.ok(await page.locator('.nostalgia-cover img').evaluateAll(async images => {
          const widths = await Promise.all(images.map(async image => { const source = new Image(); source.src = image.currentSrc; await source.decode(); return source.naturalWidth; }));
          return widths.every(width => width >= 480);
        }), 'Cover portraits contain real display-size images');
        await page.screenshot({ path: path.join(artifacts, `nostalgia-${width}.png`) });

        // Load every album photo, including images initially below the fold.
        const pictures = await page.locator('.nostalgia-memory img').evaluateAll(images => images.map(image => ({ src: image.src, alt: image.alt })));
        assert.equal(new Set(pictures.map(image => image.src)).size, 13);
        if (width === 320) {
          const dimensions = await page.locator('.nostalgia-memory img').evaluateAll(async images => {
            const results = [];
            for (const image of images) {
              for (const size of [480, 960, null]) {
                const source = image.src.replace(/-960\.jpg$/, size ? `-${size}.jpg` : '.jpg');
                const display = new Image(); display.src = source; await display.decode();
                results.push({ source, width: display.naturalWidth, height: display.naturalHeight, expectedWidth: size || Number(image.getAttribute('width')) });
              }
            }
            return results;
          });
          for (const image of dimensions) assert.equal(image.width, image.expectedWidth, `Generated photo size: ${image.source}`);
          console.log('PASS: all 39 display images decode at their intended dimensions');
        }
        for (const picture of pictures) {
          assert.ok(picture.alt.length > 20);
          const response = await run.context.request.get(picture.src);
          assert.equal(response.status(), 200, picture.src);
          assert.match(response.headers()['content-type'], /image\/jpeg/);
        }

        const filters = page.getByRole('group', { name: 'Filter childhood albums' });
        await filters.getByRole('button', { name: 'Anand', exact: true }).click();
        assert.equal(await page.locator('.nostalgia-memory').count(), 6);
        assert.equal(await page.locator('.nostalgia-chapter').count(), 1);
        assert.match(await page.getByRole('status').textContent(), /6 memories/);
        await filters.getByRole('button', { name: 'Susmita', exact: true }).click();
        assert.equal(await page.locator('.nostalgia-memory').count(), 7);
        const opener = page.getByRole('button', { name: 'Open Susmita: A little sunshine', exact: true });
        await opener.click();
        const viewer = page.getByRole('dialog');
        await viewer.waitFor();
        assert.equal(await viewer.evaluate(dialog => dialog.open && dialog.matches(':modal')), true, 'Viewer is modal above the mobile navigation');
        assert.equal(await page.getByRole('button', { name: 'Close photo viewer' }).evaluate(button => button === document.activeElement), true);
        await viewer.locator('.nostalgia-viewer-stage img').evaluate(image => image.decode());
        assert.ok(await viewer.locator('.nostalgia-viewer-stage img').evaluate(image => image.naturalWidth > image.naturalHeight), 'Sideways photo is upright in its display copy');
        assert.equal(await viewer.locator('.nostalgia-filmstrip button').count(), 7, 'Viewer follows the selected album');
        assert.equal(await viewer.locator('.nostalgia-filmstrip [aria-pressed="true"]').count(), 1);
        assert.ok(await viewer.evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'Viewer has no horizontal overflow');
        await page.screenshot({ path: path.join(artifacts, `nostalgia-viewer-${width}.png`) });
        await viewer.getByRole('button', { name: 'Next photo', exact: true }).click();
        await viewer.getByRole('heading', { name: 'A small, furry friend', exact: true }).waitFor();
        await page.keyboard.press('ArrowLeft');
        await viewer.getByRole('heading', { name: 'A little sunshine', exact: true }).waitFor();
        await page.keyboard.press('Home');
        await viewer.getByRole('heading', { name: 'A little flower girl', exact: true }).waitFor();
        await viewer.getByRole('button', { name: 'Previous photo', exact: true }).click();
        await viewer.getByRole('heading', { name: 'Her moment at the mic', exact: true }).waitFor();
        await page.keyboard.press('ArrowRight');
        await viewer.getByRole('heading', { name: 'A little flower girl', exact: true }).waitFor();
        await viewer.getByRole('button', { name: 'View Susmita: A balcony kind of afternoon', exact: true }).click();
        await viewer.getByRole('heading', { name: 'A balcony kind of afternoon', exact: true }).waitFor();
        if (width < 768) {
          const stage = viewer.locator('.nostalgia-viewer-stage');
          const box = await stage.boundingBox();
          const client = await run.context.newCDPSession(page);
          const y = box.y + box.height / 2;
          await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * .8, y }] });
          await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * .2, y }] });
          await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await client.detach();
          await viewer.getByRole('heading', { name: 'A little sunshine', exact: true }).waitFor();
        }
        await page.keyboard.press('Escape');
        await viewer.waitFor({ state: 'detached' });
        assert.equal(await opener.evaluate(button => button === document.activeElement), true, 'Closing returns focus to the opened photo');
        assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'Closing restores page scroll');

        // A hero portrait always opens both albums, even after filtering.
        await page.getByRole('button', { name: 'Open Anand’s childhood portrait', exact: true }).click();
        await viewer.waitFor();
        assert.equal(await viewer.locator('.nostalgia-filmstrip button').count(), 13);
        await viewer.getByRole('button', { name: 'Close photo viewer' }).click();
        assert.equal(await page.locator('.nostalgia-memory').count(), 13);

        if (width === 320 || width === 1440) {
          await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
          assert.ok(await fits(page), 'Layout supports 200% zoom');
          await page.evaluate(() => { document.documentElement.style.zoom = ''; });
        }
        assert.deepEqual(failedPhotos, []);
        assert.deepEqual(run.errors, []);
        console.log(`PASS: ${width}px public albums, image loading, filters, modal navigation, keyboard and focus restoration`);
      } finally { await run.context.close(); }
    }

    const family = await scenario(browser, { width: 390, family: true });
    try {
      await family.page.goto(origin + '/app/nostalgia');
      await family.page.getByRole('heading', { name: 'Before We Said Yes', exact: true }).waitFor();
      assert.equal(await family.page.locator('.nostalgia-memory').count(), 13);
      assert.equal(await family.page.getByRole('link', { name: 'Back to the invitation' }).getAttribute('href'), '/app');
      console.log('PASS: linked families get the same albums and return to their invitation');
    } finally { await family.context.close(); }

    const hidden = await scenario(browser, { customSections: { nostalgia: false } });
    try {
      await hidden.page.goto(origin + '/invitation/nostalgia');
      await hidden.page.waitForURL(origin + '/invitation');
      assert.equal(await hidden.page.locator('.nostalgia-page').count(), 0);
      console.log('PASS: host visibility setting still hides Nostalgia');
    } finally { await hidden.context.close(); }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
