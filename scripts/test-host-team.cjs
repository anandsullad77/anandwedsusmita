const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { scenario, origin, eventId, id } = require('./test-wedding-browser.cjs');
const { chromium } = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core'));
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
(async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../supabase/functions/host-team/handler.ts'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const { handleHostTeam } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  const config = { supabaseUrl: 'https://fixture.supabase.co', serviceRoleKey: 'server-key', anonKey: 'public-key' };
  let owner = true, confirmed = false, existing = false, mailFails = false;
  const calls = [];
  const send = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: id(10) });
    if (url.endsWith('/host_team_target')) return owner ? Response.json(existing ? { id: id(20), email: 'new@example.com', confirmed, role: 'cohost' } : null) : Response.json({ message: 'Denied' }, { status: 403 });
    if (url.endsWith('/admin/users')) return Response.json({ id: id(20), email: 'new@example.com' });
    if (url.endsWith('/host_team_add')) return Response.json(true);
    return Response.json({}, { status: mailFails ? 503 : 200 });
  };
  const request = (action, extras = {}) => new Request(config.supabaseUrl, { method: 'POST', headers: { Origin: origin, Authorization: 'Bearer owner-session', 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId, redirectTo: origin + '/admin/reset-password', ...action, ...extras }) });
  const invite = { action: 'invite', name: 'New host', email: 'new@example.com', role: 'cohost' };
  let response = await handleHostTeam(request(invite), config, send);
  assert.equal((await response.json()).emailSent, true);
  assert.ok(calls.findIndex(c => c.url.endsWith('/host_team_add')) < calls.findIndex(c => c.url.includes('/invite?')), 'Grant before sending');
  assert.equal(JSON.parse(calls.find(c => c.url.endsWith('/host_team_add')).init.body).p_actor, id(10));
  assert.ok(!calls.some(c => String(c.init.body).includes('password')));
  owner = false; calls.length = 0;
  assert.equal((await handleHostTeam(request(invite), config, send)).status, 403);
  assert.equal(calls.length, 2, 'Nonowners cannot create accounts or send mail'); owner = true;
  assert.equal((await handleHostTeam(request(invite, { redirectTo: 'https://evil.example/admin/reset-password' }), config, send)).status, 400);
  existing = true; confirmed = true; calls.length = 0;
  response = await handleHostTeam(request({ action: 'reset', userId: id(20) }), config, send);
  assert.equal((await response.json()).emailSent, true);
  assert.ok(calls.some(c => c.url.includes('/recover?')));
  assert.ok(!calls.some(c => String(c.init.body).includes('code_challenge')), 'Recipient does not need the sender’s browser');
  mailFails = true;
  assert.equal((await (await handleHostTeam(request({ action: 'reset', userId: id(20) }), config, send)).json()).emailSent, false);
  console.log('PASS: verified caller, owner checks, invite/reset dispatch, foreign redirects and mail failures');
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      const run = await scenario(browser, { initial: 'host', width });
      let members = [{ id: id(10), name: 'Owner', email: 'owner@example.com', role: 'owner', confirmed: true }];
      const actions = [];
      await run.context.route(url => url.pathname.endsWith('/rpc/admin_host_team'), route => json(route, { currentUserId: id(10), canManage: true, members }));
      await run.context.route(url => url.pathname.endsWith('/functions/v1/host-team'), route => {
        const body = route.request().postDataJSON(); actions.push(body);
        if (body.action === 'invite') members.push({ id: id(20), name: body.name, email: body.email, role: body.role, confirmed: false });
        return json(route, { accessAdded: body.action === 'invite', emailSent: true, message: 'Password link sent.' });
      });
      await run.page.goto(origin + '/admin/hosts');
      await run.page.getByLabel('Host name', { exact: true }).fill('New host');
      await run.page.getByLabel('Host email', { exact: true }).fill('new@example.com');
      await run.page.getByLabel('Access level', { exact: true }).selectOption('owner');
      await run.page.getByRole('button', { name: 'Add host & send password link', exact: true }).click();
      await run.page.getByRole('heading', { name: 'New host', exact: true }).waitFor();
      assert.equal(actions[0].role, 'owner');
      await run.page.locator('.host-team-member').filter({ hasText: 'new@example.com' }).getByRole('button').click();
      assert.equal(actions.at(-1).action, 'reset');
      assert.ok(await run.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await run.page.screenshot({ path: path.resolve(__dirname, `../artifacts/host-team-${width}.png`), fullPage: true });
      assert.deepEqual(run.errors, []); await run.context.close();
    }
    console.log('PASS: desktop/mobile add co-owner, team refresh and password-link action');
    const recipient = await scenario(browser, { initial: 'host' });
    await recipient.page.goto(origin + '/admin');
    const session = await recipient.page.evaluate(() => JSON.parse(localStorage.getItem('sb-hfpdujkjdushcqtkhqqs-auth-token')));
    const fragment = new URLSearchParams({ access_token: session.access_token, refresh_token: session.refresh_token, type: 'invite' });
    // This browser never requested the email or stored a PKCE verifier.
    await recipient.page.goto(origin + '/admin/reset-password#' + fragment);
    await recipient.page.getByLabel('New password', { exact: true }).waitFor();
    assert.equal(new URL(recipient.page.url()).hash, '');
    await recipient.page.getByLabel('New password', { exact: true }).fill('a-long-host-password');
    await recipient.page.getByLabel('Confirm new password', { exact: true }).fill('a-long-host-password');
    await recipient.context.route('**/auth/v1/user', route => route.request().method() === 'PUT' ? json(route, session.user) : route.fallback());
    await recipient.page.getByRole('button', { name: 'Save new password', exact: true }).click();
    await recipient.page.getByRole('heading', { name: 'Password updated', exact: true }).waitFor();
    await recipient.context.close();
    console.log('PASS: recipient-device invite callback, token removal and password setup without sender PKCE');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
