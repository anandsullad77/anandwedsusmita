const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

// Local PostgreSQL checks. Supabase's Auth/Storage schemas are fixtures; no live
// project or Google account is touched. pgcrypto helpers are fixture stubs.
const root = path.resolve(__dirname, '..');
const id = number => `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
const wedding = id(1), other = id(2), host = id(10), anonymous = id(11), google = id(12), outsider = id(13), email = id(14), family = id(15);
async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage; create schema extensions;
      create table auth.users (id uuid primary key, email text);
      create table auth.identities (user_id uuid references auth.users, provider text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function public.gen_random_bytes(n int) returns bytea language sql as $$ select decode(substr(repeat(md5(random()::text), 2), 1, n*2), 'hex') $$;
      create function extensions.gen_salt(text) returns text language sql as $$ select 'fixture'::text $$;
      create function extensions.crypt(text,text) returns text language sql as $$ select 'fixture:' || $1 $$;
      create table storage.buckets (id text primary key, name text, public boolean);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/') $$;
    `);
    const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).sort();
    for (const file of migrations) await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8').replace('create extension if not exists pgcrypto;', ''));
    console.log(`PASS: ${migrations.length} migrations execute in order`);
    for (const user of [host, anonymous, google, outsider, email, family]) await db.query('insert into auth.users values ($1,$2)', [user, `${user}@example.com`]);
    await db.query("insert into auth.identities values ($1,'google'),($2,'google'),($3,'email')", [google, outsider, email]);
    for (const [event, slug] of [[wedding, 'anand-susmita'], [other, 'another-wedding']]) {
      await db.query("insert into events (id,slug,title,couple_a,couple_b,starts_at,venue,pin_hash) values ($1,$2,'Wedding','Anand','Susmita',now(),'Venue','fixture')", [event, slug]);
      await db.query('insert into general_invites (event_id) values ($1)', [event]);
      await db.query('insert into general_invitation_settings (event_id) values ($1)', [event]);
    }
    await db.query("insert into hosts (event_id,user_id,role) values ($1,$2,'owner')", [wedding, host]);
    await db.query("insert into households (id,event_id,name,token) values ($1,$2,'Private family','family-token')", [id(20), wedding]);
    await db.query("insert into people (id,event_id,household_id,name) values ($1,$2,$3,'Family guest')", [id(21), wedding, id(20)]);
    await db.query("insert into announcements (event_id,body) values ($1,'Public host update')", [wedding]);
    for (const [photo, event, hidden] of [[id(30), wedding, false], [id(31), wedding, true], [id(32), other, false]]) {
      await db.query("insert into photos (id,event_id,storage_path,uploader_name,uploaded_by,hidden) values ($1,$2,$3,'Guest',$4,$5)", [photo, event, `${event}/${photo}.webp`, google, hidden]);
      await db.query("insert into storage.objects (bucket_id,name) values ('photos',$1)", [`${event}/${photo}.webp`]);
    }
    await db.query("insert into storage.objects (bucket_id,name) values ('invitation-covers',$1)", [`${wedding}/cover.webp`]);
    for (const [wish, event, status] of [[id(40), wedding, 'approved'], [id(41), wedding, 'pending'], [id(42), other, 'approved']]) {
      await db.query("insert into guestbook_messages (id,event_id,user_id,request_id,name,message,status,created_at) values ($1,$2,$3,$1,'Guest','A private guestbook wish',$4,now() - interval '1 hour')", [wish, event, google, status]);
    }
    const token = (await db.query('select token::text from general_invites where event_id=$1', [wedding])).rows[0].token;
    const otherToken = (await db.query('select token::text from general_invites where event_id=$1', [other])).rows[0].token;
    await db.exec('grant usage on schema public,auth,storage to anon,authenticated; grant select,insert,update,delete on all tables in schema public,storage to authenticated; grant usage,select on all sequences in schema public to authenticated;');
    const asUser = async user => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user || '']); await db.exec(user ? 'set role authenticated' : 'set role anon'); };
    const rows = async table => (await db.query(`select * from ${table}`)).rows;
    const upload = () => db.query("insert into storage.objects (bucket_id,name) values ('photos',$1)", [`${wedding}/new.webp`]);
    const wish = request => db.query('select submit_guestbook_wish($1,$2,$3,$4)', [token, 'Guest', 'Wishing you a wonderful life together!', request]);

    await asUser(anonymous);
    const publicInvite = (await db.query('select open_wedding_invite() as invite')).rows[0].invite;
    assert.equal(publicInvite.bundle.event.slug, 'anand-susmita');
    assert.equal((await rows('general_invitation_settings')).length, 1);
    assert.equal((await rows('announcements')).length, 1);
    assert.equal((await rows('storage.objects')).filter(row => row.bucket_id === 'invitation-covers').length, 1);
    assert.deepEqual(await rows('photos'), []);
    assert.deepEqual(await rows('guestbook_messages'), []);
    assert.equal((await rows('storage.objects')).filter(row => row.bucket_id === 'photos').length, 0);
    await assert.rejects(upload(), /row-level security/);
    await assert.rejects(wish(id(50)), /Sign in with Google/);
    await assert.rejects(db.query('select photo_quest_summary($1)', [wedding]), /Sign in with Google/);
    await assert.rejects(db.query('select flag_photo($1,$2)', [id(30), 'Report']), /Sign in with Google/);
    for (const query of [
      'select submit_guestbook_wish_before_google($1,$2,$3,$4)',
    ]) await assert.rejects(db.query(query, [token, 'Guest', 'No bypass', id(51)]), /permission denied/);
    await assert.rejects(db.query('select photo_quest_summary_before_google($1)', [wedding]), /permission denied/);
    await assert.rejects(db.query('select flag_photo_before_google($1,$2)', [id(30), 'No bypass']), /permission denied/);
    console.log('PASS: public invitation, cover and updates remain accessible; anonymous photos, wishes, uploads, aggregates and RPC bypasses are denied');

    await asUser(email);
    await db.query('select open_wedding_invite()');
    assert.deepEqual(await rows('photos'), []);
    await assert.rejects(wish(id(52)), /Sign in with Google/);
    // Client-controlled metadata cannot invent a verified Google identity.
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ user_metadata: { provider: 'google' } })]);
    assert.equal((await db.query('select can_access_social_content($1) as allowed', [wedding])).rows[0].allowed, false);
    console.log('PASS: ordinary email accounts and user-supplied provider metadata cannot bypass Google verification');

    await asUser(outsider);
    assert.deepEqual(await rows('photos'), []);
    assert.deepEqual(await rows('guestbook_messages'), []);
    await assert.rejects(upload(), /row-level security/);
    await assert.rejects(wish(id(53)), /Open your invitation/);
    console.log('PASS: a Google account still needs invitation access; unrelated accounts cannot read or upload');

    await asUser(google);
    await db.query('select open_wedding_invite($1)', ['Google guest']);
    assert.deepEqual((await rows('photos')).map(row => row.id), [id(30)]);
    assert.deepEqual((await rows('guestbook_messages')).map(row => row.id), [id(40)]);
    await upload();
    await db.query("insert into photos (id,event_id,storage_path,uploader_name,uploaded_by) values ($1,$2,$3,'Google guest',$4)", [id(33), wedding, `${wedding}/new.webp`, google]);
    await wish(id(54));
    await wish(id(54));
    assert.equal((await rows('guestbook_messages')).length, 1, 'New wishes remain private until approved');
    await db.query('select photo_quest_summary($1)', [wedding]);
    await db.query('select flag_photo($1,$2)', [id(30), 'Please review']);
    await assert.rejects(db.query('select * from auth.identities'), /permission denied/);
    console.log('PASS: invited Google guests can view visible photos, upload and submit moderated wishes; hidden and pending content stays private');

    await asUser(family);
    await db.query('select claim_person($1,$2)', ['family-token', id(21)]);
    await db.query('select save_rsvp($1,$2::jsonb)', [wedding, JSON.stringify({ coming: 'yes', summary: 'Family confirmed' })]);
    assert.deepEqual(await rows('photos'), []);
    assert.equal((await rows('households'))[0].coming, 'yes');
    console.log('PASS: family RSVP stays usable without Google, while family photo access is gated');

    await asUser(host);
    assert.equal((await rows('photos')).length, 3);
    const pendingWish = (await rows('guestbook_messages')).find(row => row.request_id === id(54));
    assert.equal(pendingWish.status, 'pending');
    await db.query('select moderate_guestbook_wish($1,$2,$3)', [wedding, pendingWish.id, 'approved']);
    assert.equal((await db.query('delete from storage.objects where bucket_id=$1 returning *', ['photos'])).rows.length, 3);
    console.log('PASS: existing email/password hosts retain moderation and Storage removal permissions');

    await asUser(anonymous);
    await db.query('select open_general_invite($1)', [otherToken]);
    assert.deepEqual((await rows('photos')).map(row => row.id), [id(32)]);
    assert.deepEqual((await rows('guestbook_messages')).map(row => row.id), [id(42)]);
    console.log('PASS: other weddings in a shared Supabase project retain their original access rules');

    await asUser(google);
    const post = id(70);
    const postRow = (photoId, position, postId = post) => db.query(`insert into photos
      (id,event_id,storage_path,uploader_name,post_id,post_position)
      values ($1,$2,$3,'Google guest',$4,$5)`, [photoId, wedding, `${wedding}/${photoId}.webp`, postId, position]);
    await postRow(id(71), 0);
    await postRow(id(72), 1);
    assert.equal((await db.query('select * from photos where post_id=$1 order by post_position', [post])).rows.length, 2);
    await assert.rejects(postRow(id(73), 1), /duplicate key/);
    await assert.rejects(postRow(id(74), 10), /check constraint/);
    await assert.rejects(postRow(id(75), null), /check constraint/);
    await db.exec('reset role');
    assert.equal((await db.query('select post_id from photos where id=$1', [id(30)])).rows[0].post_id, null, 'Legacy photos remain ungrouped');
    await asUser(outsider);
    await db.query('select open_wedding_invite()');
    await assert.rejects(postRow(id(76), 2), /same wedding and uploader/);
    await asUser(google);
    const atomicPost = id(80);
    await assert.rejects(db.query(`insert into photos
      (id,event_id,storage_path,uploader_name,post_id,post_position) values
      ($1,$3,'atomic-0','Guest',$4,0), ($2,$3,'atomic-invalid','Guest',$4,10)`, [id(81), id(82), wedding, atomicPost]), /check constraint/);
    assert.equal((await db.query('select * from photos where post_id=$1', [atomicPost])).rows.length, 0);
    await db.exec('reset role');
    // Mirror auth.users ON DELETE SET NULL without changing the fixture's FK.
    await db.query('update photos set uploaded_by=null where post_id=$1', [post]);
    assert.equal((await db.query('select * from photos where post_id=$1 and uploaded_by is null', [post])).rows.length, 2);
    console.log('PASS: grouped posts preserve legacy data, enforce image positions and ownership, and publish atomically');

    const previewPaths = [100, 101, 102].map(n => `${wedding}/${id(n)}.webp`);
    const unselectedPath = `${wedding}/${id(103)}.webp`;
    const savePreviews = (paths, photos = true) => db.query('select save_general_invitation_with_previews($1,$2,$3,$4::jsonb,$5::text[])',
      [wedding, 'A public invitation', null, JSON.stringify({ cover: true, schedule: true, photos, uploads: true, updates: true, guestbook: true, download: true, quests: true }), paths]);
    await asUser(host);
    for (const name of [...previewPaths, unselectedPath]) await db.query("insert into storage.objects (bucket_id,name) values ('invitation-previews',$1)", [name]);
    await savePreviews(previewPaths);
    await assert.rejects(savePreviews([...previewPaths, unselectedPath]), /up to three/);
    await assert.rejects(savePreviews([previewPaths[0], previewPaths[0]]), /different photos/);
    await assert.rejects(savePreviews([`${other}/${id(100)}.webp`]), /Invalid preview/);
    await assert.rejects(savePreviews([`${wedding}/${id(104)}.webp`]), /Upload the preview/);
    await assert.rejects(savePreviews([null]), /different photos|Invalid preview/);
    const activeDelete = await db.query("delete from storage.objects where bucket_id='invitation-previews' and name=$1 returning name", [previewPaths[0]]);
    assert.equal(activeDelete.rows.length, 0, 'Published preview files cannot be removed before updating settings');

    await asUser(id(999));
    assert.equal((await rows('storage.objects')).filter(row => row.bucket_id === 'invitation-previews').length, 0, 'An unrelated account cannot sign preview files');
    await asUser(anonymous);
    const publicPreviews = (await rows('storage.objects')).filter(row => row.bucket_id === 'invitation-previews');
    assert.deepEqual(publicPreviews.map(row => row.name).sort(), [...previewPaths].sort());
    assert.deepEqual((await rows('photos')).filter(photo => photo.event_id === wedding), [], 'Public previews never expose the private feed');
    await assert.rejects(savePreviews([]), /Only hosts/);
    await assert.rejects(db.query("insert into storage.objects (bucket_id,name) values ('invitation-previews',$1)", [`${wedding}/${id(105)}.webp`]), /row-level security/);
    assert.equal((await db.query("delete from storage.objects where bucket_id='invitation-previews' returning name")).rows.length, 0);

    await asUser(host);
    await savePreviews(previewPaths.slice(0, 2));
    assert.equal((await db.query("delete from storage.objects where bucket_id='invitation-previews' and name=$1 returning name", [previewPaths[2]])).rows.length, 1);
    await savePreviews(previewPaths.slice(0, 2), false);
    await asUser(anonymous);
    assert.equal((await rows('storage.objects')).filter(row => row.bucket_id === 'invitation-previews').length, 0, 'Hidden photo sections do not allow new preview signatures');
    console.log('PASS: hosts manage up to three previews; public visitors see only selected images; guest photos stay private; hidden/removed previews and invalid writes are blocked');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
