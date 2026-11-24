const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'); }
catch { playwright = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core')); }
const { scenario, wait, origin } = require('./test-wedding-browser.cjs');
const root = path.resolve(__dirname, '..');
const privateRequest = request => /\/rest\/v1\/(photos|guestbook_messages|akshate)|\/rpc\/photo_quest_summary|\/storage\/v1\/.*\/photos(?:\/|$)/.test(request.path);

(async () => {
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  const runs = [];
  try {
    const host = await scenario(browser, { initial: 'host', width: 1440 }); runs.push(host);
    await host.page.goto(origin + '/admin/general');
    await host.page.getByRole('heading', { name: 'Photos before sign-in', exact: true }).waitFor();
    const save = host.page.getByRole('button', { name: 'Save invitation changes', exact: true });
    const upload = async (index, filename) => {
      const image = host.page.locator('.invitation-preview-slot').nth(index).locator('img');
      const previous = await image.count() ? await image.getAttribute('src') : null;
      await host.page.getByLabel(`Preview photo ${index + 1}`, { exact: true }).setInputFiles(path.join(root, 'public/images', filename));
      await wait(async () => await image.count() && await image.getAttribute('src') !== previous, 'Prepared preview ' + (index + 1));
      await wait(async () => await save.isEnabled(), 'Preview preparation completed');
      assert.ok(await image.evaluate(async img => { await img.decode(); return Math.max(img.naturalWidth, img.naturalHeight) <= 1200; }), 'Previews are compressed to at most 1200px');
    };
    await upload(0, 'anand-susmita-invitation.jpg');
    await upload(1, 'anand-susmita-portrait.jpg');
    await upload(2, 'invitation-couple.webp');
    assert.equal(await host.page.locator('.invitation-preview-sample .general-photo-preview img').count(), 3);
    await save.click();
    await host.page.getByText('Invitation saved.', { exact: false }).waitFor();
    assert.equal(host.settingsSaves.length, 1);
    assert.equal(host.invitationSettings.preview_photo_paths.length, 3);
    assert.equal(host.storage.size, 3);
    const originalPaths = [...host.invitationSettings.preview_photo_paths];
    await host.page.reload();
    await host.page.locator('.invitation-preview-slot img').nth(2).waitFor();
    assert.equal(await save.isDisabled(), true, 'Saved previews survive reload');

    host.failSettingsSave = true;
    await upload(0, 'couple.webp');
    await save.click();
    await host.page.getByRole('alert').filter({ hasText: 'Temporary settings failure' }).waitFor();
    assert.deepEqual(host.invitationSettings.preview_photo_paths, originalPaths, 'A failed save keeps published previews intact');
    assert.equal(host.storage.size, 3, 'Failed uploads/settings saves clean up staged files');
    host.failSettingsSave = false;
    await save.click();
    await host.page.getByText('Invitation saved.', { exact: false }).waitFor();
    assert.notEqual(host.invitationSettings.preview_photo_paths[0], originalPaths[0]);
    assert.equal(host.storage.size, 3, 'Replacements remove retired files');
    assert.equal(host.storage.has(originalPaths[0]), false);
    await host.page.getByRole('button', { name: 'Remove preview photo 2', exact: true }).click();
    await host.page.getByRole('button', { name: 'Discard changes', exact: true }).click();
    assert.equal(await host.page.locator('.invitation-preview-slot img').count(), 3, 'Discard restores all three saved selections');
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    for (const width of [320, 390, 1440]) {
      await host.page.setViewportSize({ width, height: 900 });
      assert.ok(await host.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Admin preview slots fit at ' + width);
    }
    await host.page.screenshot({ path: path.join(root, 'artifacts/admin-invitation-previews.png'), fullPage: true });

    for (const width of [390, 1440]) {
      const guest = await scenario(browser, { width, previewPaths: host.invitationSettings.preview_photo_paths }); runs.push(guest);
      await guest.page.goto(origin + '/invitation');
      const preview = guest.page.locator('.general-photo-preview');
      await preview.locator('img').nth(2).waitFor();
      assert.equal(await preview.locator('img').count(), 3);
      assert.equal(guest.requests.filter(privateRequest).length, 0, 'Signed-out visitors never fetch the private feed');
      await preview.scrollIntoViewIfNeeded();
      await wait(async () => await preview.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), 'Public previews load');
      await guest.page.screenshot({ path: path.join(root, `artifacts/public-invitation-previews-${width}.png`), fullPage: true });
      assert.ok(await guest.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await preview.click();
      await guest.page.getByRole('button', { name: 'Continue with Google' }).waitFor();
      assert.equal(guest.requests.filter(privateRequest).length, 0);
      await guest.page.getByRole('button', { name: 'Continue with Google' }).click();
      await guest.page.locator('.feed-post[data-post-type="photos"]').first().waitFor();
      await guest.page.getByRole('navigation', { name: 'Wedding', exact: true }).getByRole('link', { name: 'Invitation', exact: true }).click();
      await wait(async () => await guest.page.locator('.general-photo-preview img').evaluateAll(images => images.length === 3 && images.every(image => image.src.includes('/object/sign/photos/'))), 'Signed-in guests see actual feed photos');
      assert.equal(await guest.page.getByText('Sign in to see all memories', { exact: true }).count(), 0);
      assert.deepEqual(guest.errors, []);
    }
    await host.page.getByRole('button', { name: 'Remove preview photo 2', exact: true }).click();
    await save.click();
    await host.page.getByText('Invitation saved.', { exact: false }).waitFor();
    assert.equal(host.invitationSettings.preview_photo_paths.length, 2);
    assert.equal(host.storage.size, 2, 'Removing a preview releases its storage');
    assert.deepEqual(host.errors, []);
    console.log('PASS: admin upload/compression/save/reload/retry/discard/removal; signed-out previews; private feed gate; signed-in latest photos; 320–1440px layouts');
  } finally { for (const run of runs) await run.context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
