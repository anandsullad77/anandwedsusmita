// Real gallery/viewer with isolated Supabase fixtures; no live reactions or reports.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'); }
catch { playwright = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core')); }
const { scenario, wait, origin, id } = require('./test-wedding-browser.cjs');
const artifacts = path.resolve(__dirname, '../artifacts');
const root = path.resolve(__dirname, '..');
const empty = () => ({ akshate: 0, love: 0, wow: 0, celebrate: 0 });
const json = (route, value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const fits = locator => locator.evaluate(element => {
  const r = element.getBoundingClientRect();
  return r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1;
});

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  try {
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
      const touchScreen = Math.min(viewport.width, viewport.height) < 768;
      const run = await scenario(browser, { width: Math.min(viewport.width, viewport.height), initial: 'google' });
      const { page, context } = run;
      try {
        await page.setViewportSize(viewport);
        const photos = [run.photos.find(photo => photo.id === id(31)), run.photos.find(photo => photo.id === id(32)), run.photos.find(photo => photo.id === id(33))];
        run.photos.splice(0, run.photos.length, ...photos);
        const portrait = fs.readFileSync(path.join(root, 'public/images/nostalgia/anand-little-gentleman.jpg'));
        const landscape = fs.readFileSync(path.join(root, 'public/images/nostalgia/anand-family.jpg'));
        await context.route(url => url.pathname.startsWith('/storage/v1/object/sign/photos/'), route => {
          const portraitPhoto = route.request().url().includes('/31.webp');
          return route.fulfill({ status: 200, contentType: 'image/jpeg', body: portraitPhoto ? portrait : landscape });
        });
        const mine = new Map();
        let fail = false;
        await context.route(url => url.pathname.endsWith('/rpc/photo_reaction_summary'), route => json(route, route.request().postDataJSON().p_photos.map(photoId => {
          const counts = empty(), reaction = mine.get(photoId) ?? null;
          if (reaction) counts[reaction]++;
          return { photoId, counts, mine: reaction };
        })));
        await context.route(url => url.pathname.endsWith('/rpc/set_photo_reaction'), route => {
          if (fail) return json(route, { message: 'Reaction could not be saved' }, 503);
          const body = route.request().postDataJSON();
          mine.set(body.p_photo, body.p_reaction);
          return json(route, null);
        });

        await page.goto(origin + '/invitation/feed');
        const opener = page.locator('.gallery-tile').first();
        await opener.click();
        const viewer = page.getByRole('dialog', { name: 'Photo viewer', exact: true });
        await viewer.waitFor();
        const photo = () => viewer.locator('.photo-viewer-slide[aria-hidden=false] img');
        const trigger = () => viewer.locator('.reaction-trigger');
        const picker = () => page.getByRole('menu', { name: 'Choose a photo reaction', exact: true });
        const selected = number => wait(async () => await viewer.locator('.photo-viewer-track').evaluate((element, index) => Math.abs(element.scrollTop / element.clientHeight - index) < .01, number - 1), `Photo ${number} snaps into place`);
        const swipe = async direction => {
          const vertical = direction === 'up' || direction === 'down';
          const forward = direction === 'up' || direction === 'left';
          const from = { x: viewport.width * (vertical ? .5 : forward ? .8 : .2), y: viewport.height * (vertical ? forward ? .65 : .25 : .5) };
          const to = { x: viewport.width * (vertical ? .5 : forward ? .2 : .8), y: viewport.height * (vertical ? forward ? .05 : .85 : .5) };
          const client = await context.newCDPSession(page);
          try {
            await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
            for (let step = 1; step <= 8; step++) {
              await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * step / 8, y: from.y + (to.y - from.y) * step / 8 }] });
              await page.waitForTimeout(20);
            }
            await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          } finally { await client.detach(); }
        };
        const assertPhotoFits = async () => {
          await photo().evaluate(image => image.decode());
          assert.ok(await fits(photo()), 'Entire photo frame fits the visible screen');
          assert.equal(await photo().evaluate(image => getComputedStyle(image).objectFit), 'contain', 'Photo retains every edge');
          assert.ok(await viewer.evaluate(element => element.scrollHeight <= element.clientHeight + 1), 'Viewer has no vertical clipping');
        };
        await assertPhotoFits();
        assert.equal(await photo().evaluate(image => image.naturalWidth < image.naturalHeight), true, 'Portrait fixture is active');
        assert.equal(await trigger().count(), 1, 'Only one reaction control is shown');
        assert.equal(await picker().count(), 0);
        assert.equal(await viewer.getByRole('menuitem', { name: 'Save to phone' }).count(), 0, 'Save stays inside the closed options menu');
        assert.equal(await viewer.locator('.photo-viewer-info').evaluate(element => getComputedStyle(element).position), 'absolute', 'Caption overlays the photo without taking away image space');
        assert.equal(await viewer.locator('.photo-viewer-info').evaluate(element => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)', 'Name and caption have a transparent background');
        await page.screenshot({ path: path.join(artifacts, `photo-viewer-${viewport.width}.png`) });

        if (touchScreen) {
          await swipe('down'); await selected(1);
          await swipe('up'); await selected(2);
          assert.equal(await photo().getAttribute('alt'), 'Memory 32', 'Swipe updates the selected photo');
          assert.equal(await viewer.locator('.photo-viewer-caption').textContent(), 'Memory 32', 'Caption follows the swiped photo');
          await swipe('up'); await selected(3);
          await swipe('up'); await selected(3);
          await swipe('down'); await selected(2);
          await swipe('down'); await selected(1);
          await swipe('left'); await selected(2);
          await swipe('right'); await selected(1);
          assert.equal(await viewer.locator('.photo-viewer-top,.photo-viewer-info').count(), 2, 'Swipes preserve the overlay controls');
        } else {
          await page.mouse.move(viewport.width / 2, viewport.height / 2);
          await page.mouse.wheel(0, viewport.height * .75); await selected(2);
          await page.mouse.wheel(0, -viewport.height * .75); await selected(1);
        }
        await page.keyboard.press('ArrowDown'); await selected(2);
        await page.keyboard.press('ArrowUp'); await selected(1);

        await trigger().click();
        await picker().waitFor();
        await wait(async () => await picker().getByRole('menuitemradio', { name: 'Blessings', exact: true }).evaluate(element => element === document.activeElement), 'Opening focuses the first reaction');
        assert.equal(await picker().getByRole('menuitemradio').count(), 4);
        assert.ok(await fits(picker()), 'Reaction choices fit on screen');
        assert.ok(await picker().evaluate(element => {
          const r = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }), 'Picker appears above the full-screen viewer');
        await page.keyboard.press('ArrowRight');
        assert.match(await viewer.locator('.photo-viewer-top').innerText(), /1 of 3 photos/, 'Picking a reaction does not navigate the photo');
        await page.keyboard.press('Enter');
        await wait(async () => mine.get(id(31)) === 'love' && !(await trigger().isDisabled()), 'Love saved for first photo');
        assert.equal(await trigger().getAttribute('aria-label'), 'Your reaction: Love. Change reaction');
        await trigger().click();
        await picker().getByRole('menuitemradio', { name: 'Love', exact: true }).click();
        await wait(async () => mine.get(id(31)) === null && !(await trigger().isDisabled()), 'Selecting again removes the reaction');
        fail = true;
        await trigger().click();
        await picker().getByRole('menuitemradio', { name: 'Wow', exact: true }).click();
        await viewer.getByRole('alert').filter({ hasText: 'Reaction could not be saved' }).waitFor();
        assert.equal(await trigger().getAttribute('aria-label'), 'React to this photo', 'Failed reaction rolls back');
        fail = false;
        await trigger().click();
        await page.keyboard.press('Escape');
        assert.equal(await picker().count(), 0);
        assert.equal(await viewer.count(), 1, 'Escape dismisses reaction choices before closing the viewer');

        await viewer.getByRole('button', { name: 'Next photo', exact: true }).click();
        await wait(async () => /2 of 3 photos/.test(await viewer.locator('.photo-viewer-top').innerText()), 'Next photo selected');
        await assertPhotoFits();
        assert.equal(await photo().evaluate(image => image.naturalWidth > image.naturalHeight), true, 'Landscape fixture is active');
        assert.equal(await viewer.getByRole('alert').count(), 0, 'Previous photo errors do not carry over');
        await trigger().click();
        await picker().getByRole('menuitemradio', { name: 'Celebrate', exact: true }).click();
        await wait(async () => mine.get(id(32)) === 'celebrate' && !(await trigger().isDisabled()), 'Reaction belongs to the selected photo');
        assert.equal(mine.get(id(31)), null);

        const more = viewer.getByRole('button', { name: 'More options', exact: true });
        await more.click();
        const options = viewer.getByRole('menu', { name: 'Photo options', exact: true });
        assert.ok(await fits(options));
        const downloadEvent = page.waitForEvent('download');
        await options.getByRole('menuitem', { name: 'Save to phone', exact: true }).click();
        const download = await downloadEvent;
        assert.match(download.suggestedFilename(), /\.jpg$/);
        const chunks = [];
        for await (const chunk of await download.createReadStream()) chunks.push(chunk);
        assert.equal(hash(Buffer.concat(chunks)), hash(landscape), 'Save downloads the current original photo');
        assert.equal(await options.count(), 0);
        await more.focus();
        await more.press('ArrowDown');
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await wait(() => run.reports.length === 1, 'Report still works from the menu');
        assert.equal(run.reports[0].p_photo, id(32));

        await viewer.getByRole('button', { name: 'Hide photo controls', exact: true }).click();
        assert.equal(await viewer.locator('.photo-viewer-top,.photo-viewer-info').count(), 0, 'A tap reveals the unobstructed image');
        if (touchScreen) {
          await swipe('up'); await selected(3);
          await swipe('down'); await selected(2);
          assert.equal(await viewer.locator('.photo-viewer-top,.photo-viewer-info').count(), 0, 'Swiping also works with controls hidden');
        }
        await viewer.getByRole('button', { name: 'Show photo controls', exact: true }).click();
        await more.waitFor();
        await page.setViewportSize({ width: viewport.height, height: viewport.width });
        await wait(async () => {
          const geometry = await viewer.locator('.photo-viewer-track').evaluate(element => ({ index: element.scrollTop / element.clientHeight, height: element.clientHeight }));
          return Math.abs(geometry.index - 1) < .01 && geometry.height === viewport.width;
        }, 'Rotation keeps the selected photo aligned');
        await assertPhotoFits();
        await viewer.getByRole('button', { name: 'Close', exact: true }).click();
        assert.equal(await viewer.count(), 0);
        assert.equal(await opener.evaluate(element => element === document.activeElement), true, 'Closing restores focus');
        assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'Page scrolling is restored');
        assert.deepEqual(run.errors, []);
        console.log(`PASS ${viewport.width}x${viewport.height}: vertical/horizontal swipes or wheel, keyboard, photo boundaries, hidden controls, reactions, download/report and rotation`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
