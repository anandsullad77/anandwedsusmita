const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const wedding = id(1), other = id(2), owner = id(10), coowner = id(11), host = id(12), photographer = id(13), guest = id(14), reporter = id(15), outsider = id(16);

(async () => {
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
    const migrations = path.resolve(__dirname, '../supabase/migrations');
    const files = fs.readdirSync(migrations).sort();
    const apply = file => db.exec(fs.readFileSync(path.join(migrations, file), 'utf8').replace('create extension if not exists pgcrypto;', ''));
    for (const file of files.filter(file => file < '0023')) await apply(file);
    for (const user of [owner, coowner, host, photographer, guest, reporter, outsider]) await db.query('insert into auth.users(id,email) values ($1,$2)', [user, `${user}@example.com`]);
    for (const user of [guest, reporter, outsider]) await db.query("insert into auth.identities(user_id,provider) values ($1,'google')", [user]);
    for (const [event, slug] of [[wedding, 'anand-susmita'], [other, 'other-wedding']]) {
      await db.query("insert into events(id,slug,title,couple_a,couple_b,starts_at,venue,pin_hash) values ($1,$2,'Wedding','Anand','Susmita',now(),'Venue','fixture')", [event, slug]);
      await db.query('insert into general_invites(event_id) values ($1)', [event]);
      await db.query('insert into general_invitation_settings(event_id) values ($1)', [event]);
    }
    for (const [user, role] of [[owner, 'owner'], [coowner, 'owner'], [host, 'cohost'], [photographer, 'photographer']]) await db.query('insert into hosts(event_id,user_id,role) values ($1,$2,$3)', [wedding, user, role]);
    for (const user of [guest, reporter]) await db.query("insert into event_visitors(event_id,user_id,display_name) values ($1,$2,'Guest')", [wedding, user]);
    await db.query("insert into photos(id,event_id,uploaded_by,uploader_name,storage_path,hidden) values ($1,$2,$3,'Legacy', $4, false),($5,$2,$3,'Flagged', $6,true)", [id(30), wedding, guest, `${wedding}/legacy.webp`, id(31), `${wedding}/flagged.webp`]);
    await db.query("insert into storage.objects(bucket_id,name) values ('photos',$1),('photos',$2)", [`${wedding}/legacy.webp`, `${wedding}/flagged.webp`]);
    await db.query("insert into photo_flags(photo_id,user_id,reason,is_removal_request) values ($1,$2,'Please review this',true)", [id(31), reporter]);
    await db.query("insert into guestbook_messages(id,event_id,user_id,request_id,name,message,status) values ($1,$2,$3,$1,'Guest','A lovely wedding wish','pending')", [id(40), wedding, guest]);
    if (process.argv.includes('--existing-status')) {
      // Reproduce the user's SQL Editor state: status and some other objects
      // already exist, with decisions that must not be reset to approved.
      await db.exec(`alter table photos add column status text;
        update photos set status='approved';
        alter table photos add column reviewed_at timestamptz;
        alter table guestbook_messages add column reviewed_by uuid references auth.users;
        alter table photo_flags add column resolved_at timestamptz;`);
      for (const [photoId, status] of [[id(8000), 'pending'], [id(8001), 'rejected'], [id(8002), null]]) {
        await db.query("insert into photos(id,event_id,uploader_name,storage_path,status,hidden) values ($1,$2,'Partly migrated',$3,$4,false)", [photoId, wedding, `${wedding}/${photoId}.webp`, status]);
      }
    }
    for (const file of files.filter(file => file >= '0023')) {
      if (file.startsWith('0024')) await db.query('insert into photo_flags(photo_id,user_id,reason,resolved_at,resolved_by) values ($1,$2,$3,now(),$4)', [id(30), reporter, 'Previously resolved', owner]);
      await apply(file);
      if (file.startsWith('0023')) await apply(file);
    }
    if (process.argv.includes('--existing-status')) {
      const partial = (await db.query('select id,status,hidden from photos where id=any($1::uuid[]) order by id', [[id(8000), id(8001), id(8002)]])).rows;
      assert.deepEqual(partial.map(p => [p.status, p.hidden]), [['pending', true], ['rejected', true], ['pending', true]], 'Existing decisions survive, incomplete pending rows are private, and unknown statuses require review');
      await db.query('delete from photos where id=any($1::uuid[])', [[id(8000), id(8001), id(8002)]]);
      console.log('PASS: existing status/metadata columns install without duplicate-column errors, preserve approval decisions, and keep unreviewed rows private');
    }
    await db.exec(`grant usage on schema public,auth,storage to anon,authenticated;
      grant select,insert,update,delete on all tables in schema public,storage to authenticated;
      grant usage,select on all sequences in schema public to authenticated;
      revoke all on wedding_moderation_posts,wedding_guest_directory,wedding_guest_post_activity from authenticated;`);
    const asUser = async user => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user || '']); if (user) await db.exec('set role authenticated'); };
    const queue = async options => (await db.query('select admin_post_review_queue($1,$2,$3,$4,$5,$6,$7) as data', [wedding, options?.filter ?? 'review', options?.kind ?? 'all', options?.query ?? '', options?.quest ?? null, options?.limit ?? 12, options?.offset ?? 0])).rows[0].data;
    const review = (userPosts, action = 'approve', event = wedding) => db.query('select review_wedding_posts($1,$2::jsonb,$3)', [event, JSON.stringify(userPosts), action]);
    const photoPost = post => ({ id: post, kind: 'photo' });
    await asUser(owner);
    assert.equal((await db.query('select report_locked from photos where id=$1', [id(30)])).rows[0].report_locked, true, 'Previously restored photos get the reporting lock');
    assert.deepEqual((await db.query('select status,hidden from photos where id=$1', [id(30)])).rows[0], { status: 'approved', hidden: false });
    assert.deepEqual((await db.query('select status,hidden from photos where id=$1', [id(31)])).rows[0], { status: 'approved', hidden: true });
    await review([photoPost(id(31))]);
    assert.equal((await db.query('select report_locked from photos where id=$1', [id(31)])).rows[0].report_locked, true);
    assert.equal((await queue()).posts.some(post => post.id === id(31)), false, 'Restoring a flagged photo resolves its report');
    assert.ok((await db.query('select resolved_at,resolved_by from photo_flags where photo_id=$1', [id(31)])).rows[0].resolved_at);
    console.log('PASS: migration preserves old visibility; returning a flagged photo to the feed resolves its report without deleting history');

    const post = id(70), images = [id(50), id(51)];
    await asUser(guest);
    for (const image of images) await db.query("insert into storage.objects(bucket_id,name) values ('photos',$1)", [`${wedding}/${post}/${image}.webp`]);
    await db.query(`insert into photos(id,event_id,post_id,post_position,uploaded_by,uploader_name,storage_path,status,hidden,pinned,reviewed_by,quest_id,report_locked)
      values ($1,$3,$4,0,$5,'New guest',$6,'approved',false,true,$5,'proud-moment',true),($2,$3,$4,1,$5,'New guest',$7,'approved',false,true,$5,'proud-moment',true)`,
    [images[0], images[1], wedding, post, guest, `${wedding}/${post}/${images[0]}.webp`, `${wedding}/${post}/${images[1]}.webp`]);
    const pending = (await db.query('select id,status,hidden,pinned,reviewed_by,report_locked from photos where post_id=$1 order by post_position', [post])).rows;
    assert.equal(pending.length, 2, 'Uploader can detect successful pending rows after a lost upload response');
    assert.ok(pending.every(photo => photo.status === 'pending' && photo.hidden && !photo.pinned && photo.reviewed_by === null && !photo.report_locked));
    await db.query("update photos set status='approved',hidden=false where post_id=$1", [post]);
    assert.equal((await db.query("select count(*)::int as n from photos where post_id=$1 and status='pending'", [post])).rows[0].n, 2, 'Guest cannot self-approve with UPDATE');
    await assert.rejects(review([photoPost(post)]), /Only owners/);
    await assert.rejects(queue(), /Only hosts/);
    await assert.rejects(db.query('select set_photo_reaction($1,$2)', [images[0], 'love']), /unavailable/);
    await asUser(reporter);
    assert.equal((await db.query('select id from photos where post_id=$1', [post])).rows.length, 0);
    assert.equal((await db.query('select name from storage.objects where name like $1', [`${wedding}/${post}/%`])).rows.length, 0, 'Other guests cannot sign pending photo files');
    await assert.rejects(db.query('select flag_photo($1,$2,false)', [images[0], 'Not visible']), /unavailable/);
    const beforeQuest = (await db.query('select photo_quest_summary($1) as data', [wedding])).rows[0].data;
    assert.equal(beforeQuest.counts['proud-moment'], undefined, 'Pending photos do not leak into quest aggregates');
    await asUser(photographer);
    assert.equal((await queue()).canReview, false);
    await assert.rejects(review([photoPost(post)]), /Only owners/);
    await asUser(host); await review([photoPost(post)]);
    assert.ok((await db.query('select report_locked from photos where post_id=$1', [post])).rows.every(photo => !photo.report_locked), 'Initial approval keeps reporting available');
    assert.ok((await db.query('select status,hidden,reviewed_by from photos where post_id=$1', [post])).rows.every(photo => photo.status === 'approved' && !photo.hidden && photo.reviewed_by === host));
    await asUser(reporter);
    assert.equal((await db.query('select id from photos where post_id=$1', [post])).rows.length, 2);
    assert.equal((await db.query('select name from storage.objects where name like $1', [`${wedding}/${post}/%`])).rows.length, 2);
    assert.equal((await db.query('select photo_quest_summary($1) as data', [wedding])).rows[0].data.counts['proud-moment'], 2);
    console.log('PASS: every new photo is pending despite spoofed approval fields; owners/co-owners/hosts approve complete posts; guest and photographer writes are denied; Storage and quest counts stay private');

    await db.query('select flag_photo($1,$2,true)', [images[1], 'Please remove this picture']);
    await asUser(coowner);
    assert.equal((await queue({ quest: 'proud-moment' })).posts[0].photos.length, 2, 'Quest filtering keeps complete posts');
    await review([photoPost(post)]);
    assert.equal((await queue({ kind: 'photo' })).total, 0);
    assert.equal((await db.query('select report_locked from photos where id=$1', [images[1]])).rows[0].report_locked, true);
    assert.equal((await db.query('select report_locked from photos where id=$1', [images[0]])).rows[0].report_locked, false, 'Unreported sibling photos keep their reporting option');
    await asUser(reporter);
    await assert.rejects(db.query('select flag_photo($1,$2,false)', [images[1], 'A new concern']), /already been reviewed/);
    await assert.rejects(db.query('select flag_photo($1,$2,true)', [images[1], 'Removal request']), /already been reviewed/);
    await asUser(guest);
    await db.query('update photos set report_locked=false where id=$1', [images[1]]);
    assert.equal((await db.query('select report_locked from photos where id=$1', [images[1]])).rows[0].report_locked, true, 'Uploader cannot remove the lock');
    await assert.rejects(db.query('select flag_photo($1,$2,false)', [images[1], 'Another account']), /already been reviewed/);
    await asUser(reporter);
    await db.query('select flag_photo($1,$2,false)', [images[0], 'A concern about the other image']);
    await asUser(host);
    assert.equal((await queue({ kind: 'photo' })).total, 1, 'An unreported sibling can still be reviewed');
    await review([photoPost(post)], 'hide');
    assert.equal((await queue({ filter: 'hidden' })).posts[0].id, post);
    await asUser(reporter);
    assert.equal((await db.query('select name from storage.objects where name like $1', [`${wedding}/${post}/%`])).rows.length, 0);
    await asUser(owner);
    await review([photoPost(post)]);
    assert.ok((await db.query('select report_locked from photos where post_id=$1', [post])).rows.every(photo => photo.report_locked), 'Returning a hidden reported post locks the images with resolved reports');
    await asUser(guest);
    await assert.rejects(db.query("insert into photos(event_id,post_id,post_position,uploader_name,storage_path) values ($1,$2,2,'Guest','extra.webp')", [wedding, post]), /already been reviewed/);
    await asUser(coowner);
    await assert.rejects(review([photoPost(post), photoPost(id(999999))], 'hide'), /Post not found/);
    assert.ok((await db.query('select status,hidden from photos where post_id=$1', [post])).rows.every(photo => photo.status === 'approved' && !photo.hidden), 'Failed bulk action rolls back all earlier decisions');
    await assert.rejects(review([photoPost(post)], 'approve', other), /Only owners/);
    await review([{ id: id(40), kind: 'wish' }, photoPost(post)]);
    assert.equal((await db.query('select status,reviewed_by from guestbook_messages where id=$1', [id(40)])).rows[0].status, 'approved');
    await assert.rejects(db.query('select review_wedding_posts_before_report_lock($1,$2::jsonb,$3)', [wedding, JSON.stringify([photoPost(post)]), 'approve']), /permission denied/);
    console.log('PASS: restored reported photos cannot be reported or removal-requested again; locks apply per image, survive hide/restore, cannot be spoofed or removed by guests, and preserve review history');
    console.log('PASS: whole-post hiding/restoration, append prevention, combined wish/photo approval, event isolation and atomic bulk rollback');

    await asUser(null);
    for (let i = 0; i < 220; i++) await db.query("insert into photos(id,event_id,uploader_name,storage_path,status,hidden) values ($1,$2,'Published history',$3,'approved',false)", [id(1000 + i), wedding, `${wedding}/history-${i}.webp`]);
    await asUser(guest);
    await db.query("insert into photos(id,event_id,uploader_name,storage_path,created_at) values ($1,$2,'Old pending upload',$3,now()-interval '1 year')", [id(6000), wedding, `${wedding}/old-pending.webp`]);
    await asUser(host);
    const oldest = await queue({ limit: 1 });
    assert.equal(oldest.posts[0].id, id(6000), 'Pending rows beyond the old 200-photo limit remain reviewable');
    const all = await queue({ filter: 'all', limit: 12 });
    const next = await queue({ filter: 'all', limit: 12, offset: 12 });
    assert.ok(all.total > 220);
    assert.equal(next.posts.some(post => all.posts.some(first => first.id === post.id)), false);
    assert.equal((await queue({ query: 'Old pending' })).total, 1);
    assert.deepEqual((await queue({ limit: 0 })).posts, []);
    await assert.rejects(db.query('select * from wedding_moderation_posts'), /permission denied/);
    await asUser(outsider); await assert.rejects(queue(), /Only hosts/);
    await asUser(owner);
    await db.query("insert into photos(id,event_id,uploader_name,storage_path,status,hidden) values ($1,$2,'Host upload',$3,'approved',false)", [id(7000), wedding, `${wedding}/host.webp`]);
    assert.equal((await db.query('select status from photos where id=$1', [id(7000)])).rows[0].status, 'pending', 'Host uploads also require approval');
    console.log('PASS: full-history pagination, oldest-first review, search, accurate counts, private internal views and pending host uploads');

    await asUser(null);
    const state = async () => ({
      photos: (await db.query('select id,status,hidden,pinned,reviewed_by,reviewed_at,report_locked from photos order by id')).rows,
      reports: (await db.query('select * from photo_flags order by photo_id,user_id')).rows,
      wishes: (await db.query('select id,status,reviewed_by,reviewed_at from guestbook_messages order by id')).rows,
    });
    const beforeRerun = await state();
    for (const file of ['0023_post_approval.sql', '0023_post_approval.sql', '0024_lock_reviewed_photo_reports.sql', '0024_lock_reviewed_photo_reports.sql']) await apply(file);
    assert.deepEqual(await state(), beforeRerun, 'Reruns preserve every existing approval, visibility decision, reviewer, timestamp, lock and report');
    await asUser(reporter);
    await assert.rejects(db.query('select flag_photo($1,$2,false)', [id(31), 'Retry after migrations']), /already been reviewed/);
    await asUser(owner);
    await assert.rejects(db.query('select review_wedding_posts_before_report_lock($1,$2::jsonb,$3)', [wedding, JSON.stringify([photoPost(post)]), 'approve']), /permission denied/);
    await review([photoPost(id(7000))]);
    assert.equal((await db.query('select status from photos where id=$1', [id(7000)])).rows[0].status, 'approved');
    await asUser(guest);
    await assert.rejects(review([photoPost(post)]), /Only owners/);
    console.log('PASS: 0023 and 0024 can both be rerun after 0024, with all data, reporting locks, approval functions and host permissions preserved');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
