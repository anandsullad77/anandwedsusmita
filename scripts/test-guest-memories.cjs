const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'); }
catch { playwright = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core')); }
const { scenario, wait, origin, eventId, id } = require('./test-wedding-browser.cjs');
const root = path.resolve(__dirname, '..');
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const guest = (n, name = `Guest ${n}`) => ({
  id: id(2000 + n), name, email: `guest${n}@gmail.com`, photoPosts: n === 0 ? 1 : 0, photos: n === 0 ? 2 : 0,
  wishes: n < 2 ? 103 : 0, reactions: n === 0 ? 3 : 0,
  firstSeenAt: '2026-11-20T08:00:00Z', lastActiveAt: '2026-11-24T08:00:00Z', firstSignedInAt: '2026-11-20T08:00:00Z', lastSignedInAt: '2026-11-24T08:00:00Z',
});
const guests = [guest(0, 'Same guest'), guest(1, 'Same guest'), ...Array.from({ length: 205 }, (_, n) => guest(n + 2))];
const photoPath = n => `${eventId}/memory-${n}.webp`;
const posts = [
  { id: id(4000), guestId: guests[0].id, name: guests[0].name, email: guests[0].email, author: 'Post display name', kind: 'photo', text: 'A wedding memory', createdAt: '2026-11-24T08:00:00Z', status: 'partly_hidden', photos: [0, 1].map(n => ({ id: id(4100 + n), path: photoPath(n), caption: n === 0 ? '=HYPERLINK("https://example.com")' : 'ಎಲ್ಲರೊಂದಿಗೆ ಒಂದು ನೆನಪು', hidden: n === 1, moment: 'Wedding', questId: null })) },
  ...Array.from({ length: 206 }, (_, n) => {
    const g = guests[n % 2];
    return { id: id(5000 + n), guestId: g.id, name: g.name, email: g.email, author: 'Posted name', kind: 'wish', text: n === 0 ? 'A wish, with "quotes"\nand a new line' : `A happy wish ${n}`, createdAt: '2026-11-23T08:00:00Z', status: n === 0 ? 'pending' : 'approved', photos: [] };
  }),
];
async function downloadText(page, button) {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  const location = await download.path();
  return fs.readFileSync(location, 'utf8');
}
async function noOverflow(page) { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }

(async () => {
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  const runs = [];
  try {
    for (const width of [1440, 390, 320]) {
      const run = await scenario(browser, { initial: 'host', width }); runs.push(run);
      const { page, context } = run;
      const guestCalls = [], postCalls = [];
      let failDirectory = false, failPosts = false, failPhoto = false, failExportPage = false;
      const downloads = [];
      page.on('download', download => downloads.push(download));
      await context.route(url => url.pathname.endsWith('/rpc/admin_wedding_analytics'), route => json(route, { visitors: 220, signedIn: guests.length, photoPosts: 1, wishes: 206, recentPosts: [] }));
      await context.route(url => url.pathname.endsWith('/rpc/admin_wedding_guests'), route => {
        const body = route.request().postDataJSON(); guestCalls.push(body); assert.equal(body.p_event, eventId);
        if (failDirectory) return json(route, { code: 'PGRST202', message: 'Missing migration' }, 404);
        const matching = guests.filter(g => (g.name + ' ' + g.email).toLowerCase().includes(body.p_query.toLowerCase()));
        return json(route, { total: matching.length, guests: matching.slice(body.p_offset, body.p_offset + body.p_limit) });
      });
      await context.route(url => url.pathname.endsWith('/rpc/admin_wedding_guest_posts'), route => {
        const body = route.request().postDataJSON(); postCalls.push(body); assert.equal(body.p_event, eventId);
        if (failPosts) return json(route, { message: 'Temporary memories failure' }, 503);
        if (failExportPage && body.p_offset >= 200 && body.p_limit === 200) return json(route, { message: 'Temporary export failure' }, 503);
        const matching = posts.filter(p => !body.p_user || p.guestId === body.p_user);
        return json(route, { total: matching.length, posts: matching.slice(body.p_offset, body.p_offset + body.p_limit) });
      });
      await context.route(url => url.pathname === '/storage/v1/object/sign/photos', route => failPhoto && route.request().postDataJSON().paths.some(p => p.includes('memory-')) ? json(route, { message: 'Photo temporarily unavailable' }, 503) : route.fallback());
      await page.goto(origin + '/admin/analytics');
      const directory = page.getByRole('region', { name: 'Guest contacts & memories', exact: true });
      await directory.getByText('Showing 1–25 of 207 guests', { exact: true }).waitFor();
      assert.equal(await directory.locator('.guest-contact').count(), 25);
      assert.equal(await directory.getByRole('link', { name: 'guest0@gmail.com', exact: true }).getAttribute('href'), 'mailto:guest0@gmail.com');
      await noOverflow(page);
      await directory.getByRole('button', { name: 'Next guests', exact: true }).click();
      await directory.getByText('Showing 26–50 of 207 guests', { exact: true }).waitFor();
      const input = directory.getByLabel('Find a guest by name or Google email');
      await input.fill('guest0@gmail.com'); await input.press('Enter');
      await directory.getByText('Showing 1–1 of 1 matching guests', { exact: true }).waitFor();
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      await page.screenshot({ path: path.join(root, `artifacts/guest-directory-${width}.png`), fullPage: true });
      const trigger = directory.getByRole('button', { name: 'View memories for Same guest (guest0@gmail.com)', exact: true });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Same guest', exact: true });
      await dialog.getByRole('img').first().waitFor(); assert.equal(await dialog.getByRole('img').count(), 2, 'Every carousel image is visible');
      assert.match(await dialog.innerText(), /Awaiting approval/);
      assert.match(await dialog.innerText(), /Some photos hidden/);
      assert.match(await dialog.innerText(), /24 Nov 2026, 1:30 pm/i);
      assert.ok(await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }));
      await noOverflow(page);
      await page.screenshot({ path: path.join(root, `artifacts/guest-memories-${width}.png`) });
      await dialog.getByRole('button', { name: 'Next memories', exact: true }).click();
      await dialog.getByText('26–50 of 104 posts and wishes · times in IST', { exact: true }).waitFor();
      if (width === 390) {
        await page.setViewportSize({ width, height: 420 });
        await wait(async () => await dialog.locator('footer').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight + 1), 'Footer stays visible on a short phone');
        await page.setViewportSize({ width, height: 900 });
      }
      if (width === 1440) {
        const csv = await downloadText(page, dialog.getByRole('button', { name: 'Export guest memories (CSV)', exact: true }));
        assert.match(csv, /guest0@gmail.com/); assert.ok(!csv.includes('guest1@gmail.com'));
        assert.match(csv, /memory-0\.webp/); assert.match(csv, /memory-1\.webp/);
        assert.ok(csv.includes("'=HYPERLINK"), 'Spreadsheet formulas are neutralized');
        assert.ok(csv.includes('ಎಲ್ಲರೊಂದಿಗೆ ಒಂದು ನೆನಪು'));
        assert.ok(csv.includes('"A wish, with ""quotes""\nand a new line"'));
        assert.ok(!csv.includes('signedURL') && !csv.includes('/storage/v1/'), 'Exports use durable references instead of expiring photo URLs');
      }
      await page.keyboard.press('Escape'); assert.equal(await dialog.count(), 0);
      assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
      // A second account with the same name only shows its own wishes.
      await input.fill('guest1@gmail.com'); await input.press('Enter');
      await directory.getByText('Showing 1–1 of 1 matching guests', { exact: true }).waitFor();
      await directory.getByRole('button', { name: 'View memories for Same guest (guest1@gmail.com)', exact: true }).click();
      await dialog.getByText('1–25 of 103 posts and wishes · times in IST', { exact: true }).waitFor();
      assert.equal(await dialog.getByRole('img').count(), 0); assert.ok(!(await dialog.innerText()).includes('guest0@gmail.com'));
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      // A guest without posts is still kept in the email list.
      await input.fill('guest2@gmail.com'); await input.press('Enter');
      await directory.getByText('Showing 1–1 of 1 matching guests', { exact: true }).waitFor();
      await directory.getByRole('button', { name: 'View memories for Guest 2 (guest2@gmail.com)', exact: true }).click();
      await page.getByText('This guest has not shared photos or wishes yet.', { exact: true }).waitFor();
      await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
      if (width === 1440) {
        // Export all must ignore the current search and fetch subsequent pages.
        const csv = await downloadText(page, directory.getByRole('button', { name: 'Export all guests (CSV)', exact: true }));
        assert.match(csv, /guest0@gmail.com/); assert.match(csv, /guest206@gmail.com/);
        assert.equal(csv.split('\r\n').length, 208); assert.ok(guestCalls.some(c => c.p_offset === 200));
        const allPosts = await downloadText(page, directory.getByRole('button', { name: 'Export all posts & wishes (CSV)', exact: true }));
        assert.match(allPosts, /guest0@gmail.com/); assert.match(allPosts, /guest1@gmail.com/);
        assert.ok(postCalls.some(c => c.p_user === null && c.p_offset === 200));
        const previousDownloads = downloads.length; failExportPage = true;
        await directory.getByRole('button', { name: 'Export all posts & wishes (CSV)', exact: true }).click();
        await directory.getByRole('alert').filter({ hasText: 'Temporary export failure' }).waitFor();
        assert.equal(downloads.length, previousDownloads, 'A failed later page never downloads an incomplete CSV');
        failExportPage = false;
      }
      failDirectory = true;
      await directory.getByRole('button', { name: 'Clear', exact: true }).click();
      await directory.getByRole('alert').filter({ hasText: '0015_guest_memory_directory.sql' }).waitFor();
      assert.equal(await page.getByRole('region', { name: 'Website totals' }).count(), 1, 'Directory setup errors do not hide existing analytics');
      failDirectory = false; await directory.getByRole('button', { name: 'Retry guest list', exact: true }).click();
      await directory.getByText('Showing 1–25 of 207 guests', { exact: true }).waitFor();
      failPosts = true;
      await directory.getByRole('button', { name: 'View memories for Same guest (guest0@gmail.com)', exact: true }).click();
      await page.getByRole('dialog').getByRole('alert').filter({ hasText: 'Temporary memories failure' }).waitFor();
      failPosts = false; failPhoto = true;
      // Clear the in-memory preview cache so the failure reaches the signing API.
      await page.reload();
      await directory.getByText('Showing 1–25 of 207 guests', { exact: true }).waitFor();
      await directory.getByRole('button', { name: 'View memories for Same guest (guest0@gmail.com)', exact: true }).click();
      await page.getByText('Photo preview unavailable. Refresh memories to try again.', { exact: true }).first().waitFor();
      assert.match(await page.getByRole('dialog').innerText(), /A wedding memory/);
      assert.deepEqual(run.errors, []);
      console.log(`PASS ${width}px: guest emails, same-name ownership, all carousel images, search/paging, CSV exports, guest without posts, focus, setup errors and photo failure`);
    }
    const exportSafety = await runs[0].page.evaluate(async () => {
      const { memoryCsv } = await import('/src/companion/admin/guestMemoryExport.ts');
      return memoryCsv([['=formula', '\t+formula', '-formula', '@formula', 'plain', 'ಒಂದು ನೆನಪು']]);
    });
    assert.equal(exportSafety, '\uFEFF"\'=formula","\'\t+formula","\'-formula","\'@formula","plain","ಒಂದು ನೆನಪು"');
    console.log('PASS: UTF-8 CSV, multiline content, formula safety, complete exports beyond 200 records and durable photo references');
  } finally { for (const run of runs) await run.context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
