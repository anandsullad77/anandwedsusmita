const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'); }
catch { playwright = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core')); }
const { scenario, wait, origin, eventId, photo, id } = require('./test-wedding-browser.cjs');
const measureOnly = process.argv.includes('--measure');
const isSigning = request => request.path === '/storage/v1/object/sign/photos';
const isImage = request => request.path.startsWith('/storage/v1/object/sign/photos/');

(async () => {
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  try {
    const run = await scenario(browser, { initial: 'google', latency: 150, wishDelay: 2200 });
    let wishesReceived = false;
    run.page.on('response', response => { if (new URL(response.url()).pathname.endsWith('/guestbook_messages')) wishesReceived = true; });
    run.photos.splice(0, run.photos.length, ...Array.from({ length: 120 }, (_, i) => photo(1000 + i, new Date(Date.UTC(2026, 10, 24, 12, 0, -Math.floor(i / 10))).toISOString(), { post_id: id(500 + Math.floor(i / 10)), post_position: i % 10 })));
    const start = Date.now();
    await run.page.goto(origin + '/invitation/feed');
    await run.page.locator('.feed-post[data-post-type="photos"]').first().waitFor();
    await wait(() => run.requests.some(isImage), 'First photo starts downloading');
    const firstImageMs = run.requests.find(isImage).at - start;
    const wishesArrived = wishesReceived;
    const firstCarousel = run.page.locator('.photo-carousel').first();
    const initialSources = await run.page.locator('.carousel-slide img[src]').count();
    const initialImageRequests = run.requests.filter(isImage).length;
    const firstUrls = await run.page.evaluate(async eventId => (await (await import('/src/companion/lib/backend.ts')).api.listPhotos(eventId)).map(p => p.url), eventId);
    const signaturesBefore = run.requests.filter(isSigning).length;
    const secondUrls = await run.page.evaluate(async eventId => (await (await import('/src/companion/lib/backend.ts')).api.listPhotos(eventId)).map(p => p.url), eventId);
    const signaturesOnRefresh = run.requests.filter(isSigning).length - signaturesBefore;
    const sources = await firstCarousel.locator('.carousel-slide img').evaluateAll(images => images.map(image => image.getAttribute('src')));
    await firstCarousel.getByRole('button', { name: 'Show photo 10', exact: true }).click();
    await wait(async () => await firstCarousel.locator('.carousel-count').textContent() === '10 / 10', 'Jump to final carousel image');
    await wait(async () => await firstCarousel.locator('.carousel-slide').nth(9).locator('img').evaluate(image => image.complete && image.naturalWidth > 0), 'Final image loads after navigation');
    const result = { firstImageMs, wishesArrivedBeforePhotos: wishesArrived, initialSources, initialImageRequests, signaturesOnRefresh, stableUrls: JSON.stringify(firstUrls) === JSON.stringify(secondUrls), firstCarouselSources: sources.filter(Boolean).length };
    console.log(JSON.stringify(result, null, 2));
    fs.mkdirSync(path.resolve(__dirname, '../artifacts'), { recursive: true });
    fs.writeFileSync(path.resolve(__dirname, '../artifacts/feed-performance-' + (measureOnly ? 'before' : 'after') + '.json'), JSON.stringify(result, null, 2));
    if (!measureOnly) {
      assert.equal(wishesArrived, false, 'Slow wishes must not block photos');
      assert.ok(initialSources <= 6, 'Offscreen posts and distant slides must not start image downloads');
      assert.equal(signaturesOnRefresh, 0, 'Refreshing must reuse valid private image URLs');
      assert.deepEqual(firstUrls, secondUrls, 'Stable URLs allow browser image cache reuse');
      assert.ok(sources.filter(Boolean).length <= 2, 'Only the current slide and next slide load initially');
      const lastPost = run.page.locator('.feed-post[data-post-type="photos"]').last();
      assert.equal(await lastPost.locator('img[src]').count(), 0);
      await lastPost.scrollIntoViewIfNeeded();
      await wait(async () => await lastPost.locator('img[src]').count() > 0, 'Offscreen post loads while scrolling');
      await run.page.clock.setFixedTime(new Date(Date.now() + 271_000));
      const expiryStart = run.requests.filter(isSigning).length;
      const renewedUrls = await run.page.evaluate(async eventId => (await (await import('/src/companion/lib/backend.ts')).api.listPhotos(eventId)).map(p => p.url), eventId);
      assert.equal(run.requests.filter(isSigning).length, expiryStart + 1, 'Expiring URLs are renewed');
      assert.notEqual(renewedUrls[0], secondUrls[0]);
      assert.deepEqual(run.errors, []);
    }
    await run.context.close();
    if (!measureOnly) {
      const preview = await scenario(browser, { initial: 'google', latency: 50 });
      preview.photos.splice(0, preview.photos.length, ...Array.from({ length: 30 }, (_, i) => photo(2000 + i, '2026-11-24T12:00:00Z')));
      await preview.page.goto(origin + '/invitation');
      await preview.page.locator('.general-photo-preview img').nth(2).waitFor();
      const previewQuery = preview.requests.find(request => request.path === '/rest/v1/photos');
      assert.equal(new URLSearchParams(previewQuery.query).get('limit'), '3');
      assert.equal(preview.requests.filter(isSigning).flatMap(request => request.paths).length, 3, 'Invitation preview signs only its three images');
      assert.equal(preview.requests.some(request => request.path === '/rest/v1/akshate' || request.path === '/rest/v1/devices' || request.path === '/auth/v1/user'), false, 'Preview skips unused reaction and identity requests');
      assert.deepEqual(preview.errors, []);
      await preview.context.close();

      const boundary = await scenario(browser, { initial: 'google' });
      // A ten-image carousel crosses the 200-row boundary and must remain complete.
      boundary.photos.splice(0, boundary.photos.length, ...Array.from({ length: 195 }, (_, i) => photo(3000 + i, '2026-11-24T12:00:00Z')), ...Array.from({ length: 10 }, (_, i) => photo(4000 + i, '2026-11-24T11:00:00Z', { post_id: id(900), post_position: i })));
      await boundary.page.goto(origin + '/invitation/feed');
      await boundary.page.locator('.feed-post[data-post-type="photos"]').first().waitFor();
      const photos = await boundary.page.evaluate(async eventId => (await (await import('/src/companion/lib/backend.ts')).api.listPhotos(eventId)), eventId);
      assert.equal(photos.filter(photo => photo.postId === id(900)).length, 10, 'A carousel at the row limit is completed');
      assert.equal(new Set(photos.map(photo => photo.id)).size, 205, 'Boundary completion has no duplicates');
      const callsBefore = boundary.requests.filter(isSigning).length;
      boundary.googleUserId = id(99);
      await boundary.page.evaluate(async eventId => {
        const { supabase } = await import('/src/companion/lib/supabaseClient.ts');
        await supabase().auth.refreshSession();
        await (await import('/src/companion/lib/backend.ts')).api.listPhotos(eventId);
      }, eventId);
      assert.equal(boundary.requests.filter(isSigning).length, callsBefore + 1, 'Switching accounts cannot reuse another account’s cached URLs');
      assert.deepEqual(boundary.errors, []);
      await boundary.context.close();
    }
    console.log(measureOnly ? 'Baseline recorded.' : 'PASS: progressive loading, bounded image requests, URL reuse/expiry/account isolation, scrolling, carousel navigation, small previews and complete boundary posts');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
