// Uses the real app and Supabase SDK; all backend and OAuth traffic is mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'); }
catch { playwright = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core')); }
const origin = process.env.WEDDING_TEST_ORIGIN || 'http://127.0.0.1:5175';
const canonical = 'https://anandwedsusmita.in';
const host = 'hfpdujkjdushcqtkhqqs.supabase.co';
const root = path.resolve(__dirname, '..');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const eventId = id(1), token = id(2);
const sections = { cover: true, schedule: true, photos: true, uploads: true, updates: true, guestbook: true, download: true, quests: true };
const event = { id: eventId, slug: 'anand-susmita', title: "Anand & Susmita's wedding", coupleA: 'Anand', coupleB: 'Susmita', startsAt: '2026-11-29T12:28:00+05:30', venue: 'Wedding venue', theme: { portrait: '/images/wedding-couple-pink-green.png' } };
const photo = (n, createdAt, extra = {}) => ({ id: id(n), event_id: eventId, storage_path: `${eventId}/${n}.webp`, uploader_name: 'Google guest', uploaded_by: id(12), caption: `Memory ${n}`, created_at: createdAt, hidden: false, pinned: false, ...extra });
const privatePath = pathname => /\/rest\/v1\/(photos|guestbook_messages|akshate)|\/rpc\/photo_quest_summary|\/storage\/v1\/.*photos/.test(pathname);

async function scenario(browser, { width = 390, initial = 'anonymous', family = false, cancel = false, site = origin, customSections = sections, latency = 0, wishDelay = 0, previewPaths = [] } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', hasTouch: width < 768 });
  let mode = initial, exchanges = 0, claims = 0, failUpload = false, failInsert = false, loseInsertResponse = false, signings = 0;
  let googleUserId = id(12);
  let invitationSettings = { event_id: eventId, welcome_message: 'Join us for our wedding.', cover_path: null, sections: customSections, preview_photo_paths: [...previewPaths] };
  let failPreviewUpload = false, failSettingsSave = false;
  const settingsSaves = [];
  const databaseEvent = { id: eventId, slug: event.slug, title: event.title, couple_a: event.coupleA, couple_b: event.coupleB, starts_at: event.startsAt, venue: event.venue, theme: event.theme };
  const requests = [], submissions = [], batches = [], errors = [], storage = new Set(), reports = [], reactions = [];
  const photos = [photo(30, '2026-11-20T10:00:00Z', { pinned: true }), photo(32, '2026-11-22T10:00:00Z', { post_id: id(60), post_position: 1 }), photo(31, '2026-11-22T10:00:00Z', { post_id: id(60), post_position: 0 }), photo(33, '2026-11-22T10:00:00Z', { post_id: id(60), post_position: 2 })];
  const wishes = [{ id: id(40), name: 'Approved guest', message: 'A blessing between the memories', status: 'approved', created_at: '2026-11-21T10:00:00Z' }];
  const user = () => {
    const provider = mode === 'google' ? 'google' : mode === 'anonymous' ? 'anonymous' : 'email';
    const uid = mode === 'google' ? googleUserId : mode === 'host' ? id(10) : mode === 'email' ? id(14) : id(11);
    return { id: uid, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.com', is_anonymous: mode === 'anonymous', app_metadata: { provider, providers: [provider] }, user_metadata: { full_name: 'Google guest' }, identities: [{ id: uid, user_id: uid, provider, identity_data: {} }], created_at: new Date().toISOString() };
  };
  const session = () => {
    const current = user(), exp = Math.floor(Date.now() / 1000) + 3600;
    const encode = object => Buffer.from(JSON.stringify(object)).toString('base64url');
    return { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: current.id, aud: 'authenticated', role: 'authenticated', exp, is_anonymous: current.is_anonymous })}.fixture`, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: current };
  };
  const bundle = () => ({ event, functions: [{ id: id(3), nameEn: 'Muhurta & Akshate', startsAt: event.startsAt, venue: event.venue }], guestName: mode === 'google' ? 'Google guest' : null });
  if (initial !== 'anonymous' || family) await context.addInitScript(({ initialSession, familySession }) => {
    if (initialSession && !localStorage.getItem('sb-hfpdujkjdushcqtkhqqs-auth-token')) localStorage.setItem('sb-hfpdujkjdushcqtkhqqs-auth-token', JSON.stringify(initialSession));
    if (familySession) localStorage.setItem('as-wedding-session', JSON.stringify(familySession));
  }, { initialSession: initial !== 'anonymous' ? session() : null, familySession: family ? { eventId, slug: 'anand-susmita', householdToken: 'family-private', personId: id(21) } : null });
  // Serve local source on the real custom origin to test canonical OAuth URLs
  // and origin-scoped PKCE storage without touching the deployed website.
  for (const alias of [canonical, 'https://anandwedsusmita.vercel.app', 'https://www.anandwedsusmita.in']) {
    await context.route(alias + '/**', async route => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: origin + url.pathname + url.search });
      await route.fulfill({ response });
    });
  }
  await context.route(`https://${host}/**`, async route => {
    const request = route.request(), url = new URL(request.url()), body = () => request.postDataJSON();
    requests.push({ path: url.pathname, query: url.search, method: request.method(), mode, at: Date.now(), paths: url.pathname === '/storage/v1/object/sign/photos' ? body().paths : undefined });
    if (latency && (url.pathname.startsWith('/rest/') || url.pathname.endsWith('/user') || url.pathname === '/storage/v1/object/sign/photos')) await new Promise(resolve => setTimeout(resolve, latency));
    if (wishDelay && url.pathname.endsWith('/guestbook_messages')) await new Promise(resolve => setTimeout(resolve, wishDelay));
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname.endsWith('/authorize')) {
      assert.equal(url.searchParams.get('provider'), 'google');
      assert.equal(url.searchParams.get('redirect_to'), site + '/auth/callback');
      assert.ok(url.searchParams.get('code_challenge'));
      // Start a new navigation so Playwright also intercepts the custom-domain
      // callback (redirect chains can otherwise bypass subsequent URL routes).
      const callback = site + (cancel ? '/auth/callback?error=access_denied' : '/auth/callback?code=' + id(100 + exchanges));
      return route.fulfill({ status: 200, contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(callback)})</script>` });
    }
    if (url.pathname.endsWith('/signup')) return json(session());
    if (url.pathname.endsWith('/token')) {
      if (url.searchParams.get('grant_type') === 'pkce') { assert.ok(body().code_verifier); exchanges++; mode = 'google'; }
      return json(session());
    }
    if (url.pathname.endsWith('/user')) return json(user());
    if (url.pathname.endsWith('/logout')) { mode = 'anonymous'; return route.fulfill({ status: 204 }); }
    if (privatePath(url.pathname) && mode !== 'google' && mode !== 'host') return json({ message: 'Sign in with Google' }, 403);
    if (url.pathname.endsWith('/rpc/open_wedding_invite')) return json({ token, bundle: bundle() });
    if (url.pathname.endsWith('/rpc/open_general_invite')) return json(bundle());
    if (url.pathname.endsWith('/rpc/invite_bundle')) return json({ ...bundle(), household: { id: id(20), name: 'Family', coming: 'yes' }, people: [{ id: id(21), name: 'Family guest', isChild: false, attending: [] }] });
    if (url.pathname.endsWith('/general_invitation_settings')) return json(invitationSettings);
    if (url.pathname.endsWith('/announcements')) return json([{ id: 1, body: 'Public host update', created_at: new Date().toISOString() }]);
    if (url.pathname.endsWith('/hosts')) return json(mode === 'host' ? [{ event_id: eventId, events: databaseEvent }] : []);
    if (url.pathname.endsWith('/events')) return json(databaseEvent);
    if (url.pathname.endsWith('/event_functions')) return json([{ id: id(3), name_en: 'Muhurta & Akshate', starts_at: event.startsAt, venue: event.venue }]);
    if (['/households', '/access_requests', '/photo_flags'].some(path => url.pathname.endsWith(path))) return json([]);
    if (url.pathname.endsWith('/event_secrets')) return json({ pin: '291126' });
    if (url.pathname.endsWith('/rpc/general_invite_token')) return json(token);
    if (url.pathname.endsWith('/rpc/save_general_invitation_with_previews')) {
      if (mode !== 'host') return json({ message: 'Only hosts can customize the invitation' }, 403);
      if (failSettingsSave) return json({ message: 'Temporary settings failure' }, 503);
      const values = body();
      invitationSettings = { ...invitationSettings, welcome_message: values.p_welcome, cover_path: values.p_cover, sections: values.p_sections, preview_photo_paths: values.p_preview_paths };
      settingsSaves.push(values);
      return json(null);
    }
    if (url.pathname.endsWith('/rpc/claim_person')) { claims++; return json(id(21)); }
    if (url.pathname.endsWith('/rpc/photo_quest_summary')) return json({ contributions: 4, completedQuestIds: [], counts: {} });
    if (url.pathname.endsWith('/photos') && url.pathname.startsWith('/rest/v1/')) {
      if (request.method() === 'POST') {
        if (failInsert) return json({ message: 'Temporary insert failure' }, 503);
        const rows = Array.isArray(body()) ? body() : [body()];
        if (rows.some(row => photos.some(existing => existing.id === row.id))) return json({ message: 'Duplicate photo' }, 409);
        batches.push(rows); photos.unshift(...rows.map(row => ({ ...photo(99, new Date().toISOString()), ...row })));
        if (loseInsertResponse) { loseInsertResponse = false; return route.abort('failed'); }
        return json(null, 201);
      }
      const postFilter = url.searchParams.get('post_id');
      let filtered = photos.filter(p => !p.hidden);
      if (postFilter?.startsWith('eq.')) filtered = filtered.filter(p => p.post_id === postFilter.slice(3));
      if (postFilter?.startsWith('in.')) filtered = filtered.filter(p => postFilter.includes(p.post_id));
      if (url.searchParams.get('quest_id')) filtered = filtered.filter(p => p.quest_id === url.searchParams.get('quest_id').slice(3));
      if (url.searchParams.has('limit')) filtered = filtered.slice(0, Number(url.searchParams.get('limit')));
      return json(filtered);
    }
    if (url.pathname.endsWith('/devices')) return json(null);
    if (url.pathname.endsWith('/akshate')) { if (request.method() !== 'GET') reactions.push({ method: request.method(), query: url.search, body: request.postData() }); return json([]); }
    if (url.pathname.endsWith('/guestbook_messages')) return json(wishes);
    if (url.pathname.endsWith('/rpc/submit_guestbook_wish')) { submissions.push(body()); return json(null); }
    if (url.pathname.endsWith('/rpc/flag_photo')) { reports.push(body()); return json(null); }
    if (url.pathname === '/storage/v1/object/sign/photos') {
      const signature = ++signings;
      return json(body().paths.map(p => ({ path: p, signedURL: '/object/sign/photos/' + p + '?token=fixture-' + signature })));
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/photos/')) return route.fulfill({ status: 200, contentType: 'image/webp', body: fs.readFileSync(path.join(root, 'public/images/invitation-couple.webp')) });
    if (url.pathname === '/storage/v1/object/sign/invitation-previews') return json(body().paths.map(p => ({ path: p, signedURL: '/object/sign/invitation-previews/' + p + '?token=preview' })));
    if (url.pathname.startsWith('/storage/v1/object/sign/invitation-previews/')) return route.fulfill({ status: 200, contentType: 'image/webp', body: fs.readFileSync(path.join(root, 'public/images/invitation-couple.webp')) });
    if (url.pathname.startsWith('/storage/v1/object/invitation-previews/')) {
      if (mode !== 'host') return json({ message: 'Only hosts can upload preview photos' }, 403);
      if (failPreviewUpload) return json({ message: 'Temporary preview upload failure' }, 503);
      storage.add(url.pathname.slice('/storage/v1/object/invitation-previews/'.length));
      return json({ Key: url.pathname });
    }
    if (url.pathname === '/storage/v1/object/invitation-previews' && request.method() === 'DELETE') {
      const removed = body().prefixes.filter(path => !invitationSettings.preview_photo_paths.includes(path));
      removed.forEach(path => storage.delete(path));
      return json(removed.map(name => ({ name })));
    }
    if (url.pathname.startsWith('/storage/v1/object/photos/')) {
      if (failUpload) return json({ statusCode: '503', message: 'Temporary upload failure' }, 503);
      if (storage.has(url.pathname)) return json({ statusCode: '409', error: 'Duplicate', message: 'The resource already exists' }, 400);
      storage.add(url.pathname); return json({ Key: url.pathname });
    }
    throw new Error('Unhandled fixture: ' + request.method() + ' ' + url.pathname);
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(12000);
  return { context, page, requests, submissions, batches, photos, errors, reports, reactions, storage, settingsSaves,
    get invitationSettings() { return invitationSettings; },
    set failPreviewUpload(value) { failPreviewUpload = value; }, set failSettingsSave(value) { failSettingsSave = value; },
    get exchanges() { return exchanges; }, get claims() { return claims; },
    set googleUserId(value) { googleUserId = value; },
    set failUpload(value) { failUpload = value; }, set failInsert(value) { failInsert = value; }, set loseInsertResponse(value) { loseInsertResponse = value; } };
}
const wait = async (check, message) => { for (let i = 0; i < 100; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error(message); };
const nav = page => page.getByRole('navigation', { name: 'Wedding', exact: true });
async function assertLayout(page) { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow'); }

if (require.main === module) (async () => {
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  try {
    for (const width of [390, 1440]) {
      const run = await scenario(browser, { width });
      const { page } = run;
      await page.goto(origin + '/invitation');
      await page.getByText('Public host update', { exact: true }).waitFor();
      assert.equal(run.requests.filter(r => privatePath(r.path)).length, 0);
      assert.equal(await nav(page).getByRole('link', { name: 'Photos', exact: true }).count(), 0);
      assert.equal(await nav(page).getByRole('link', { name: 'Wishes', exact: true }).count(), 0);
      await nav(page).getByRole('link', { name: 'Feed', exact: true }).click();
      await page.getByRole('button', { name: 'Continue with Google' }).click();
      await page.waitForURL(origin + '/invitation/feed');
      await page.locator('.feed-post').nth(2).waitFor();
      assert.equal(run.exchanges, 1);
      assert.deepEqual(await page.locator('.feed-post').evaluateAll(posts => posts.map(p => p.dataset.postType)), ['photos', 'wish', 'photos']);
      const carousel = page.locator('.photo-carousel').first();
      assert.equal(await carousel.locator('.carousel-slide').count(), 3);
      assert.equal(await carousel.locator('img').first().getAttribute('alt'), 'Memory 31 — photo 1');
      await carousel.getByRole('button', { name: 'Next photo', exact: true }).click();
      await wait(async () => (await carousel.locator('.carousel-count').textContent()) === '2 / 3', 'Next image');
      await carousel.getByRole('button', { name: 'Show photo 3', exact: true }).click();
      await wait(async () => (await carousel.locator('.carousel-count').textContent()) === '3 / 3', 'Pagination');
      await carousel.locator('.carousel-track').focus(); await page.keyboard.press('ArrowLeft');
      await wait(async () => (await carousel.locator('.carousel-count').textContent()) === '2 / 3', 'Keyboard image navigation');
      if (width === 390) {
        await carousel.locator('.carousel-track').scrollIntoViewIfNeeded();
        const bounds = await carousel.locator('.carousel-track').boundingBox();
        const cdp = await run.context.newCDPSession(page);
        const y = bounds.y + bounds.height / 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + bounds.width * .8, y }] });
        for (let step = 1; step <= 6; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bounds.x + bounds.width * (.8 - step * .1), y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await wait(async () => (await carousel.locator('.carousel-count').textContent()) === '3 / 3', 'Touch swipe advances carousel');
        await carousel.locator('.carousel-track').evaluate(element => new Promise(resolve => {
          let timer;
          const finish = () => { clearTimeout(timer); element.removeEventListener('scroll', idle); resolve(); };
          const idle = () => { clearTimeout(timer); timer = setTimeout(finish, 150); };
          element.addEventListener('scroll', idle); idle();
        }));
        await cdp.detach();
        await carousel.getByRole('button', { name: 'Show photo 2', exact: true }).click();
        await wait(async () => (await carousel.locator('.carousel-count').textContent()) === '2 / 3', 'Return to active report image');
      }
      await page.locator('.feed-post').first().getByRole('button', { name: 'More options' }).click();
      await page.getByRole('button', { name: 'Report this photo', exact: true }).click();
      await wait(() => run.reports.length === 1, 'Report active photo');
      assert.equal(run.reports[0].p_photo, id(32));
      run.photos.find(photo => photo.id === id(32)).hidden = true;
      await page.evaluate(() => window.dispatchEvent(new Event('as-wedding-db')));
      await wait(async () => await carousel.locator('.carousel-slide').count() === 2, 'Host-hidden image removed from carousel');
      await wait(async () => (await carousel.locator('.carousel-count').textContent()) === '1 / 2', 'Moderation resets active image safely');
      await nav(page).getByRole('link', { name: 'Create Post', exact: true }).click();
      await page.getByRole('heading', { name: 'Create Post', exact: true }).waitFor();
      await assertLayout(page);
      await page.screenshot({ path: path.join(root, `artifacts/create-post-${width}.png`), fullPage: true });
      await page.getByRole('link', { name: /Send a Wish/ }).click();
      await page.getByLabel('Your wish or blessing').fill('Wishing you a wonderful life together!');
      await page.reload();
      await wait(async () => (await page.getByLabel('Your wish or blessing').inputValue()) === 'Wishing you a wonderful life together!', 'Wish draft survives reload');
      await page.getByRole('button', { name: 'Send for approval' }).click();
      await page.getByText('Thank you!', { exact: false }).waitFor();
      assert.equal(run.submissions.length, 1);
      await nav(page).getByRole('link', { name: 'Create Post', exact: true }).click();
      await page.getByRole('link', { name: /Upload Photos/ }).click();
      await page.getByLabel('Choose photos from gallery').setInputFiles([path.join(root, 'public/images/couple.webp'), path.join(root, 'public/images/invitation-couple.webp')]);
      await page.getByLabel('Caption (optional)').fill(`A single post at ${width}px`);
      await page.reload();
      await page.getByRole('button', { name: 'Create Post · 2 photos', exact: true }).waitFor();
      assert.equal(await page.getByLabel('Caption (optional)').inputValue(), `A single post at ${width}px`);
      await assertLayout(page);
      await page.screenshot({ path: path.join(root, `artifacts/photo-composer-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Create Post · 2 photos', exact: true }).click();
      await page.waitForURL(origin + '/invitation/feed');
      await page.locator('.post-caption').filter({ hasText: `A single post at ${width}px` }).waitFor();
      await wait(() => run.batches.length === 1, 'Photo post published');
      assert.equal(run.batches.length, 1); assert.equal(run.batches[0].length, 2);
      assert.equal(new Set(run.batches[0].map(p => p.post_id)).size, 1);
      assert.deepEqual(run.batches[0].map(p => p.post_position), [0, 1]);
      assert.equal(await page.locator('.feed-post').first().locator('.carousel-slide').count(), 2);
      for (const size of [320, 390, 768, 1440]) { await page.setViewportSize({ width: size, height: 900 }); await assertLayout(page); }
      fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: path.join(root, `artifacts/unified-feed-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: /Account menu for/ }).click(); await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page.waitForURL(origin + '/invitation'); await page.getByText('Public host update', { exact: true }).waitFor();
      assert.equal(await page.locator('.general-photo-preview').count(), 0);
      assert.deepEqual(run.errors, []);
      await run.context.close();
      console.log(`PASS ${width}px: public privacy, OAuth return, mixed chronology, legacy photos, carousel, active-image reports, moderated wishes, persistent drafts, multi-image post, responsive layout and sign-out`);
    }

    for (const target of ['/invitation/create?type=wish&from=invite#general-content', '/invitation/create?type=photos&quest=proud-moment#general-content', `/g/${token}/feed?from=shared#general-content`, '/app/feed?from=family#general-content']) {
      const run = await scenario(browser, { family: true });
      await run.page.goto(origin + target);
      await run.page.getByRole('button', { name: 'Continue with Google' }).click();
      await run.page.waitForURL(origin + target);
      await run.page.getByRole('button', { name: /Account menu for/ }).waitFor();
      assert.equal(run.exchanges, 1); assert.equal(run.claims, 1);
      if (target.includes('type=wish')) await run.page.getByLabel('Your wish or blessing').waitFor();
      if (target.includes('type=photos')) { await run.page.getByRole('heading', { name: 'Upload Photos', exact: true }).waitFor(); assert.equal(await run.page.getByLabel('Quest tag').inputValue(), 'proud-moment'); }
      assert.deepEqual(run.errors, []); await run.context.close();
    }
    console.log('PASS: exact page, queries, anchor, chosen post type, photo quest and family identity survive OAuth');

    const custom = await scenario(browser, { site: canonical });
    await custom.page.goto('https://anandwedsusmita.vercel.app/invitation/create?type=wish#general-content');
    await custom.page.waitForURL(canonical + '/invitation/create?type=wish#general-content');
    await custom.page.getByRole('button', { name: 'Continue with Google' }).click();
    await custom.page.waitForURL(canonical + '/invitation/create?type=wish#general-content');
    await custom.page.getByLabel('Your wish or blessing').waitFor();
    assert.equal(custom.exchanges, 1); await custom.context.close();
    console.log('PASS: old domain canonicalizes before OAuth; callback and post-login destination stay on custom domain with PKCE intact');

    const offline = await scenario(browser, { initial: 'google' });
    await offline.page.goto(origin + '/invitation/create?type=photos');
    await offline.page.getByLabel('Choose photos from gallery').setInputFiles([path.join(root, 'public/images/couple.webp'), path.join(root, 'public/images/invitation-couple.webp')]);
    await offline.page.getByLabel('Caption (optional)').fill('Offline post retained');
    // Keep local app routing available while simulating a device with no signal.
    await offline.page.evaluate(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }));
    await offline.page.getByRole('button', { name: 'Create Post · 2 photos', exact: true }).click();
    await offline.page.waitForURL(origin + '/invitation/feed');
    await wait(async () => await offline.page.evaluate(async () => (await import('/src/companion/lib/uploadQueue.ts')).pendingCount()) === 2, 'Offline queue');
    assert.equal(offline.batches.length, 0);
    offline.failInsert = true;
    await offline.page.reload();
    await offline.page.getByRole('heading', { name: 'Feed', exact: true }).waitFor();
    await wait(() => offline.requests.some(r => r.method === 'POST' && r.path === '/rest/v1/photos'), 'Initial publish attempt');
    assert.equal(offline.batches.length, 0);
    offline.failInsert = false; offline.loseInsertResponse = true;
    await offline.page.evaluate(async () => (await import('/src/companion/lib/uploadQueue.ts')).flush());
    await wait(() => offline.batches.length === 1, 'Retry after storage already uploaded');
    await offline.page.evaluate(async () => (await import('/src/companion/lib/uploadQueue.ts')).flush());
    await wait(async () => await offline.page.evaluate(async () => (await import('/src/companion/lib/uploadQueue.ts')).pendingCount()) === 0, 'Retry after lost database response');
    assert.equal(offline.batches.length, 1); assert.equal(offline.batches[0].length, 2);
    // Enqueue two independent posts at once while a previous flush has run.
    // Serialized IDB writes must retain both, and legacy queue records still work.
    await offline.page.evaluate(async ({ eventId, token, userId }) => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      const queue = await import('/src/companion/lib/uploadQueue.ts');
      const blob = await (await fetch('/images/invitation-couple.webp')).blob();
      const meta = { uploaderName: 'Google guest', personId: null, generalToken: token, authUserId: userId };
      await Promise.all([queue.enqueuePost(eventId, [blob], meta), queue.enqueuePost(eventId, [blob], meta)]);
      if (await queue.pendingCount() !== 2) throw new Error('Concurrent enqueue lost a post');
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      await queue.flush();
      await queue.enqueue([{ ...meta, eventId, blob }]);
    }, { eventId, token, userId: id(12) });
    await wait(async () => await offline.page.evaluate(async () => (await import('/src/companion/lib/uploadQueue.ts')).pendingCount()) === 0, 'Concurrent and legacy posts flush');
    assert.equal(offline.batches.length, 4);
    assert.equal(offline.batches[3][0].post_id, undefined);
    await offline.page.evaluate(async ({ eventId, token }) => {
      const queue = await import('/src/companion/lib/uploadQueue.ts');
      const blob = await (await fetch('/images/invitation-couple.webp')).blob();
      await queue.enqueuePost(eventId, [blob], { uploaderName: 'Another guest', personId: null, generalToken: token, authUserId: 'different-account' });
      await queue.flush();
    }, { eventId, token });
    assert.equal(offline.batches.length, 4, 'A different account cannot publish queued posts');
    assert.equal(await offline.page.evaluate(async () => (await import('/src/companion/lib/uploadQueue.ts')).pendingCount()), 1);
    await offline.context.close();
    console.log('PASS: offline persistence, atomic publish, Storage retries, lost-response deduplication, concurrent posts, legacy queue and account binding');

    const cancelled = await scenario(browser, { cancel: true });
    await cancelled.page.goto(origin + '/invitation/create?type=wish');
    await cancelled.page.getByRole('button', { name: 'Continue with Google' }).click();
    await cancelled.page.getByText('Google sign-in was cancelled.', { exact: false }).waitFor();
    await cancelled.page.getByRole('link', { name: 'Back to where you left off' }).click();
    await cancelled.page.waitForURL(origin + '/invitation/create?type=wish');
    await cancelled.context.close();
    for (const [initial, gated] of [['email', true], ['host', false]]) {
      const run = await scenario(browser, { initial }); await run.page.goto(origin + '/invitation/feed');
      await run.page.getByRole(gated ? 'button' : 'heading', { name: gated ? 'Continue with Google' : 'Feed', exact: true }).waitFor();
      await run.context.close();
    }
    const security = await scenario(browser, { initial: 'google' }); await security.page.goto(origin + '/invitation/feed');
    const safe = await security.page.evaluate(async () => {
      const { safeGuestPath } = await import('/src/companion/lib/guestAuth.ts');
      return ['https://evil.example', '//evil.example', '/\\evil.example', '/admin', '/auth/callback', '/invitation/../admin', '/invitation/create?type=wish#general-content'].map(safeGuestPath);
    });
    assert.deepEqual(safe, Array(6).fill('/invitation').concat('/invitation/create?type=wish#general-content'));
    for (const [legacy, destination] of [['/invitation/scene?quest=proud-moment', '/invitation/feed?quest=proud-moment'], ['/invitation/haaku?quest=proud-moment', '/invitation/create?quest=proud-moment&type=photos'], ['/invitation#wishes', '/invitation/feed']]) {
      await security.page.goto(origin + legacy); await security.page.waitForURL(origin + destination);
    }
    await security.context.close();
    console.log('PASS: cancellation returns to intent; host access, email gating, redirect validation and old route aliases remain functional');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { scenario, wait, origin, eventId, photo, id };
