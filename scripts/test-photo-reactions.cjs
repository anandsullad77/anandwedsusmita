const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'); }
catch { playwright = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core')); }
const { scenario, wait, origin, id, eventId } = require('./test-wedding-browser.cjs');
const artifacts = path.resolve(__dirname, '../artifacts');
const kinds = ['akshate', 'love', 'wow', 'celebrate'];
const labels = ['Blessings', 'Love', 'Wow', 'Celebrate'];
const empty = () => ({ akshate: 0, love: 0, wow: 0, celebrate: 0 });
const json = (route, value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  const runs = [];
  try {
    for (const width of [1440, 390, 320]) {
      const run = await scenario(browser, { width, initial: 'google' }); runs.push(run);
      const { page, context } = run;
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const mine = new Map(), writes = [];
      let fail = false, delayed = false, release, delaySummary = false, releaseSummary;
      await context.route(url => url.pathname.endsWith('/rpc/photo_reaction_summary'), async route => {
        const { p_photos } = route.request().postDataJSON();
        const snapshot = p_photos.map(photoId => {
          const counts = photoId === id(31) ? { ...empty(), akshate: 1, love: 1 } : empty();
          if (mine.get(photoId)) counts[mine.get(photoId)]++;
          return { photoId, counts, mine: mine.get(photoId) ?? null };
        });
        if (delaySummary) await new Promise(resolve => { releaseSummary = resolve; });
        return json(route, snapshot);
      });
      await context.route(url => url.pathname.endsWith('/rpc/set_photo_reaction'), async route => {
        const body = route.request().postDataJSON(); writes.push(body);
        assert.ok(kinds.includes(body.p_reaction) || body.p_reaction === null);
        if (fail) return json(route, { message: 'Reaction could not be saved' }, 503);
        if (delayed) await new Promise(resolve => { release = resolve; });
        mine.set(body.p_photo, body.p_reaction);
        return json(route, null);
      });
      await page.goto(origin + '/invitation/feed');
      const post = page.locator('.feed-post[data-post-type=photos]').first();
      const trigger = () => post.locator('.reaction-trigger');
      const picker = () => page.getByRole('menu', { name: 'Choose a photo reaction', exact: true });
      await trigger().waitFor();
      assert.equal(await trigger().getAttribute('aria-label'), 'React to this photo');
      await trigger().click();
      assert.equal(await picker().getByRole('menuitemradio').count(), 4);
      assert.deepEqual(await picker().getByRole('menuitemradio').evaluateAll(items => items.map(el => el.getAttribute('aria-label'))), labels);
      assert.ok(await picker().evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), 'Picker fits within the viewport');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.waitForTimeout(180);
      await page.screenshot({ path: path.join(artifacts, `photo-reactions-picker-${width}.png`) });
      await page.keyboard.press('Escape');
      assert.equal(await picker().count(), 0);
      assert.equal(await trigger().evaluate(el => el === document.activeElement), true);
      for (const [index, kind] of kinds.entries()) {
        await trigger().click();
        await picker().getByRole('menuitemradio', { name: labels[index], exact: true }).click();
        await wait(async () => mine.get(id(31)) === kind && !(await trigger().isDisabled()), 'Reaction saved');
        assert.equal(await trigger().getAttribute('aria-label'), `Your reaction: ${labels[index]}. Change reaction`);
        assert.match(await post.locator('.reaction-summary').getAttribute('aria-label'), new RegExp(labels[index]));
        assert.equal(await post.locator('.reaction-summary').innerText().then(text => text.trim().slice(-1)), '3', 'Switching maintains one choice per guest');
        const effect = post.locator(`.reaction-effect[data-reaction=${kind}]`);
        await effect.waitFor();
        assert.ok(await effect.evaluate(el => getComputedStyle(el).pointerEvents === 'none'), 'Effects never block swiping');
        assert.notEqual(await effect.locator('.reaction-center').evaluate(el => getComputedStyle(el).animationName), 'none');
        if (width === 390) await post.locator('.carousel-photo-surface').screenshot({ path: path.join(artifacts, `photo-reaction-effect-${kind}.png`) });
      }
      await trigger().click(); await picker().getByRole('menuitemradio', { name: 'Celebrate', exact: true }).click();
      await wait(async () => mine.get(id(31)) === null && !(await trigger().isDisabled()), 'Reaction removed');
      assert.equal(await trigger().getAttribute('aria-label'), 'React to this photo');
      assert.equal(await post.locator('.reaction-effect').count(), 0);
      assert.match(await post.locator('.reaction-summary').getAttribute('aria-label'), /1 Blessings, 1 Love/);

      // Arrow-key navigation and Enter select the same four choices.
      await trigger().focus(); await trigger().press('ArrowDown');
      await wait(async () => await picker().getByRole('menuitemradio', { name: 'Blessings', exact: true }).evaluate(el => el === document.activeElement), 'Arrow key focuses the first reaction');
      await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
      await wait(async () => mine.get(id(31)) === 'love' && !(await trigger().isDisabled()), 'Keyboard reaction saved');
      await wait(async () => await trigger().evaluate(el => el === document.activeElement), 'Focus returns after saving');

      // A background refresh begun before a reaction must not revert its result.
      delaySummary = true; releaseSummary = null;
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await wait(() => !!releaseSummary, 'Background reaction read is pending');
      await trigger().click(); await picker().getByRole('menuitemradio', { name: 'Celebrate', exact: true }).click();
      await wait(async () => mine.get(id(31)) === 'celebrate' && !(await trigger().isDisabled()), 'New reaction saved before the old read');
      const oldRead = page.waitForResponse(response => response.url().endsWith('/rpc/photo_reaction_summary'));
      delaySummary = false; releaseSummary(); await oldRead; await page.waitForTimeout(100);
      assert.equal(await trigger().getAttribute('aria-label'), 'Your reaction: Celebrate. Change reaction', 'A late background response preserves the newer selection');

      // The request is bound to the original image while the carousel moves.
      delayed = true; release = null;
      await trigger().click();
      const before = writes.length;
      await picker().getByRole('menuitemradio', { name: 'Wow', exact: true }).evaluate(el => { el.click(); el.click(); });
      await wait(() => !!release, 'Reaction is pending');
      assert.equal(writes.length, before + 1, 'Rapid repeated taps send one request');
      assert.ok(await trigger().isDisabled());
      await post.getByRole('button', { name: 'Show photo 2', exact: true }).click();
      await wait(async () => await post.locator('.carousel-count').innerText() === '2 / 3', 'Second image selected');
      assert.equal(await trigger().getAttribute('aria-label'), 'React to this photo');
      release(); delayed = false;
      await wait(() => mine.get(id(31)) === 'wow', 'Original image updated');
      assert.equal(mine.has(id(32)), false); assert.equal(await post.locator('.reaction-effect').count(), 0, 'No old-image effect appears on the new slide');
      fail = true;
      await trigger().click(); await picker().getByRole('menuitemradio', { name: 'Love', exact: true }).click();
      await post.getByRole('alert').filter({ hasText: 'Reaction could not be saved' }).waitFor();
      assert.equal(await trigger().getAttribute('aria-label'), 'React to this photo');
      assert.equal(await post.locator('.reaction-summary').count(), 0, 'Failed save restores counts');
      assert.equal(await post.locator('.reaction-effect').count(), 0);
      fail = false;
      await trigger().click(); await picker().getByRole('menuitemradio', { name: 'Celebrate', exact: true }).click();
      await wait(async () => mine.get(id(32)) === 'celebrate' && !(await trigger().isDisabled()), 'Second image receives its own reaction');
      await page.reload();
      await trigger().waitFor();
      assert.equal(await trigger().getAttribute('aria-label'), 'Your reaction: Wow. Change reaction', 'Reaction survives reload');
      await post.getByRole('button', { name: 'Show photo 2', exact: true }).click();
      await wait(async () => await post.locator('.carousel-count').innerText() === '2 / 3', 'Second image after reload');
      assert.equal(await trigger().getAttribute('aria-label'), 'Your reaction: Celebrate. Change reaction');

      if (width === 1440) {
        await trigger().hover(); await picker().waitFor();
        await page.mouse.move(0, 0); await wait(async () => await picker().count() === 0, 'Hover picker closes after leaving');
      } else {
        await trigger().dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 10, button: 0, buttons: 1 });
        await page.waitForTimeout(500); await picker().waitFor();
        await trigger().dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 10, button: 0, buttons: 0 });
        await trigger().dispatchEvent('click');
        assert.equal(await picker().count(), 1, 'Releasing a long press keeps the picker open');
        await page.keyboard.press('Escape');
      }
      // Reduced motion keeps a short static acknowledgement with no particles.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await trigger().click(); await picker().getByRole('menuitemradio', { name: 'Love', exact: true }).click();
      const reduced = post.locator('.reaction-effect[data-reaction=love]');
      await reduced.waitFor();
      assert.equal(await reduced.locator('.reaction-center').evaluate(el => getComputedStyle(el).animationName), 'none');
      assert.equal(await reduced.locator('.reaction-particle').first().evaluate(el => getComputedStyle(el).display), 'none');
      assert.deepEqual(run.errors, []);
      console.log(`PASS ${width}px: four reactions, popup layout, matching photo effects, keyboard/touch/hover, replace/remove, persistence, request lock, rollback and per-slide isolation`);
    }

    const local = await runs[0].page.evaluate(async () => {
      const { localBackend: api } = await import('/src/companion/lib/localBackend.ts');
      const { demoEvent } = await import('/src/companion/lib/demoSeed.ts');
      await api.hostSignIn('host@example.com', 'demo'); await api.adminData(demoEvent.id);
      await api.listPhotos(demoEvent.id);
      const key = 'as-wedding-demo-db-v1', db = JSON.parse(localStorage.getItem(key));
      const me = localStorage.getItem('as-wedding-device');
      db.photos.push({ id: 'legacy-reaction-photo', eventId: demoEvent.id, uploaderName: 'Demo', createdAt: new Date().toISOString(), hidden: false, pinned: false, akshateBy: [me, 'other-guest'], flaggedBy: [] });
      localStorage.setItem(key, JSON.stringify(db));
      const before = (await api.listPhotos(demoEvent.id)).find(p => p.id === 'legacy-reaction-photo');
      await api.setPhotoReaction('legacy-reaction-photo', 'love');
      const after = (await api.listPhotos(demoEvent.id)).find(p => p.id === 'legacy-reaction-photo');
      await api.setPhotoReaction('legacy-reaction-photo', null);
      const removed = (await api.listPhotos(demoEvent.id)).find(p => p.id === 'legacy-reaction-photo');
      return { before, after, removed };
    });
    assert.equal(local.before.myReaction, 'akshate'); assert.equal(local.before.reactionCounts.akshate, 2);
    assert.equal(local.after.myReaction, 'love'); assert.equal(local.after.reactionCounts.akshate, 1); assert.equal(local.after.reactionCounts.love, 1);
    assert.equal(local.removed.myReaction, null); assert.equal(local.removed.reactionCounts.akshate, 1); assert.equal(local.removed.reactionCounts.love, 0);
    console.log('PASS: browser demo preserves old blessings while replacing and removing reactions');
  } finally { for (const run of runs) await run.context.close(); await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
