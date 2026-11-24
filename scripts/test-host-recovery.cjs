// Real React app and Supabase SDK; email, Auth and database calls are fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { scenario, origin } = require('./test-wedding-browser.cjs');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'); }
catch { playwright = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core')); }
const root = path.resolve(__dirname, '..');
const project = 'https://hfpdujkjdushcqtkhqqs.supabase.co';
const config = { supabaseUrl: project, serviceRoleKey: 'fixture-server-key', anonKey: 'fixture-public-key' };

async function serverChecks() {
  const source = fs.readFileSync(path.join(root, 'supabase/functions/host-password-reset/handler.ts'), 'utf8');
  const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const { handleHostPasswordReset } = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
  const challenge = 'a'.repeat(43), calls = [];
  const makeRequest = (email, redirect = origin + '/admin/reset-password', extra = {}, requestOrigin = origin) => new Request(
    project + '/functions/v1/host-password-reset?redirect_to=' + encodeURIComponent(redirect), {
      method: 'POST', headers: { origin: requestOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code_challenge: challenge, code_challenge_method: 's256', ...extra }),
    });
  const send = async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/rpc/')) return Response.json(JSON.parse(init.body).p_email.toLowerCase() === 'owner@example.com' ? 'owner@example.com' : null);
    return Response.json({});
  };
  const host = await handleHostPasswordReset(makeRequest(' OWNER@example.com '), config, send);
  assert.equal(host.status, 200);
  assert.equal(host.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.headers.apikey, config.serviceRoleKey);
  assert.equal(calls[1].init.headers.apikey, config.anonKey);
  assert.equal(JSON.parse(calls[1].init.body).code_challenge, challenge);
  assert.equal(new URL(calls[1].url).searchParams.get('redirect_to'), origin + '/admin/reset-password');
  const reply = await host.text();
  calls.length = 0;
  const guest = await handleHostPasswordReset(makeRequest('guest@example.com'), config, send);
  assert.equal(guest.status, 200); assert.equal(await guest.text(), reply); assert.equal(calls.length, 1);
  for (const redirect of ['https://evil.example/admin/reset-password', origin + '/invitation', origin + '/admin/reset-password?next=https://evil.example', 'http://localhost:9999/admin/reset-password']) {
    assert.equal((await handleHostPasswordReset(makeRequest('owner@example.com', redirect), config, send)).status, 400);
  }
  assert.equal((await handleHostPasswordReset(makeRequest('owner@example.com', undefined, {}, 'https://evil.example'), config, send)).status, 403);
  assert.equal((await handleHostPasswordReset(makeRequest('owner@example.com', undefined, { code_challenge: null }), config, send)).status, 400);
  assert.equal((await handleHostPasswordReset(makeRequest('invalid'), config, send)).status, 400);
  const savedError = console.error; console.error = () => {};
  try {
    for (const status of [429, 500]) {
      const limited = await handleHostPasswordReset(makeRequest('owner@example.com'), config, async (url, init) =>
        url.includes('/rpc/') ? send(url, init) : Response.json({ message: 'fixture error' }, { status }));
      assert.equal(limited.status, 200); assert.equal(await limited.text(), reply);
    }
    const failed = await handleHostPasswordReset(makeRequest('owner@example.com'), config, async (url, init) => {
      if (url.includes('/rpc/')) return send(url, init);
      throw new Error('fixture network failure');
    });
    assert.equal(await failed.text(), reply);
  } finally { console.error = savedError; }
  assert.equal((await handleHostPasswordReset(makeRequest('owner@example.com'), config, async () => Response.json({}, { status: 503 }))).status, 503);
  assert.equal((await handleHostPasswordReset(new Request(project, { method: 'OPTIONS', headers: { origin } }), config, send)).status, 204);
  console.log('PASS: server checks host eligibility, forwards PKCE safely, rejects foreign redirects and keeps email eligibility private');
}

async function browserChecks() {
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  const artifact = name => path.join(root, 'artifacts', `host-recovery-${name}.png`);
  async function fixture({ initial = 'host', width = 390, failExchange = false, failRequest = false } = {}) {
    const run = await scenario(browser, { initial, width });
    let redirect = '', exchanges = 0, revoked = false;
    const requests = [], updates = [];
    await run.context.route(project + '/functions/v1/host-password-reset**', async route => {
      const request = route.request(), url = new URL(request.url());
      requests.push(request.postDataJSON()); redirect = url.searchParams.get('redirect_to');
      return route.fulfill({ status: failRequest ? 503 : 200, contentType: 'application/json', body: failRequest ? '{"message":"Unavailable"}' : '{}' });
    });
    await run.context.route(project + '/auth/v1/token**', async route => {
      exchanges++;
      if (failExchange) return route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"invalid_grant","message":"Expired code"}' });
      const session = await run.page.evaluate(() => JSON.parse(localStorage.getItem('sb-hfpdujkjdushcqtkhqqs-auth-token')));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...session, expires_in: 3600 }) });
    });
    await run.context.route(project + '/auth/v1/user', async route => {
      if (route.request().method() !== 'PUT') return route.fallback();
      updates.push(route.request().postDataJSON());
      const session = await run.page.evaluate(() => JSON.parse(localStorage.getItem('sb-hfpdujkjdushcqtkhqqs-auth-token')));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session.user) });
    });
    await run.context.route(project + '/rest/v1/hosts**', async route => {
      if (!revoked) return route.fallback();
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    async function request() {
      await run.page.goto(origin + '/admin/forgot-password');
      await run.page.getByLabel('Owner or host email').fill('owner@example.com');
      await run.page.getByRole('button', { name: 'Send reset link', exact: true }).click();
      await run.page.getByRole('status').waitFor();
      assert.ok(requests.at(-1).code_challenge); assert.equal(requests.at(-1).code_challenge_method, 's256');
    }
    async function follow() {
      const callback = new URL(redirect); callback.searchParams.set('code', 'fixture-recovery-code');
      await run.page.goto(callback.href);
    }
    return { ...run, request, follow, requests, updates, get exchanges() { return exchanges; }, revoke() { revoked = true; } };
  }
  try {
    const login = await fixture({ initial: 'anonymous' });
    await login.page.goto(origin + '/admin');
    await login.page.getByLabel('Email', { exact: true }).fill('remembered@example.com');
    await login.page.getByRole('link', { name: 'Forgot password?' }).click();
    assert.equal(await login.page.getByLabel('Owner or host email').inputValue(), 'remembered@example.com');
    await login.page.getByRole('button', { name: 'Send reset link' }).click();
    await login.page.getByRole('status').waitFor(); assert.equal(login.requests.length, 1);
    await login.context.close();
    for (const width of [320, 390, 1440]) {
      const run = await fixture({ width }); await run.request();
      await run.page.screenshot({ path: artifact(`${width}-email`), fullPage: true });
      await run.follow(); await run.page.getByLabel('New password', { exact: true }).waitFor();
      assert.equal(run.exchanges, 1, 'StrictMode exchanges the code once');
      assert.equal(new URL(run.page.url()).search, '', 'Consumed code is removed from the URL');
      await run.page.getByLabel('New password', { exact: true }).fill('a-short-one');
      await run.page.getByLabel('Confirm new password').fill('a-short-one');
      assert.equal(await run.page.getByLabel('New password', { exact: true }).evaluate(input => input.validity.tooShort), true);
      await run.page.getByLabel('New password', { exact: true }).fill('a-long-new-password');
      await run.page.getByLabel('Confirm new password').fill('a-different-password');
      await run.page.getByRole('button', { name: 'Save new password' }).click();
      await run.page.getByRole('alert').waitFor(); assert.equal(run.updates.length, 0);
      await run.page.getByLabel('Confirm new password').fill('a-long-new-password');
      await run.page.screenshot({ path: artifact(`${width}-password`), fullPage: true });
      assert.ok(await run.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await run.page.getByRole('button', { name: 'Save new password' }).click();
      await run.page.getByRole('heading', { name: 'Password updated', exact: true }).waitFor();
      assert.equal(run.updates.length, 1); assert.equal(run.updates[0].password, 'a-long-new-password');
      assert.deepEqual(run.errors, []);
      await run.page.getByRole('link', { name: 'Continue to admin' }).click();
      await run.page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
      await run.context.close();
    }
    console.log('PASS: login recovery link, remembered email, PKCE, one-time exchange, password validation and successful host recovery at 320/390/1440px');
    for (const options of [{ failExchange: true }, { initial: 'email' }]) {
      const run = await fixture(options); await run.request(); await run.follow();
      await run.page.getByRole('alert').waitFor();
      assert.equal(await run.page.getByLabel('New password', { exact: true }).count(), 0);
      assert.equal(run.updates.length, 0); await run.context.close();
    }
    const revoked = await fixture(); await revoked.request(); await revoked.follow();
    await revoked.page.getByLabel('New password', { exact: true }).waitFor(); revoked.revoke();
    await revoked.page.getByLabel('New password', { exact: true }).fill('a-long-new-password');
    await revoked.page.getByLabel('Confirm new password').fill('a-long-new-password');
    await revoked.page.getByRole('button', { name: 'Save new password' }).click();
    await revoked.page.getByRole('alert').waitFor(); assert.equal(revoked.updates.length, 0);
    await revoked.context.close();
    const invalid = await fixture();
    for (const address of ['/admin/reset-password', '/admin/reset-password#error=access_denied&error_code=otp_expired']) {
      await invalid.page.goto(origin + address); await invalid.page.getByRole('alert').waitFor();
      assert.equal(await invalid.page.getByLabel('New password', { exact: true }).count(), 0);
    }
    await invalid.context.close();
    const oauth = await fixture();
    await oauth.page.goto(origin + '/admin/forgot-password');
    const oauthRedirect = await oauth.page.evaluate(async origin => {
      const { supabase } = await import('/src/companion/lib/supabaseClient.ts');
      const { data, error } = await supabase().auth.signInWithOAuth({ provider: 'google', options: {
        skipBrowserRedirect: true, redirectTo: origin + '/admin/reset-password',
      } });
      if (error) throw error;
      return new URL(data.url).searchParams.get('redirect_to');
    }, origin);
    const oauthCallback = new URL(oauthRedirect); oauthCallback.searchParams.set('code', 'fixture-oauth-code');
    await oauth.page.goto(oauthCallback.href); await oauth.page.getByRole('alert').waitFor();
    assert.equal(await oauth.page.getByLabel('New password', { exact: true }).count(), 0);
    assert.equal(oauth.updates.length, 0); await oauth.context.close();
    const unavailable = await fixture({ failRequest: true });
    await unavailable.page.goto(origin + '/admin/forgot-password');
    await unavailable.page.getByLabel('Owner or host email').fill('owner@example.com');
    await unavailable.page.getByRole('button', { name: 'Send reset link' }).click();
    await unavailable.page.getByRole('alert').waitFor();
    assert.equal(await unavailable.page.getByRole('status').count(), 0);
    await unavailable.context.close();
    console.log('PASS: expired/missing links, OAuth codes, non-host recovery, revoked membership and service errors cannot update passwords');
  } finally { await browser.close(); }
}

(async () => { await serverChecks(); await browserChecks(); })().catch(error => { console.error(error); process.exitCode = 1; });
