// Real PostgreSQL functions, RLS and migrations in an isolated local database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const wedding = id(1), otherWedding = id(2), family = id(20), single = id(30), outsiderFamily = id(40), user = id(11), outsider = id(12);
const results = [];

(async () => {
  const db = new PGlite();
  const files = path.resolve(__dirname, '../supabase/migrations');
  const apply = file => db.exec(fs.readFileSync(path.join(files, file), 'utf8').replace('create extension if not exists pgcrypto;', ''));
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage; create schema extensions;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}', email_confirmed_at timestamptz);
      create table auth.identities (user_id uuid references auth.users, provider text, identity_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function public.gen_random_bytes(n int) returns bytea language sql as $$ select decode(substr(repeat(md5(random()::text), 2), 1, n*2), 'hex') $$;
      create function extensions.gen_salt(text) returns text language sql as $$ select 'fixture'::text $$;
      create function extensions.crypt(text,text) returns text language sql as $$ select 'fixture:' || $1 $$;
      create table storage.buckets (id text primary key, name text, public boolean);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/') $$;
    `);
    for (const file of fs.readdirSync(files).sort()) await apply(file);
    for (const [event, slug] of [[wedding, 'anand-susmita'], [otherWedding, 'other']]) await db.query("insert into events(id,slug,title,couple_a,couple_b,starts_at,venue,pin_hash) values ($1,$2,'Wedding','Anand','Susmita',now(),'Venue','fixture')", [event, slug]);
    for (const uid of [user, outsider]) await db.query('insert into auth.users(id) values ($1)', [uid]);
    for (const n of [3, 4, 5]) await db.query("insert into event_functions(id,event_id,name_en,starts_at) values ($1,$2,'Event',now())", [id(n), n === 5 ? otherWedding : wedding]);
    for (const [hh, kind, cap] of [[family, 'family', 4], [single, 'individual', 1], [outsiderFamily, 'family', 2]]) await db.query("insert into households(id,event_id,name,token,invitation_type,cap,function_ids) values ($1,$2,'QA invitation',$3,$4,$5,$6)", [hh, wedding, `token-${hh}`, kind, cap, [id(3), id(4)]]);
    for (const [pid, hh] of [[id(21), family], [id(22), family], [id(31), single], [id(41), outsiderFamily]]) await db.query("insert into people(id,event_id,household_id,name,phone) values ($1,$2,$3,'QA guest','+919876543210')", [pid, wedding, hh]);
    await db.exec('grant usage on schema public,auth to anon,authenticated; grant select on all tables in schema public to authenticated;');
    const asUser = async uid => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid || '']); await db.exec(uid ? 'set role authenticated' : 'set role anon'); };
    const admin = async callback => { await db.exec('reset role'); return callback(); };
    const bundle = () => db.query('select invite_bundle($1) as data', [`token-${family}`]).then(r => r.rows[0].data);
    const claim = (token = `token-${family}`, pid = id(21)) => db.query('select claim_person($1,$2)', [token, pid]);
    const payload = overrides => ({ requestId: id(1000), coming: 'yes', attendance: [{ personId: id(21), functionIds: [id(3)] }, { personId: id(22), functionIds: [] }], add: [], travel: null, stay: null, blessing: 'With love', summary: 'RSVP QA', ...overrides });
    const save = (reply = payload(), event = wedding) => db.query('select save_rsvp($1,$2::jsonb)', [event, JSON.stringify(reply)]);
    const state = () => admin(async () => ({
      household: (await db.query('select coming,travel,stay,blessing from households where id=$1', [family])).rows[0],
      people: (await db.query('select name,is_child,attending from people where household_id=$1 order by created_at,id', [family])).rows,
      changes: (await db.query('select count(*)::int as n from household_changes where household_id=$1', [family])).rows[0].n,
    }));
    const reset = async () => {
      await db.exec('reset role');
      await db.query('delete from people where household_id=$1 and id not in ($2,$3)', [family, id(21), id(22)]);
      await db.query('delete from household_changes where household_id=$1', [family]);
      await db.query("update households set cap=4,function_ids=$2,coming=null,travel=null,stay=null,blessing=null where id=$1", [family, [id(3), id(4)]]);
      await db.query("update people set attending='{}' where household_id=$1", [family]);
      await asUser(user); await claim();
    };
    const check = async (name, action) => {
      await reset();
      try { await action(); results.push({ name, status: 'passed' }); console.log('PASS: ' + name); }
      catch (error) { results.push({ name, status: 'failed', error: error.message }); console.error('FAIL: ' + name + '\n' + error.message); }
    };
    await check('saved message and attendance round trip through invitation RPC', async () => {
      await save(); const data = await bundle();
      assert.equal(data.household.blessing, 'With love'); assert.equal(data.household.invitationType, 'family');
      assert.deepEqual(data.people[0].attending, [id(3)]);
    });
    await check('token read works without Google and never exposes phone numbers', async () => {
      await asUser(null); const data = await bundle();
      assert.equal(data.people.length, 2); assert.ok(data.people.every(p => !('phone' in p)));
      assert.equal((await db.query("select invite_bundle('invalid') as data")).rows[0].data, null);
      await assert.rejects(save(), /permission denied/);
    });
    await check('unlinked accounts cannot reply or claim another family member', async () => {
      await asUser(outsider); await assert.rejects(save(), /Open your family invitation/);
      await assert.rejects(claim(`token-${family}`, id(41)), /person not in household/);
    });
    await check('reply cannot target a different wedding', async () => { await assert.rejects(save(payload(), otherWedding), /Open your family invitation/); });
    await check('child addition, attendance and history save atomically', async () => {
      await save(payload({ add: [{ name: '  Child guest  ', isChild: true, functionIds: [id(4)] }] }));
      const s = await state(); assert.equal(s.changes, 1); assert.equal(s.household.coming, 'yes');
      assert.deepEqual(s.people.find(p => p.name === 'Child guest'), { name: 'Child guest', is_child: true, attending: [id(4)] });
    });
    await check('identical retry creates no duplicate people or history', async () => {
      const reply = payload({ add: [{ name: 'Extra guest', functionIds: [id(3)] }] });
      await save(reply); await save(reply);
      const s = await state(); assert.equal(s.people.length, 3); assert.equal(s.changes, 1);
    });
    await check('changed retry cannot silently discard a new reply', async () => {
      await save(); await assert.rejects(save(payload({ coming: 'no', attendance: [{ personId: id(21), functionIds: [] }] })), /already.*received|reopen/i);
    });
    await check('a new request can change a confirmed reply to a decline', async () => {
      await save(); await save(payload({ requestId: id(1001), coming: 'no', attendance: [{ personId: id(21), functionIds: [] }] }));
      const s = await state(); assert.equal(s.household.coming, 'no'); assert.equal(s.changes, 2); assert.ok(s.people.every(p => p.attending.length === 0));
    });
    await check('retries from before the migration remain idempotent', async () => {
      await save();
      await admin(() => db.query('update household_changes set request_fingerprint=null where household_id=$1', [family]));
      await asUser(user); await save(); assert.equal((await state()).changes, 1);
    });
    await check('invalid attendance answers are rejected before changing the reply', async () => {
      for (const coming of [null, '', 'maybe']) await assert.rejects(save(payload({ coming })), /whether you can attend/);
      assert.equal((await state()).household.coming, null);
    });
    await check('capacity failure rolls back every addition and the RSVP', async () => {
      await admin(() => db.query('update households set cap=2 where id=$1', [family])); await asUser(user);
      await assert.rejects(save(payload({ add: [{ name: 'One too many', functionIds: [id(3)] }] })), /family is full/);
      const s = await state(); assert.equal(s.people.length, 2); assert.equal(s.changes, 0); assert.equal(s.household.coming, null);
    });
    await check('blank and overlong names never create family members', async () => {
      for (const name of ['   ', 'x'.repeat(81)]) await assert.rejects(save(payload({ add: [{ name, functionIds: [id(3)] }] })), /1 and 80/);
      assert.equal((await state()).people.length, 2);
    });
    await check('uninvited events and foreign people are rejected with full rollback', async () => {
      await assert.rejects(save(payload({ attendance: [{ personId: id(21), functionIds: [id(5)] }] })), /only the events/);
      await assert.rejects(save(payload({ add: [{ name: 'Should roll back', functionIds: [id(3)] }], attendance: [{ personId: id(41), functionIds: [id(3)] }] })), /family member has changed/);
      const s = await state(); assert.equal(s.people.length, 2); assert.equal(s.changes, 0);
    });
    await check('a stale invitation cannot assign another wedding’s event', async () => {
      await admin(() => db.query('update households set function_ids=$2 where id=$1', [family, [id(3), id(5)]])); await asUser(user);
      await assert.rejects(save(payload({ attendance: [{ personId: id(21), functionIds: [id(5)] }] })), /only the events/);
    });
    await check('attending requires at least one invited guest and event on the server', async () => {
      await assert.rejects(save(payload({ attendance: [{ personId: id(21), functionIds: [] }, { personId: id(22), functionIds: [] }] })), /at least one guest.*event/);
      assert.equal((await state()).changes, 0);
    });
    await check('declining always clears attendance, arrival and accommodation', async () => {
      await save(payload({ coming: 'no', travel: { mode: 'car' }, stay: { manage: true, nights: [] } }));
      const s = await state(); assert.equal(s.household.coming, 'no'); assert.equal(s.household.travel, null); assert.equal(s.household.stay, null);
      assert.ok(s.people.every(p => p.attending.length === 0));
    });
    await check('an individual invitation cannot acquire a second person', async () => {
      await claim(`token-${single}`, id(31));
      await assert.rejects(save(payload({ attendance: [{ personId: id(31), functionIds: [id(3)] }], add: [{ name: 'Extra person', functionIds: [id(3)] }] })), /family is full/);
    });
    if (process.argv.includes('--browser')) {
      let playwright;
      try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'); }
      catch { playwright = require(path.resolve(__dirname, '../../.work-tools/node_modules/playwright-core')); }
      const { scenario, origin } = require('./test-wedding-browser.cjs');
      const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
      try {
        for (const [hh, kind, pid] of [[family, 'family', id(21)], [single, 'individual', id(31)]]) await check(`real browser + SQL: ${kind} decline to yes, save, reopen and decline with message`, async () => {
          await admin(() => db.query("update households set coming='no' where id=$1", [hh])); await asUser(user);
          const run = await scenario(browser, { width: 390 });
          const { page, context } = run;
          try {
            await context.route('**/rest/v1/rpc/*', async route => {
              const rpc = new URL(route.request().url()).pathname.split('/').pop();
              if (!['invite_bundle', 'claim_person', 'save_rsvp'].includes(rpc)) return route.fallback();
              const p = route.request().postDataJSON();
              try {
                const result = rpc === 'invite_bundle' ? await db.query('select invite_bundle($1) as data', [p.p_token])
                  : rpc === 'claim_person' ? await db.query('select claim_person($1,$2) as data', [p.p_token, p.p_person])
                  : await db.query('select save_rsvp($1,$2::jsonb) as data', [p.p_event, JSON.stringify(p.p_payload)]);
                return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rpc === 'save_rsvp' ? null : result.rows[0].data) });
              } catch (error) { return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: error.message, code: error.code }) }); }
            });
            const url = origin + '/i/token-' + hh;
            await page.goto(url); await page.getByRole('heading', { name: 'Will you join us?', exact: true }).waitFor();
            assert.equal(await page.getByLabel(/^Sorry,/).isChecked(), true);
            if (kind === 'family') await page.getByLabel('Who is replying?').selectOption(pid);
            await page.getByLabel(/^Yes,/).check();
            if (kind === 'family') {
              await page.getByRole('group', { name: 'Who is coming?' }).getByRole('checkbox').nth(1).uncheck();
              await page.getByRole('button', { name: '+ Add family member', exact: true }).click();
              await page.getByLabel('New family member 1', { exact: true }).fill('SQL child guest');
              await page.locator('.rsvp-added-member').getByLabel('Child', { exact: true }).check();
            }
            await page.getByRole('button', { name: /^Continue/ }).click();
            await page.getByLabel(/confirm this later$/).check();
            await page.getByRole('button', { name: /^Continue/ }).click();
            await page.getByRole('button', { name: /^Send (my|our) reply$/ }).click(); await page.waitForURL(origin + '/app');
            const first = (await db.query('select invite_bundle($1) as data', ['token-' + hh])).rows[0].data;
            assert.equal(first.household.coming, 'yes'); assert.equal(first.people.filter(p => p.attending.length).length, kind === 'family' ? 2 : 1);
            await page.goto(url); await page.getByLabel(/^Sorry,/).check();
            await page.getByLabel('Message to the hosts (optional)').fill('Love and blessings from our family');
            await page.getByRole('button', { name: /^Continue/ }).click();
            await page.getByRole('button', { name: /^Send (my|our) reply$/ }).click(); await page.waitForURL(origin + '/app');
            await page.goto(url);
            assert.equal(await page.getByLabel('Message to the hosts (optional)').inputValue(), 'Love and blessings from our family');
            const final = (await db.query('select invite_bundle($1) as data', ['token-' + hh])).rows[0].data;
            assert.equal(final.household.coming, 'no'); assert.ok(final.people.every(p => p.attending.length === 0));
            assert.equal(run.exchanges, 0); assert.deepEqual(run.errors, []);
          } finally { await context.close(); }
        });
      } finally { await browser.close(); }
    }
    const fix = fs.readdirSync(files).find(file => file.endsWith('_rsvp_reply_integrity.sql'));
    if (fix) await check('RSVP migration is safe to rerun without changing saved replies', async () => {
      await save(); const before = await state(); await apply(fix); await apply(fix);
      assert.deepEqual(await state(), before);
      await asUser(null); assert.equal((await bundle()).household.blessing, 'With love');
    });
  } finally {
    fs.mkdirSync(path.resolve(__dirname, '../artifacts'), { recursive: true });
    fs.writeFileSync(path.resolve(__dirname, '../artifacts/rsvp-db-results.json'), JSON.stringify(results, null, 2));
    await db.close();
  }
  const failed = results.filter(r => r.status === 'failed');
  console.log(`${results.length - failed.length}/${results.length} RSVP database scenarios passed`);
  if (failed.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
