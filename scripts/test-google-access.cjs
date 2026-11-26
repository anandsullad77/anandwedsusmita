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
    const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).sort();
    for (const file of migrations) await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8').replace('create extension if not exists pgcrypto;', ''));
    console.log(`PASS: ${migrations.length} migrations execute in order`);
    for (const user of [host, anonymous, google, outsider, email, family]) await db.query('insert into auth.users (id,email) values ($1,$2)', [user, `${user}@example.com`]);
    await db.query("insert into auth.identities (user_id,provider) values ($1,'google'),($2,'google'),($3,'email')", [google, outsider, email]);
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
      await db.query("insert into photos (id,event_id,storage_path,uploader_name,uploaded_by,hidden,status) values ($1,$2,$3,'Guest',$4,$5,'approved')", [photo, event, `${event}/${photo}.webp`, google, hidden]);
      await db.query("insert into storage.objects (bucket_id,name) values ('photos',$1)", [`${event}/${photo}.webp`]);
    }
    await db.query("insert into storage.objects (bucket_id,name) values ('invitation-covers',$1)", [`${wedding}/cover.webp`]);
    for (const [wish, event, status] of [[id(40), wedding, 'approved'], [id(41), wedding, 'pending'], [id(42), other, 'approved']]) {
      await db.query("insert into guestbook_messages (id,event_id,user_id,request_id,name,message,status,created_at) values ($1,$2,$3,$1,'Guest','A private guestbook wish',$4,now() - interval '1 hour')", [wish, event, google, status]);
    }
    const token = (await db.query('select token::text from general_invites where event_id=$1', [wedding])).rows[0].token;
    const otherToken = (await db.query('select token::text from general_invites where event_id=$1', [other])).rows[0].token;
    await db.exec('grant usage on schema public,auth,storage to anon,authenticated; grant select,insert,update,delete on all tables in schema public,storage to authenticated; grant usage,select on all sequences in schema public to authenticated; revoke all on public.wedding_guest_directory, public.wedding_guest_post_activity from authenticated;');
    const asUser = async user => { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user || '']); await db.exec(user ? 'set role authenticated' : 'set role anon'); };
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
    assert.deepEqual((await rows('photos')).map(row => row.id), [id(30), id(31)], 'Uploaders can read their own private rows for safe retries; feed queries still exclude them');
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
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
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
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
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
    // Family removal uses the existing host-only DELETE policy and FK cascades.
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
    const removedFamily = id(400), removedPerson = id(401), keptPhoto = id(402), linkedUser = id(403), keptWish = id(405);
    await db.query('insert into auth.users values ($1,$2)', [linkedUser, 'family-delete@example.com']);
    await db.query("insert into households (id,event_id,name,token,coming) values ($1,$2,'Delete this family','delete-family-token','yes'),($3,$4,'Other wedding family','other-family-token',null)", [removedFamily, wedding, id(410), other]);
    await db.query("insert into people (id,event_id,household_id,name) values ($1,$2,$3,'Family member')", [removedPerson, wedding, removedFamily]);
    await db.query('insert into devices (user_id,event_id,household_id,person_id) values ($1,$2,$3,$4)', [linkedUser, wedding, removedFamily, removedPerson]);
    await db.query("insert into household_changes (household_id,by_name,summary) values ($1,'Family member','RSVP received')", [removedFamily]);
    await db.query("insert into photos (id,event_id,person_id,storage_path,uploader_name,uploaded_by,post_id,post_position) values ($1,$2,$3,$4,'Family member',$5,$6,0)", [keptPhoto, wedding, removedPerson, `${wedding}/${keptPhoto}.webp`, linkedUser, id(404)]);
    await db.query("insert into storage.objects (bucket_id,name) values ('photos',$1)", [`${wedding}/${keptPhoto}.webp`]);
    await db.query("insert into guestbook_messages (id,event_id,user_id,request_id,name,message,status) values ($1,$2,$3,$1,'Family member','Best wishes!','approved')", [keptWish, wedding, linkedUser]);
    const removeFamily = (household = removedFamily, event = wedding) => db.query('delete from households where event_id=$1 and id=$2 returning id', [event, household]);
    for (const user of [anonymous, google, outsider, linkedUser]) {
      await asUser(user);
      assert.equal((await removeFamily()).rows.length, 0, 'Guests cannot delete a family, including their own');
    }
    await asUser(null);
    await assert.rejects(removeFamily(), /permission denied/);
    await asUser(host);
    assert.equal((await removeFamily(id(410), other)).rows.length, 0, 'A host cannot delete families from another wedding');
    assert.equal((await removeFamily(removedFamily, other)).rows.length, 0, 'A mismatched event never deletes a family');
    assert.deepEqual((await removeFamily()).rows, [{ id: removedFamily }]);
    assert.equal((await removeFamily()).rows.length, 0, 'A missing family returns no deleted row');
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
    for (const [table, column, value] of [['households', 'id', removedFamily], ['people', 'household_id', removedFamily], ['devices', 'household_id', removedFamily], ['household_changes', 'household_id', removedFamily]]) {
      assert.equal((await db.query(`select * from ${table} where ${column}=$1`, [value])).rows.length, 0, table + ' records are removed');
    }
    const preservedPhoto = (await db.query('select * from photos where id=$1', [keptPhoto])).rows[0];
    assert.equal(preservedPhoto.person_id, null);
    assert.equal(preservedPhoto.uploader_name, 'Family member');
    assert.equal(preservedPhoto.post_id, id(404));
    assert.equal((await db.query('select * from storage.objects where name=$1', [preservedPhoto.storage_path])).rows.length, 1);
    assert.equal((await db.query('select * from guestbook_messages where id=$1', [keptWish])).rows.length, 1);
    assert.equal((await db.query('select * from households where id in ($1,$2)', [id(20), id(410)])).rows.length, 2, 'Other families stay intact');
    await asUser(linkedUser);
    assert.equal((await db.query('select is_guest($1) as allowed', [wedding])).rows[0].allowed, false, 'Deleted family devices lose family access');
    assert.equal((await db.query("select invite_bundle('delete-family-token') as bundle")).rows[0].bundle, null, 'Deleted invitation tokens stop working');
    console.log('PASS: only wedding hosts can delete families; members, devices and RSVP history cascade; photos, files, wishes and other families remain; personal invite access is revoked');

    await db.exec('reset role; grant usage on schema public to service_role;');
    const recoveryHosts = [];
    for (const [index, role] of ['owner', 'cohost', 'planner', 'photographer'].entries()) {
      const uid = id(200 + index), email = `${role}@example.com`;
      await db.query('insert into auth.users (id,email) values ($1,$2)', [uid, email]);
      await db.query('insert into hosts (event_id,user_id,role) values ($1,$2,$3)', [wedding, uid, role]);
      recoveryHosts.push(email);
    }
    await db.query("insert into hosts (event_id,user_id,role) values ($1,$2,'owner')", [other, outsider]);
    await db.exec('set role service_role');
    for (const email of recoveryHosts) {
      assert.equal((await db.query('select host_password_reset_email($1) as email', [` ${email.toUpperCase()} `])).rows[0].email, email);
    }
    for (const email of [`${google}@example.com`, `${outsider}@example.com`, 'unknown@example.com']) {
      assert.equal((await db.query('select host_password_reset_email($1) as email', [email])).rows[0].email, null);
    }
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select host_password_reset_email($1)', [recoveryHosts[0]]), /permission denied/);
    await asUser(host);
    await assert.rejects(db.query('select host_password_reset_email($1)', [recoveryHosts[0]]), /permission denied/);
    console.log('PASS: recovery lookup accepts wedding owners/hosts only; guests, other weddings and public callers cannot look up host emails');

    const analytics = async (event = wedding) => (await db.query('select admin_wedding_analytics($1) as data', [event])).rows[0].data;
    const beforeAnalytics = await analytics();
    await asUser(null);
    await db.query('select record_wedding_visit($1)', [id(9000)]);
    await db.query('select record_wedding_visit($1)', [id(9000)]);
    await assert.rejects(analytics(), /permission denied/);
    await assert.rejects(db.query('select * from wedding_analytics_visits'), /permission denied/);
    await assert.rejects(db.query('select record_wedding_signin($1)', [id(9000)]), /permission denied/);
    for (const user of [anonymous, email, family]) {
      await asUser(user);
      await assert.rejects(db.query('select record_wedding_signin($1)', [id(9000)]), /Sign in with Google/);
      await assert.rejects(analytics(), /Only hosts/);
      assert.deepEqual(await rows('wedding_analytics_visits'), []);
      assert.deepEqual(await rows('wedding_analytics_signins'), []);
      await assert.rejects(db.query('insert into wedding_analytics_signins (event_id,user_id) values ($1,$2)', [wedding, user]), /row-level security/);
    }
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
    const freshGoogle = id(850), legacyGoogle = id(851), googleHost = id(852);
    for (const user of [freshGoogle, legacyGoogle, googleHost]) {
      await db.query('insert into auth.users (id,email) values ($1,$2)', [user, `${user}@example.com`]);
      await db.query("insert into auth.identities (user_id,provider) values ($1,'google')", [user]);
    }
    await db.query("insert into hosts (event_id,user_id,role) values ($1,$2,'cohost')", [wedding, googleHost]);
    await db.query('insert into event_visitors (event_id,user_id) values ($1,$2)', [wedding, legacyGoogle]);
    await db.query('insert into devices (user_id,event_id,household_id,person_id) values ($1,$2,$3,$4)', [legacyGoogle, wedding, id(20), id(21)]);
    await asUser(freshGoogle);
    for (const visitor of [id(9000), id(9000), id(9001)]) await db.query('select record_wedding_signin($1)', [visitor]);
    await assert.rejects(analytics(), /Only hosts/);
    await asUser(googleHost);
    await db.query('select record_wedding_signin($1)', [id(9002)]);
    const signInCounts = await analytics();
    assert.equal(signInCounts.visitors, 2, 'Repeated page opens and sign-ins do not count the same browser twice');
    assert.equal(signInCounts.signedIn, beforeAnalytics.signedIn + 2, 'Accounts count once across devices; existing visitor/family sign-ins count once; hosts do not count');
    await asUser(host);
    await assert.rejects(analytics(other), /Only hosts/);
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
    for (const position of [2, 0, 1]) {
      await db.query(`insert into photos (id,event_id,storage_path,uploader_name,caption,post_id,post_position,hidden,status,created_at)
        values ($1,$2,$3,'Carousel guest','Three photos in one post',$4,$5,$6,'approved',now() + interval '2 days')`,
      [id(860 + position), wedding, `${wedding}/analytics-${position}.webp`, id(870), position, position === 2]);
    }
    await db.query(`insert into photos (event_id,storage_path,uploader_name,status,hidden,created_at)
      select $1,'analytics-' || n,'Earlier guest','approved',false,now() from generate_series(1,205) n`, [wedding]);
    for (const [wishId, status, days] of [[id(880), 'pending', 3], [id(881), 'rejected', 4]]) {
      await db.query(`insert into guestbook_messages (id,event_id,user_id,request_id,name,message,status,created_at)
        values ($1,$2,$3,$1,'Analytics guest','Wishing you joy!',$4,now() + $5 * interval '1 day')`, [wishId, wedding, freshGoogle, status, days]);
    }
    const expectedPhotos = Number((await db.query('select count(distinct coalesce(post_id,id)) as n from photos where event_id=$1', [wedding])).rows[0].n);
    const expectedWishes = Number((await db.query('select count(*) as n from guestbook_messages where event_id=$1', [wedding])).rows[0].n);
    await asUser(host);
    const summary = await analytics();
    assert.equal(summary.photoPosts, expectedPhotos, 'Totals include posts beyond the feed limit of 200');
    assert.equal(summary.wishes, expectedWishes, 'Totals include pending/rejected wishes and stay event-scoped');
    assert.equal(summary.photoPosts, beforeAnalytics.photoPosts + 206, 'Three carousel images count as one post');
    assert.equal(summary.recentPosts.length, 20);
    assert.equal(summary.recentPosts[0].status, 'rejected');
    assert.equal(summary.recentPosts[1].status, 'pending');
    const carousel = summary.recentPosts.find(post => post.id === id(870));
    assert.equal(carousel.photos, 3); assert.equal(carousel.status, 'partly_hidden');
    assert.equal(carousel.photoPath, `${wedding}/analytics-0.webp`, 'The first slide is the thumbnail');
    assert.equal(carousel.text, 'Three photos in one post');
    await asUser(outsider);
    const otherAnalytics = await analytics(other);
    assert.equal(otherAnalytics.visitors, 0); assert.equal(otherAnalytics.photoPosts, 1); assert.equal(otherAnalytics.wishes, 1);
    console.log('PASS: analytics deduplicate browsers/accounts, include existing guest sign-ins, exclude hosts, group carousels, count all posts, protect private activity and isolate weddings');
    // Guest contacts are derived from verified account IDs, never display names.
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
    const memoryA = id(9500), memoryB = id(9501), memoryC = id(9502), noWedding = id(9503);
    for (const [user, address] of [[memoryA, 'first.guest@gmail.com'], [memoryB, 'second.guest@gmail.com'], [memoryC, 'quiet.guest@gmail.com'], [noWedding, 'unrelated@gmail.com']]) {
      await db.query('insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3::jsonb)', [user, address, JSON.stringify({ full_name: 'Same guest name' })]);
      await db.query("insert into auth.identities (user_id,provider,identity_data) values ($1,'google',$2::jsonb)", [user, JSON.stringify({ full_name: 'Same guest name', email: address })]);
    }
    // A linked Google identity's email takes precedence over the primary Auth email.
    await db.query("update auth.users set email='another-provider@example.com' where id=$1", [memoryA]);
    for (const position of [2, 0, 1]) {
      await db.query(`insert into photos (id,event_id,storage_path,uploader_name,uploaded_by,caption,post_id,post_position,hidden,status)
        values ($1,$2,$3,'Shared display name',$4,'All three memories',$5,$6,$7,'approved')`,
        [id(9600 + position), wedding, `${wedding}/memory-${position}.webp`, memoryA, id(9609), position, position === 2]);
    }
    await db.query(`insert into guestbook_messages (id,event_id,user_id,request_id,name,message,status)
      values ($1,$2,$3,$1,'Shared display name','A pending wish','pending')`, [id(9610), wedding, memoryB]);
    await db.query('insert into akshate (photo_id,user_id) values ($1,$2)', [id(9600), memoryB]);
    await asUser(memoryC);
    await db.query('select record_wedding_signin($1)', [id(9700)]);
    await db.query('select record_wedding_signin($1)', [id(9700)]);
    const contacts = async (event = wedding, query = '', limit = 200, offset = 0) =>
      (await db.query('select admin_wedding_guests($1,$2,$3,$4) as data', [event, query, limit, offset])).rows[0].data;
    const memories = async (event = wedding, user = null, limit = 200, offset = 0) =>
      (await db.query('select admin_wedding_guest_posts($1,$2,$3,$4) as data', [event, user, limit, offset])).rows[0].data;
    for (const user of [null, anonymous, google, memoryA, email, family, outsider]) {
      await asUser(user);
      await assert.rejects(contacts(), /Only hosts|permission denied/);
      await assert.rejects(memories(), /Only hosts|permission denied/);
      await assert.rejects(db.query('select * from wedding_guest_directory'), /permission denied/);
      await assert.rejects(db.query('select * from wedding_guest_post_activity'), /permission denied/);
      await assert.rejects(db.query('select email from auth.users'), /permission denied/);
    }
    await asUser(host);
    await assert.rejects(contacts(other), /Only hosts/); await assert.rejects(memories(other), /Only hosts/);
    await assert.rejects(db.query('select * from wedding_guest_directory'), /permission denied/, 'Hosts also use the event-checked RPC');
    const list = await contacts();
    const a = list.guests.find(g => g.id === memoryA), b = list.guests.find(g => g.id === memoryB), c = list.guests.find(g => g.id === memoryC);
    assert.equal(a.email, 'first.guest@gmail.com'); assert.equal(b.email, 'second.guest@gmail.com');
    assert.equal(a.name, b.name); assert.equal(a.photoPosts, 1); assert.equal(a.photos, 3); assert.equal(a.wishes, 0);
    assert.equal(b.photoPosts, 0); assert.equal(b.wishes, 1); assert.equal(b.reactions, 1);
    assert.equal(c.photoPosts, 0); assert.equal(c.wishes, 0); assert.ok(c.firstSignedInAt && c.lastSignedInAt);
    assert.ok(new Date(c.lastSignedInAt) >= new Date(c.firstSignedInAt));
    assert.ok(!list.guests.some(g => [noWedding, host, googleHost, anonymous, email, family].includes(g.id)));
    assert.deepEqual((await contacts(wedding, 'FIRST.GUEST@GMAIL.COM')).guests.map(g => g.id), [memoryA]);
    assert.equal((await contacts(wedding, '%')).total, 0, 'Search treats wildcard characters literally');
    const pages = await contacts(wedding, 'Same guest name', 1);
    assert.equal(pages.total, 3); assert.equal(pages.guests.length, 1);
    assert.notEqual(pages.guests[0].id, (await contacts(wedding, 'Same guest name', 1, 1)).guests[0].id);
    const aPosts = await memories(wedding, memoryA);
    assert.equal(aPosts.total, 1); assert.equal(aPosts.posts[0].email, a.email);
    assert.equal(aPosts.posts[0].photos.length, 3); assert.equal(aPosts.posts[0].status, 'partly_hidden');
    assert.deepEqual(aPosts.posts[0].photos.map(p => p.path), [0, 1, 2].map(n => `${wedding}/memory-${n}.webp`));
    assert.equal((await memories(wedding, memoryB)).posts[0].status, 'pending');
    assert.equal((await memories(wedding, noWedding)).total, 0);
    // Every historical wish is accessible through paging, beyond recent-post limits.
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
    await db.query(`insert into guestbook_messages (event_id,user_id,request_id,name,message,status)
      select $1,$2,gen_random_uuid(),'Historical guest','Older memory ' || n,'approved' from generate_series(1,205) n`, [wedding, memoryB]);
    await asUser(host);
    const firstPage = await memories(wedding, memoryB), lastPage = await memories(wedding, memoryB, 200, 200);
    assert.equal(firstPage.total, 206); assert.equal(firstPage.posts.length, 200); assert.equal(lastPage.posts.length, 6);
    assert.equal(new Set([...firstPage.posts, ...lastPage.posts].map(p => p.id)).size, 206);
    await asUser(outsider);
    const otherGuests = await contacts(other);
    assert.ok(!otherGuests.guests.some(g => [memoryA, memoryB, memoryC].includes(g.id)), 'Other wedding hosts cannot see these guest emails');
    console.log('PASS: host-only guest emails, verified Google identity mapping, same-name separation, guests without posts, carousel ownership, pending wishes, reactions, pagination and wedding isolation');
    const setReaction = async (photo, reaction) => db.query('select set_photo_reaction($1,$2)', [photo, reaction]);
    const reactionSummary = async photos => (await db.query('select photo_reaction_summary($1::uuid[]) as data', [photos])).rows[0].data;
    await asUser(null);
    await assert.rejects(setReaction(id(9600), 'love'), /permission denied/);
    await assert.rejects(reactionSummary([id(9600)]), /permission denied/);
    for (const user of [anonymous, email, family]) {
      await asUser(user);
      await assert.rejects(setReaction(id(9600), 'love'), /unavailable/);
      assert.deepEqual(await reactionSummary([id(9600)]), []);
    }
    // A verified Google identity without invitation access is also denied.
    await asUser(noWedding);
    await assert.rejects(setReaction(id(9600), 'love'), /unavailable/);
    assert.deepEqual(await reactionSummary([id(9600)]), []);
    await asUser(google);
    const previous = (await reactionSummary([id(9600)]))[0];
    assert.equal(previous.counts.akshate, 1, 'Existing blessings use the default reaction');
    assert.equal(previous.mine, null);
    for (const kind of ['love', 'wow', 'celebrate', 'akshate']) {
      await setReaction(id(9600), kind); await setReaction(id(9600), kind);
      const state = (await reactionSummary([id(9600)]))[0];
      assert.equal(state.mine, kind); assert.equal(state.counts[kind], kind === 'akshate' ? 2 : 1);
      assert.equal(Object.values(state.counts).reduce((sum, n) => sum + n, 0), 2, 'Changes replace a reaction, and retries do not add duplicates');
      assert.deepEqual(Object.keys(state).sort(), ['counts', 'mine', 'photoId'], 'Summaries do not reveal other user IDs or emails');
    }
    await setReaction(id(9601), 'love');
    const twoSlides = await reactionSummary([id(9600), id(9601)]);
    assert.equal(twoSlides.find(p => p.photoId === id(9600)).mine, 'akshate');
    assert.equal(twoSlides.find(p => p.photoId === id(9601)).mine, 'love');
    await setReaction(id(9600), null); await setReaction(id(9600), null);
    assert.equal((await reactionSummary([id(9600)]))[0].counts.akshate, 1, 'Removing a reaction preserves other guests');
    await assert.rejects(setReaction(id(9600), 'invalid'), /valid reaction/);
    await assert.rejects(setReaction(id(9602), 'love'), /unavailable/, 'Hidden carousel images cannot receive guest reactions');
    await assert.rejects(setReaction(id(32), 'love'), /unavailable/, 'Another wedding requires its own invitation');
    assert.deepEqual(await reactionSummary([id(9602), id(32)]), []);
    assert.equal((await db.query('update akshate set reaction=$1 where photo_id=$2 returning *', ['wow', id(9600)])).rows.length, 0, 'Guests cannot update another guest’s reaction');
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
    await db.query(`with accounts as (insert into auth.users (id,email) select gen_random_uuid(),null from generate_series(1,1005) returning id)
      insert into akshate (photo_id,user_id,reaction) select $1,id,'celebrate' from accounts`, [id(9601)]);
    await asUser(google);
    assert.equal((await reactionSummary([id(9601)]))[0].counts.celebrate, 1005, 'Counts exceed the REST row limit without truncation');
    await asUser(host);
    await setReaction(id(9602), 'wow');
    assert.equal((await reactionSummary([id(9602)]))[0].mine, 'wow', 'Hosts retain hidden-photo access');
    console.log('PASS: four photo reactions replace/remove atomically, preserve blessings, isolate carousel images, reject hidden/uninvited/wrong-wedding access, protect other guests and count beyond 1000');
    const team = async () => (await db.query('select admin_host_team($1) as data', [wedding])).rows[0].data;
    for (const user of [null, google, anonymous, email]) {
      await asUser(user); await assert.rejects(team(), /Only hosts|permission denied/);
      await assert.rejects(db.query('select host_team_add($1,$2,$3,$4,$5)', [host,wedding,google,'owner','Guest']), /permission denied/);
    }
    await asUser(host); assert.equal((await team()).canManage, true);
    await asUser(googleHost); assert.equal((await team()).canManage, false);
    await db.exec('reset role; set role service_role');
    await assert.rejects(db.query('select host_team_add($1,$2,$3,$4,$5)', [googleHost,wedding,memoryC,'owner','New owner']), /Only owners/);
    assert.equal((await db.query('select host_team_add($1,$2,$3,$4,$5) as added', [host,wedding,memoryC,'owner','New owner'])).rows[0].added, true);
    assert.equal((await db.query('select host_team_add($1,$2,$3,$4,$5) as added', [host,wedding,memoryC,'cohost','Changed'])).rows[0].added, false, 'Retry does not change an existing role');
    await asUser(memoryC); assert.equal((await team()).canManage, true);
    console.log('PASS: host-team listing, owner-only additions, server-only grants, co-owner rights and retry role preservation');
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
    await db.query("insert into households (id,event_id,name,token,cap,function_ids) values ($1,$2,'Capacity family','capacity-test',3,'{}')", [id(99000), wedding]);
    await db.query("insert into people (id,event_id,household_id,name) values ($1,$2,$3,'Original member')", [id(99001), wedding, id(99000)]);
    await asUser(family);
    await db.query('select claim_person($1,$2)', ['capacity-test', id(99001)]);
    const capacityReply = { requestId: id(99002), coming: 'yes', add: [{ name: 'Second member', functionIds: [] }, { name: 'Child member', isChild: true, functionIds: [] }], summary: 'Family of three' };
    await db.query('select save_rsvp($1,$2::jsonb)', [wedding, JSON.stringify(capacityReply)]);
    await db.query('select save_rsvp($1,$2::jsonb)', [wedding, JSON.stringify(capacityReply)]);
    await assert.rejects(db.query('select save_rsvp($1,$2::jsonb)', [wedding, JSON.stringify({ ...capacityReply, requestId: id(99003), add: [{ name: 'Over capacity', functionIds: [] }] })]), /family is full/i);
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
    assert.equal((await db.query('select count(*)::int as n from people where household_id=$1', [id(99000)])).rows[0].n, 3);
    console.log('PASS: family RSVP without Google adds members up to host capacity, retries do not duplicate, and excess additions are rejected atomically');
    await asUser(host);
    const importFunctions = (await db.query('select id from event_functions where event_id=$1', [wedding])).rows.map(f => f.id);
    const personal = { name: 'Individual guest', invitationType: 'individual', cap: 1, side: null, invitedBy: null, functionIds: importFunctions, people: [{ name: 'Individual guest', phone: null, isChild: false }] };
    await db.query('select import_households($1,$2::jsonb)', [wedding, JSON.stringify([personal])]);
    const savedIndividual = (await db.query("select * from households where name='Individual guest'")).rows[0];
    assert.equal(savedIndividual.invitation_type, 'individual'); assert.equal(savedIndividual.cap, 1);
    const personalBundle = (await db.query('select invite_bundle($1) as data', [savedIndividual.token])).rows[0].data;
    assert.equal(personalBundle.household.invitationType, 'individual');
    await assert.rejects(db.query('select import_households($1,$2::jsonb)', [wedding, JSON.stringify([{ ...personal, name: 'Bad individual', cap: 2 }])]), /one person and one place/);
    await assert.rejects(db.query("insert into people (event_id,household_id,name) values ($1,$2,'Extra guest')", [wedding, savedIndividual.id]), /one person only/);
    await assert.rejects(db.query("update households set cap=2 where id=$1", [savedIndividual.id]), /individual_invite_capacity/);
    await assert.rejects(db.query("update households set invitation_type='individual',cap=1 where id=$1", [id(99000)]), /multiple people/);
    await db.query("update households set invitation_type='family',cap=6 where id=$1", [savedIndividual.id]);
    await db.query("insert into people (event_id,household_id,name) values ($1,$2,'Additional family member')", [wedding, savedIndividual.id]);
    assert.equal((await db.query('select invite_bundle($1) as data', [savedIndividual.token])).rows[0].data.household.invitationType, 'family');
    console.log('PASS: individual import/type persistence, one-place enforcement, second-person rejection, safe family switching and no destructive multi-person conversion');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
