const assert = require('node:assert/strict');
const path = require('node:path');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'); }
catch { playwright = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core')); }
const { scenario, origin, eventId, photo, id, wait } = require('./test-wedding-browser.cjs');
const root = path.resolve(__dirname, '..');
const postCard = (page, name) => page.getByRole('article', { name: `Post by ${name}`, exact: true });
const tab = (page, name) => page.getByRole('navigation', { name: 'Post status', exact: true }).getByRole('button', { name: new RegExp(`^${name}`) });

function seed(run) {
  run.photos.splice(0, run.photos.length,
    photo(90, '2026-11-20T10:00:00Z', { post_id: id(80), post_position: 0, uploader_name: 'Arjun', caption: 'A two-photo memory', status: 'pending', hidden: true }),
    photo(91, '2026-11-20T10:00:00Z', { post_id: id(80), post_position: 1, uploader_name: 'Arjun', caption: 'A two-photo memory', status: 'pending', hidden: true }),
    photo(92, '2026-11-21T10:00:00Z', { uploader_name: 'Hidden guest', hidden: true }),
    photo(93, '2026-11-22T10:00:00Z', { post_id: id(81), post_position: 0, uploader_name: 'Reported guest' }),
    photo(94, '2026-11-22T10:00:00Z', { post_id: id(81), post_position: 1, uploader_name: 'Reported guest' }),
    photo(96, '2026-11-24T10:00:00Z', { uploader_name: 'Published guest' }));
  run.wishes.splice(0, run.wishes.length, { id: id(95), name: 'Wish guest', message: 'Wishing you both so much happiness!', status: 'pending', created_at: '2026-11-23T10:00:00Z' });
  run.photoReports.set(id(92), [{ reason: 'Please check this photo before showing it again.', removal: true, createdAt: '2026-11-21T11:00:00Z' }]);
  run.photoReports.set(id(94), [{ reason: 'I would like this photo reviewed.', removal: false, createdAt: '2026-11-22T11:00:00Z' }]);
}

(async () => {
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const width of [390, 320, 1440]) {
      const run = await scenario(browser, { width, initial: 'host' });
      seed(run);
      const { page } = run;
      let guest;
      try {
        if (width === 390) {
          guest = await scenario(browser, { width, initial: 'google' });
          guest.photos.splice(0, guest.photos.length);
          await guest.page.goto(origin + '/invitation/create?type=photos');
          await guest.page.getByLabel('Choose photos from gallery').setInputFiles([path.join(root, 'public/images/couple.webp'), path.join(root, 'public/images/invitation-couple.webp')]);
          await guest.page.getByLabel('Your name', { exact: true }).fill('Uploaded guest');
          await guest.page.getByLabel('Caption (optional)').fill('An approval required post');
          await guest.page.getByRole('button', { name: /Create Post.*2 photos/ }).click();
          await guest.page.getByRole('heading', { name: 'Sent for approval', exact: true }).waitFor();
          assert.equal(guest.batches.length, 1);
          assert.ok(guest.photos.every(p => p.status === 'pending' && p.hidden));
          run.photos.push(...guest.photos);
          await guest.page.goto(origin + '/invitation/feed');
          await guest.page.getByRole('heading', { name: 'Gallery', exact: true }).waitFor();
          await guest.page.locator('.gallery-empty').waitFor();
          assert.equal(await guest.page.getByRole('button', { name: /Open photo.*An approval required post/ }).count(), 0, 'Pending uploads stay out of the feed');
        }
        await page.goto(origin + '/admin/photos');
        await page.getByRole('heading', { name: 'Review posts', exact: true }).waitFor();
        await postCard(page, 'Arjun').waitFor();
        await wait(async () => !(await page.getByRole('button', { name: 'Refresh posts', exact: true }).isDisabled()), 'Queue finished loading');
        assert.equal(await postCard(page, 'Arjun').locator('.review-photo-grid img').count(), 2);
        assert.equal(await postCard(page, 'Wish guest').getByText('Awaiting approval', { exact: true }).count(), 1);
        await postCard(page, 'Hidden guest').getByText('Why this was reported', { exact: true }).click();
        await postCard(page, 'Hidden guest').getByText('Please check this photo before showing it again.', { exact: false }).waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(root, `artifacts/post-review-${width}.png`) });

        await postCard(page, 'Arjun').getByRole('button', { name: 'View all 2 photos', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        assert.ok(await dialog.evaluate(element => element.matches(':modal')));
        await dialog.locator('.review-preview-image img').evaluate(image => image.decode());
        await dialog.getByRole('button', { name: 'Next photo', exact: true }).click();
        await dialog.getByText('2 / 2', { exact: true }).waitFor();
        await page.keyboard.press('ArrowLeft');
        await dialog.getByText('1 / 2', { exact: true }).waitFor();
        assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1));
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'detached' });

        run.failReview = true;
        await postCard(page, 'Arjun').getByRole('button', { name: 'Approve & publish', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'Review could not be saved' }).waitFor();
        assert.ok(run.photos.filter(p => p.post_id === id(80)).every(p => p.status === 'pending'));
        run.failReview = false; run.reviewDelay = 400;
        const before = run.reviews.length;
        await postCard(page, 'Arjun').getByRole('button', { name: 'Approve & publish', exact: true }).evaluate(button => { button.click(); button.click(); });
        await wait(() => run.reviews.length === before + 1, 'Only one moderation request is sent');
        assert.ok(await postCard(page, 'Arjun').getByRole('button', { name: 'Approve & publish', exact: true }).isDisabled());
        await postCard(page, 'Arjun').waitFor({ state: 'detached' });
        assert.ok(run.photos.filter(p => p.post_id === id(80)).every(p => p.status === 'approved' && !p.hidden));
        run.reviewDelay = 0;

        await postCard(page, 'Hidden guest').getByRole('button', { name: 'Return to feed', exact: true }).click();
        await postCard(page, 'Hidden guest').waitFor({ state: 'detached' });
        assert.equal(run.photoReports.has(id(92)), false, 'Restoring a photo resolves the report');
        await postCard(page, 'Reported guest').getByRole('button', { name: 'Keep in feed', exact: true }).click();
        await postCard(page, 'Reported guest').waitFor({ state: 'detached' });
        assert.equal(run.photoReports.has(id(94)), false);

        await postCard(page, 'Wish guest').getByRole('checkbox').check();
        if (guest) await postCard(page, 'Uploaded guest').getByRole('checkbox').check();
        await page.getByRole('button', { name: 'Approve selected', exact: true }).click();
        await page.getByRole('heading', { name: 'You’re all caught up', exact: true }).waitFor();
        assert.equal(run.wishes[0].status, 'approved');
        assert.equal(run.reviews.at(-1).p_posts.length, guest ? 2 : 1);
        if (guest) {
          await guest.page.reload();
          await guest.page.getByRole('button', { name: /Open photo.*An approval required post/ }).first().waitFor();
          assert.equal(await guest.page.getByRole('button', { name: /Open photo.*An approval required post/ }).count(), 2);
          assert.equal(guest.batches.length, 1, 'Approval does not cause a duplicate upload');
          assert.deepEqual(guest.errors, []);
        }

        await tab(page, 'In feed').click();
        await postCard(page, 'Hidden guest').waitFor();
        await postCard(page, 'Published guest').getByRole('button', { name: 'Hide post', exact: true }).click();
        await postCard(page, 'Published guest').waitFor({ state: 'detached' });
        await tab(page, 'Hidden').click();
        await postCard(page, 'Published guest').getByRole('button', { name: 'Return to feed', exact: true }).click();
        await postCard(page, 'Published guest').waitFor({ state: 'detached' });
        await tab(page, 'All posts').click();
        await postCard(page, 'Arjun').waitFor();
        await page.locator('.review-filter-panel > summary').click();
        await page.getByLabel('Find a post', { exact: true }).fill('Wish guest');
        await wait(async () => await page.locator('.review-card').count() === 1, 'Search filters the full queue');
        assert.equal(await postCard(page, 'Wish guest').count(), 1);
        await page.getByLabel('Find a post', { exact: true }).fill('');
        await page.getByLabel('Post type', { exact: true }).selectOption('wish');
        await wait(async () => await page.locator('.review-card').count() === 1, 'Wishes filter works');
        await page.getByLabel('Post type', { exact: true }).selectOption('all');
        await postCard(page, 'Arjun').waitFor();
        const viewerGuest = await scenario(browser, { width, initial: 'google' });
        try {
          viewerGuest.photos.splice(0, viewerGuest.photos.length, ...run.photos);
          await viewerGuest.page.goto(origin + '/invitation/feed');
          const restoredPhoto = viewerGuest.page.getByRole('button', { name: /Open photo by Hidden guest/ });
          await restoredPhoto.click();
          const viewer = viewerGuest.page.getByRole('dialog', { name: 'Photo viewer', exact: true });
          await viewer.getByRole('button', { name: 'More options', exact: true }).click();
          assert.equal(await viewer.getByRole('menuitem', { name: 'Report this photo', exact: true }).count(), 0);
          assert.equal(await viewer.getByRole('menuitem', { name: 'Request removal', exact: true }).count(), 0);
          assert.equal(await viewer.getByRole('menuitem', { name: 'Save to phone', exact: true }).count(), 1);
          await viewerGuest.page.keyboard.press('Escape'); await viewerGuest.page.keyboard.press('Escape');
          await viewerGuest.page.getByRole('button', { name: /Open photo by Reported guest: Memory 93/ }).click();
          await viewer.getByRole('button', { name: 'More options', exact: true }).click();
          assert.equal(await viewer.getByRole('menuitem', { name: 'Report this photo', exact: true }).count(), 1, 'Unreported sibling retains its report action');
          assert.equal(await viewer.getByRole('menuitem', { name: 'Request removal', exact: true }).count(), 1);
          await viewerGuest.page.keyboard.press('Escape');
          await viewer.getByRole('button', { name: 'Next photo', exact: true }).click();
          await viewer.getByRole('button', { name: 'More options', exact: true }).click();
          assert.equal(await viewer.getByRole('menuitem', { name: 'Report this photo', exact: true }).count(), 0, 'Restored reported sibling has no report action');
          assert.equal(await viewer.getByRole('menuitem', { name: 'Request removal', exact: true }).count(), 0);
          const denied = await viewerGuest.page.evaluate(async photoId => {
            const { api } = await import('/src/companion/lib/backend.ts');
            try { await api.flagPhoto(photoId, 'Try reporting again', false); return false; }
            catch (error) { return error.message.includes('already been reviewed'); }
          }, id(92));
          assert.ok(denied, 'Direct backend reporting is also blocked');
          await viewerGuest.page.reload();
          await viewerGuest.page.getByRole('button', { name: /Open photo by Hidden guest/ }).click();
          await viewer.getByRole('button', { name: 'More options', exact: true }).click();
          assert.equal(await viewer.getByRole('menuitem', { name: 'Report this photo', exact: true }).count(), 0, 'Reporting lock survives reload');
        } finally { await viewerGuest.context.close(); }
        assert.deepEqual(run.errors, []);
        console.log(`PASS ${width}px: grouped photo/wish queue, report details, full-size previews, keyboard navigation, failed-save recovery, duplicate-click lock, approval, report resolution, hide/restore, bulk actions, search and type filters`);
        console.log(`PASS ${width}px: restored reported images hide report/removal actions, downloads remain available, unreported siblings stay reportable, backend blocks retries and locks persist after reload`);

        if (width === 1440) {
          for (let n = 0; n < 24; n++) run.photos.push(photo(1000 + n, `2026-11-25T10:${String(n).padStart(2, '0')}:00Z`, { uploader_name: `Extra guest ${n}` }));
          await page.getByRole('button', { name: 'Refresh posts', exact: true }).click();
          await page.getByRole('navigation', { name: 'Review pages', exact: true }).waitFor();
          const first = await page.locator('.review-card').evaluateAll(cards => cards.map(card => card.getAttribute('aria-label')));
          await page.getByRole('navigation', { name: 'Review pages', exact: true }).getByRole('button', { name: 'Next', exact: true }).click();
          await wait(async () => (await page.locator('.review-card').first().getAttribute('aria-label')) !== first[0], 'Next page loads');
          const next = await page.locator('.review-card').evaluateAll(cards => cards.map(card => card.getAttribute('aria-label')));
          assert.equal(next.some(label => first.includes(label)), false);
          run.canReview = false;
          await page.reload();
          await page.getByText('You can view posts. An owner, co-owner or host must approve or hide them.', { exact: true }).waitFor();
          assert.equal(await page.getByRole('button', { name: 'Approve selected', exact: true }).count(), 0);
          assert.equal(await page.locator('.review-actions').count(), 0);
          console.log('PASS: server pagination and read-only review UI');
        }
      } finally { if (guest) await guest.context.close(); await run.context.close(); }
    }
    const local = await scenario(browser, { initial: 'host' });
    try {
      await local.page.goto(origin + '/admin/photos');
      const result = await local.page.evaluate(async () => {
        const { localBackend: api, resetDemo } = await import('/src/companion/lib/localBackend.ts');
        const { demoEvent } = await import('/src/companion/lib/demoSeed.ts');
        resetDemo(); await api.hostSignIn('owner@example.com', 'demo');
        const blob = await fetch('/images/couple.webp').then(response => response.blob());
        const images = [{ id: 'moderation-photo-a', blob }, { id: 'moderation-photo-b', blob }];
        await api.uploadPhotoPost(demoEvent.id, 'moderation-post', images, { uploaderName: 'Demo uploader', personId: null });
        await api.uploadPhotoPost(demoEvent.id, 'moderation-post', images, { uploaderName: 'Demo uploader', personId: null });
        const before = await api.listPhotos(demoEvent.id), queue = await api.postReviewQueue(demoEvent.id);
        const posts = [{ id: 'moderation-post', kind: 'photo' }];
        await api.reviewPosts(demoEvent.id, posts, 'approve');
        const approved = await api.listPhotos(demoEvent.id);
        await api.flagPhoto(images[0].id, 'Please review', true);
        const flagged = await api.postReviewQueue(demoEvent.id);
        await api.reviewPosts(demoEvent.id, posts, 'approve');
        const resolved = await api.postReviewQueue(demoEvent.id);
        const locks = (await api.listPhotos(demoEvent.id)).map(photo => !!photo.reportLocked);
        let reportDenied = false;
        try { await api.flagPhoto(images[0].id, 'Report again', false); } catch { reportDenied = true; }
        let failed = false;
        try { await api.reviewPosts(demoEvent.id, [...posts, { id: 'missing', kind: 'photo' }], 'hide'); } catch { failed = true; }
        const afterFailure = await api.listPhotos(demoEvent.id);
        await api.reviewPosts(demoEvent.id, posts, 'hide');
        const hidden = await api.listPhotos(demoEvent.id);
        await api.reviewPosts(demoEvent.id, posts, 'approve');
        return { before: before.length, pending: queue.posts[0].photos.length, pendingPosts: queue.total, approved: approved.length,
          flagged: flagged.counts.reported, resolved: resolved.counts.review, failed, afterFailure: afterFailure.length, hidden: hidden.length,
          restored: (await api.listPhotos(demoEvent.id)).length, locks, reportDenied };
      });
      assert.deepEqual(result, { before: 0, pending: 2, pendingPosts: 1, approved: 2, flagged: 1, resolved: 0, failed: true, afterFailure: 2, hidden: 0, restored: 2, locks: [true, false], reportDenied: true });
      console.log('PASS: local demo matches pending upload, retry, approval, reports, atomic failure, hide and restore behavior');
    } finally { await local.context.close(); }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
