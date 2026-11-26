const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'); }
catch { playwright = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core')); }
const { scenario, origin, id } = require('./test-wedding-browser.cjs');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  let run;
  try {
    run = await scenario(browser, { width: 390 });
    await run.context.addInitScript(() => {
      window.sharedStatuses = []; window.sharingSupported = true; window.shareOutcome = 'success'; window.copiedCaption = '';
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: data => window.sharingSupported && data.files?.[0]?.type === 'image/png' && typeof data.text === 'string' });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async data => {
        if (window.shareOutcome === 'cancel') throw new DOMException('Canceled', 'AbortError');
        window.sharedStatuses.push({ text: data.text, name: data.files[0].name, size: data.files[0].size, type: data.files[0].type });
      } });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedCaption = text; } } });
    });
    await run.page.goto(origin + '/invitation');
    await run.page.getByRole('button', { name: 'Save image', exact: true }).waitFor();
    const render = variant => run.page.evaluate(async variant => {
      const { makeInvitationCard } = await import('/src/companion/guest/invitationCard.ts');
      const { defaultGeneralSettings } = await import('/src/companion/lib/generalInvitation.ts');
      const { demoEvent, demoFunctions } = await import('/src/companion/lib/demoSeed.ts');
      const settings = defaultGeneralSettings();
      const bundle = { event: { ...demoEvent }, functions: [...demoFunctions], guestName: null };
      if (variant === 'hidden') settings.sections.cover = false;
      if (variant === 'custom') settings.coverUrl = '/images/couple.webp';
      if (variant === 'long') {
        bundle.event.coupleA = 'Anand Vishnu Lakkappa Sullad';
        bundle.event.coupleB = 'Susmita Ramaling Ramappa Pitagi';
        settings.welcomeMessage = 'With love and our elders’ blessings, we warmly invite you and your family to celebrate our wedding. '.repeat(5).slice(0, 500);
        bundle.functions.push({ ...demoFunctions[0], id: 'celebration', nameEn: 'A celebration with our families', venue: 'Shri Shakambari Mangal Karyalaya, Hosakeri Galli, Sulebhavi, Belagavi, Karnataka' });
      }
      const sources = [], text = [];
      const drawImage = CanvasRenderingContext2D.prototype.drawImage;
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) { if (image instanceof HTMLImageElement) sources.push(new URL(image.src).pathname); return drawImage.call(this, image, ...args); };
      CanvasRenderingContext2D.prototype.fillText = function(value, x, y, ...args) {
        const transform = this.getTransform();
        text.push({ value, x: x * transform.a + transform.e, y: y * transform.d + transform.f, width: this.measureText(value).width * transform.a, height: this.canvas.height });
        return fillText.call(this, value, x, y, ...args);
      };
      try {
        const blob = await makeInvitationCard(bundle, settings);
        const image = await createImageBitmap(blob);
        const dimensions = { width: image.width, height: image.height }; image.close();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return { ...dimensions, type: blob.type, size: blob.size, base64: btoa(binary), sources, text };
      } finally { CanvasRenderingContext2D.prototype.drawImage = drawImage; CanvasRenderingContext2D.prototype.fillText = fillText; }
    }, variant);

    const standard = await render('standard');
    assert.equal(standard.width, 1080); assert.equal(standard.height, 1920); assert.equal(standard.type, 'image/png');
    assert.ok(!/OPEN YOUR INVITATION|https?:|localhost|anandwedsusmita\.in/i.test(standard.text.map(item => item.value).join('')), 'Links and invitation prompt stay out of the image');
    assert.equal(standard.sources.filter(src => src === '/images/invitation-floral-corner.svg').length, 4, 'Floral artwork decorates all four corners');
    assert.ok(standard.sources.includes('/images/anand-susmita-portrait.jpg'));
    assert.ok(standard.sources.includes('/images/anand-susmita-invitation.jpg'));
    assert.equal(standard.sources.some(src => src.includes('wedding-couple')), false);
    fs.writeFileSync(path.join(artifacts, 'invitation-download-redesign.png'), Buffer.from(standard.base64, 'base64'));
    for (const variant of ['hidden', 'custom', 'long']) {
      const result = await render(variant);
      assert.equal(result.width, 1080); assert.equal(result.height, 1920);
      assert.ok(result.text.every(item => item.x >= 54 && item.x + item.width <= 1026 && item.y >= 54 && item.y < item.height - 126), variant + ' text fits inside the story');
      if (variant === 'hidden') assert.equal(result.sources.some(src => /\.jpg$/.test(src)), false);
      if (variant === 'custom') { assert.ok(result.sources.includes('/images/couple.webp')); assert.ok(result.sources.includes('/images/anand-susmita-portrait.jpg')); }
      if (variant === 'long') fs.writeFileSync(path.join(artifacts, 'invitation-download-long-copy.png'), Buffer.from(result.base64, 'base64'));
    }
    const downloadPromise = run.page.waitForEvent('download');
    await run.page.getByRole('button', { name: 'Save image', exact: true }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'anand-susmita-invitation.png');
    await download.saveAs(path.join(artifacts, 'invitation-download-mobile.png'));
    const saved = fs.readFileSync(path.join(artifacts, 'invitation-download-mobile.png'));
    assert.equal(saved.readUInt32BE(16), 1080); assert.equal(saved.readUInt32BE(20), 1920);
    const share = run.page.getByRole('button', { name: 'Add to WhatsApp status', exact: true });
    await share.click();
    await run.page.waitForFunction(() => window.sharedStatuses.length === 1);
    const [shared] = await run.page.evaluate(() => window.sharedStatuses);
    const publicLink = 'https://anandwedsusmita.in/invitation?from=status';
    assert.equal(shared.text, `Anand & Susmita are getting married! Join the celebration: ${publicLink}`);
    assert.equal(shared.name, 'anand-susmita-invitation.png'); assert.equal(shared.type, 'image/png');
    assert.ok(shared.size > 10000);
    await run.page.evaluate(() => { window.shareOutcome = 'cancel'; });
    await share.click();
    await run.page.waitForFunction(() => !document.querySelector('.invite-keepsake-share').disabled);
    assert.equal(await run.page.getByRole('alert').count(), 0, 'Canceled sharing shows no error');
    assert.equal((await run.page.evaluate(() => window.sharedStatuses)).length, 1);
    await run.page.evaluate(() => { window.sharingSupported = false; });
    const fallbackDownload = run.page.waitForEvent('download');
    await share.click();
    assert.equal((await fallbackDownload).suggestedFilename(), 'anand-susmita-invitation.png');
    await run.page.getByRole('status').filter({ hasText: 'caption copied' }).waitFor();
    assert.equal(await run.page.evaluate(() => window.copiedCaption), shared.text);
    await run.page.goto(origin + '/g/' + id(2));
    await run.page.getByRole('button', { name: 'Add to WhatsApp status', exact: true }).click();
    await run.page.waitForFunction(() => window.sharedStatuses.length === 1);
    assert.equal((await run.page.evaluate(() => window.sharedStatuses))[0].text, shared.text, 'Tokenized invitations share the same public link');
    for (const width of [320, 390, 1440]) {
      await run.page.setViewportSize({ width, height: 900 });
      assert.equal(await run.page.getByRole('button', { name: 'Print / Save PDF', exact: true }).count(), 0);
      assert.ok(!/print a copy/i.test(await run.page.locator('#invitation-download').innerText()));
      assert.ok(await run.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    assert.deepEqual(run.errors, []);
    console.log(`PASS: floral 1080×1920 story PNG (${Math.round(standard.size / 1024)} KB), both photos, no baked-in link/prompt, image+caption sharing with the public invitation link, cancellation and download/clipboard fallback, custom/hidden covers, long-copy fitting, 320–1440px`);
  } finally { if (run) await run.context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
