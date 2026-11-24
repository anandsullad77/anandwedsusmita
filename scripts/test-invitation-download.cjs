const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'); }
catch { playwright = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core')); }
const { scenario, wait, origin } = require('./test-wedding-browser.cjs');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  let run;
  try {
    run = await scenario(browser, { width: 390 });
    await run.page.goto(origin + '/invitation');
    await run.page.getByRole('button', { name: 'Download invitation image', exact: true }).waitFor();
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
      CanvasRenderingContext2D.prototype.fillText = function(value, x, y, ...args) { text.push({ value, x, y, width: this.measureText(value).width, height: this.canvas.height / 1.5 }); return fillText.call(this, value, x, y, ...args); };
      try {
        const blob = await makeInvitationCard(bundle, settings, variant === 'long' ? 'https://anandwedsusmita.in/invitation?from=' + 'wedding'.repeat(40) : 'https://anandwedsusmita.in/invitation');
        const image = await createImageBitmap(blob);
        const dimensions = { width: image.width, height: image.height }; image.close();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return { ...dimensions, type: blob.type, size: blob.size, base64: btoa(binary), sources, text };
      } finally { CanvasRenderingContext2D.prototype.drawImage = drawImage; CanvasRenderingContext2D.prototype.fillText = fillText; }
    }, variant);

    const standard = await render('standard');
    assert.equal(standard.width, 1800); assert.equal(standard.height, 2700); assert.equal(standard.type, 'image/png');
    assert.ok(standard.sources.includes('/images/anand-susmita-portrait.jpg'));
    assert.ok(standard.sources.includes('/images/anand-susmita-invitation.jpg'));
    assert.equal(standard.sources.some(src => src.includes('wedding-couple')), false);
    fs.writeFileSync(path.join(artifacts, 'invitation-download-redesign.png'), Buffer.from(standard.base64, 'base64'));
    for (const variant of ['hidden', 'custom', 'long']) {
      const result = await render(variant);
      assert.equal(result.width, 1800);
      assert.ok(result.text.every(item => item.x >= 60 && item.x + item.width <= 1140 && item.y >= 60 && item.y < item.height - 140), variant + ' text fits inside the card');
      if (variant === 'hidden') assert.equal(result.sources.some(src => /\.jpg$/.test(src)), false);
      if (variant === 'custom') { assert.ok(result.sources.includes('/images/couple.webp')); assert.ok(result.sources.includes('/images/anand-susmita-portrait.jpg')); }
      if (variant === 'long') { assert.ok(result.height > standard.height); fs.writeFileSync(path.join(artifacts, 'invitation-download-long-copy.png'), Buffer.from(result.base64, 'base64')); }
    }
    const downloadPromise = run.page.waitForEvent('download');
    await run.page.getByRole('button', { name: 'Download invitation image', exact: true }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'anand-susmita-invitation.png');
    await download.saveAs(path.join(artifacts, 'invitation-download-mobile.png'));
    await run.page.evaluate(() => { window.__printCount = 0; window.print = () => { window.__printCount++; }; });
    await run.page.getByRole('button', { name: 'Print / Save PDF', exact: true }).click();
    await wait(async () => await run.page.evaluate(() => window.__printCount === 1), 'Print image becomes ready');
    const printImage = await run.page.locator('.invitation-print-root img').evaluate(img => ({ width: img.naturalWidth, height: img.naturalHeight }));
    assert.equal(printImage.width, 1800);
    const pdf = await run.page.pdf({ path: path.join(artifacts, 'invitation-download-print.pdf'), preferCSSPageSize: true, printBackground: true });
    assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 1, 'Invitation prints on one A4 page');
    await run.page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await wait(async () => await run.page.locator('.invitation-print-root').count() === 0, 'Print state is cleaned up');
    await run.page.getByRole('button', { name: 'Print / Save PDF', exact: true }).click();
    await wait(async () => await run.page.evaluate(() => window.__printCount === 2), 'Printing works repeatedly');
    assert.deepEqual(run.errors, []);
    console.log(`PASS: both real photos, 1800×2700 PNG (${Math.round(standard.size / 1024)} KB), mobile download, custom/hidden covers, long-copy wrapping, single-page A4 PDF and repeat printing`);
  } finally { if (run) await run.context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
