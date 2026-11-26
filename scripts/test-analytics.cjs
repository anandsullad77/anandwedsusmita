const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'); }
catch { playwright = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core')); }
const { scenario, wait, origin, eventId, id } = require('./test-wedding-browser.cjs');
const root = path.resolve(__dirname, '..');
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

(async () => {
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  const runs = [];
  try {
    for (const width of [1440, 390, 320]) {
      const run = await scenario(browser, { initial: 'host', width }); runs.push(run);
      let summary = {
        visitors: 12, signedIn: 7, photoPosts: 2, wishes: 1,
        recentPosts: [
          { id: id(990), kind: 'wish', name: 'Wish guest', text: 'Wishing you a wonderful life together!', photos: 0, createdAt: '2026-11-24T10:00:00Z', status: 'pending' },
          { id: id(991), kind: 'photo', name: 'Photo guest', text: 'A happy moment', photoPath: `${eventId}/analytics.webp`, photos: 3, createdAt: '2026-11-24T09:00:00Z', status: 'shared' },
          { id: id(992), kind: 'photo', name: 'Another guest', text: null, photos: 1, createdAt: '2026-11-24T08:00:00Z', status: 'hidden' }
        ]
      };
      let failure = false, failThumbnails = false;
      await run.context.route(url => url.pathname.endsWith('/rpc/admin_wedding_analytics'), route => {
        assert.deepEqual(route.request().postDataJSON(), { p_event: eventId });
        return failure ? json(route, { code: 'PGRST202', message: 'Missing migration' }, 404) : json(route, summary);
      });
      await run.context.route(url => url.pathname === '/storage/v1/object/sign/photos', async (route, request) => {
        if (failThumbnails && request.postDataJSON().paths.includes(`${eventId}/unavailable.webp`)) return json(route, { message: 'Thumbnail unavailable' }, 503);
        return route.fallback();
      });
      const page = run.page;
      await page.goto(origin + '/admin');
      if (width < 768) {
        await page.getByRole('button', { name: 'More admin pages', exact: true }).click();
        await page.getByRole('navigation', { name: 'All admin pages', exact: true }).getByRole('link', { name: 'Analytics', exact: true }).click();
        assert.equal(await page.locator('.admin-bottom-nav button.active').innerText(), 'More');
      } else await page.getByRole('navigation', { name: 'Admin', exact: true }).getByRole('link', { name: 'Analytics', exact: true }).click();
      await page.waitForURL(origin + '/admin/analytics');
      const totals = page.getByRole('region', { name: 'Website totals', exact: true });
      await totals.waitFor();
      assert.deepEqual(await totals.locator('.n').allTextContents(), ['12', '7', '3']);
      assert.match(await totals.innerText(), /2 photo posts · 1 wish/);
      const posts = page.getByRole('region', { name: 'Recent posts', exact: true });
      assert.equal(await posts.locator('li').count(), 3);
      await posts.getByRole('img', { name: 'Photo shared by Photo guest' }).waitFor();
      assert.equal(await posts.getByRole('img').evaluate(async img => { await img.decode(); return img.naturalWidth > 0; }), true);
      assert.match(await posts.innerText(), /Awaiting approval/);
      assert.match(await posts.innerText(), /Hidden/);
      assert.match(await posts.innerText(), /Shared 3 photos/);
      assert.match(await posts.innerText(), /24 Nov, 3:30 pm/i);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow at ' + width);
      fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
      await page.screenshot({ path: path.join(root, `artifacts/analytics-${width}.png`), fullPage: true });

      const refresh = page.getByRole('button', { name: 'Refresh', exact: true });
      failure = true; await refresh.click();
      await page.getByRole('alert').filter({ hasText: '0013_wedding_analytics.sql' }).waitFor();
      failure = false; failThumbnails = true;
      summary = { ...summary, visitors: 13, recentPosts: [{ ...summary.recentPosts[1], photoPath: `${eventId}/unavailable.webp` }] };
      await refresh.click();
      await wait(async () => (await totals.locator('.n').allTextContents())[0] === '13', 'Refresh updates the totals despite a failed thumbnail');
      assert.equal(await page.getByRole('alert').count(), 0);
      assert.match(await posts.innerText(), /A happy moment/);
      summary = { visitors: 0, signedIn: 0, photoPosts: 0, wishes: 0, recentPosts: [] };
      await refresh.click();
      await page.getByText('No photos or wishes shared yet.', { exact: true }).waitFor();
      assert.deepEqual(await totals.locator('.n').allTextContents(), ['0', '0', '0']);
      assert.equal(run.requests.filter(r => /record_wedding_(visit|signin)$/.test(r.path)).length, 0, 'Admin pages are not tracked as visits or guest sign-ins');
      assert.deepEqual(run.errors, []);
      console.log(`PASS: ${width}px Analytics navigation, totals, thumbnails/wishes, IST dates, refresh, setup error, empty state and thumbnail failure`);
    }

    const guest = await scenario(browser); runs.push(guest);
    const visits = [], logins = [];
    await guest.context.route(url => /\/rpc\/record_wedding_(visit|signin)$/.test(url.pathname), route => {
      const body = route.request().postDataJSON();
      assert.deepEqual(Object.keys(body), ['p_visitor'], 'Tracking never includes URLs, invite tokens or names');
      assert.match(body.p_visitor, /^[0-9a-f-]{36}$/);
      (route.request().url().endsWith('record_wedding_visit') ? visits : logins).push(body);
      return json(route, null);
    });
    await guest.page.goto(origin + '/');
    await wait(() => visits.length === 1, 'Main invitation visit recorded');
    assert.equal(guest.requests.filter(r => r.path.endsWith('/signup')).length, 0, 'Visiting the main invitation does not create an Auth account');
    await guest.page.reload();
    await guest.page.goto(origin + '/invitation/create?type=wish');
    await guest.page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
    await wait(() => logins.length > 0, 'Successful Google sign-in recorded');
    await guest.page.waitForURL(origin + '/invitation/create?type=wish');
    assert.equal(visits.length, 1, 'Reloading, navigating and returning from OAuth keep one browser visit');
    assert.ok(logins.every(body => body.p_visitor === visits[0].p_visitor), 'The same visitor survives the OAuth round trip');
    const previousLogins = logins.length;
    await guest.page.evaluate(async () => {
      const { refreshGuestAuth } = await import('/src/companion/lib/guestAuth.ts');
      await refreshGuestAuth(); await refreshGuestAuth();
    });
    assert.equal(logins.length, previousLogins, 'Repeated auth refreshes do not send repeated sign-ins');
    assert.deepEqual(guest.errors, []);
    console.log('PASS: main-page visits, browser deduplication, Google OAuth sign-in, refresh deduplication and token-free tracking');

    const broken = await scenario(browser); runs.push(broken);
    let failedVisits = 0;
    await broken.context.route(url => /\/rpc\/record_wedding_(visit|signin)$/.test(url.pathname), route => {
      if (route.request().url().endsWith('record_wedding_visit')) failedVisits++;
      return json(route, { message: 'Analytics unavailable' }, 503);
    });
    await broken.page.goto(origin + '/invitation/feed');
    await broken.page.getByRole('button', { name: 'Continue with Google' }).click();
    await broken.page.getByRole('heading', { name: 'Gallery', exact: true }).waitFor();
    assert.ok(failedVisits > 0);
    assert.equal(await broken.page.getByRole('alert').count(), 0, 'Unavailable analytics do not interrupt guest sign-in or the feed');
    console.log('PASS: analytics failures do not block guests');

    const demo = await runs[0].page.evaluate(async () => {
      const { localBackend: api } = await import('/src/companion/lib/localBackend.ts');
      const { demoEvent } = await import('/src/companion/lib/demoSeed.ts');
      let denied = false;
      try { await api.adminAnalytics(demoEvent.id); } catch { denied = true; }
      await api.hostSignIn('host@example.com', 'preview');
      await api.adminData(demoEvent.id);
      localStorage.setItem('as-wedding-demo-analytics-visitors', JSON.stringify(['one', 'one', 'two']));
      const key = 'as-wedding-demo-db-v1', db = JSON.parse(localStorage.getItem(key));
      db.photos = [0, 1, 2].map(n => ({ id: 'demo-photo-' + n, postId: 'demo-post', postPosition: n, eventId: demoEvent.id, uploaderName: 'Demo guest', caption: 'A memory', createdAt: new Date().toISOString(), hidden: n === 2 }));
      db.wishes = [{ id: 'demo-wish', eventId: demoEvent.id, name: 'Demo guest', message: 'Best wishes!', createdAt: new Date().toISOString(), status: 'pending' }];
      localStorage.setItem(key, JSON.stringify(db));
      return { denied, data: await api.adminAnalytics(demoEvent.id) };
    });
    assert.ok(demo.denied); assert.equal(demo.data.visitors, 2); assert.equal(demo.data.signedIn, 0);
    assert.equal(demo.data.photoPosts, 1); assert.equal(demo.data.wishes, 1);
    assert.equal(demo.data.recentPosts.find(post => post.kind === 'photo').photos, 3);
    assert.equal(demo.data.recentPosts.find(post => post.kind === 'photo').status, 'partly_hidden');
    console.log('PASS: demo analytics require a host and count unique visits, carousel posts and wishes');
  } finally { for (const run of runs) await run.context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
