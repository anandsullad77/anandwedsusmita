begin;

-- Safe to rerun after a complete or partial installation. Existing approval
-- decisions are retained; only new uploads default to pending.
alter table public.photos add column if not exists status text not null default 'approved';
update public.photos set status = 'pending' where status is null;
alter table public.photos alter column status set not null;
alter table public.photos alter column status set default 'pending';
alter table public.photos alter column hidden set default true;
alter table public.photos add column if not exists reviewed_by uuid references auth.users on delete set null;
alter table public.photos add column if not exists reviewed_at timestamptz;
-- A partially installed database may have pending rows still marked visible.
update public.photos set hidden = true where status <> 'approved' and not hidden;
do $migration$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.photos'::regclass and conname = 'photos_status_check') then
    alter table public.photos add constraint photos_status_check check (status in ('pending', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.photos'::regclass and conname = 'unapproved_photos_are_private') then
    alter table public.photos add constraint unapproved_photos_are_private check (status = 'approved' or hidden);
  end if;
end $migration$;
alter table public.guestbook_messages add column if not exists reviewed_by uuid references auth.users on delete set null;
alter table public.guestbook_messages add column if not exists reviewed_at timestamptz;
alter table public.photo_flags add column if not exists resolved_at timestamptz;
alter table public.photo_flags add column if not exists resolved_by uuid references auth.users on delete set null;
create index if not exists photos_approval_queue on public.photos(event_id, status, created_at);
create index if not exists photo_flags_unresolved on public.photo_flags(photo_id) where resolved_at is null;

create or replace function public.can_review_posts(p_event uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.hosts where event_id = p_event and user_id = auth.uid() and role in ('owner', 'cohost'));
$$;
revoke all on function public.can_review_posts(uuid) from public, anon;
grant execute on function public.can_review_posts(uuid) to authenticated;

create or replace function public.require_photo_approval() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.post_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.post_id::text, 0));
    if auth.uid() is not null and exists (select 1 from public.photos where id = new.post_id or
      (post_id = new.post_id and (status <> 'pending' or reviewed_at is not null))) then
      raise exception 'This post has already been reviewed. Start a new post';
    end if;
  elsif auth.uid() is not null and exists (select 1 from public.photos where post_id = new.id) then
    raise exception 'Choose a new photo ID';
  end if;
  -- An authenticated uploader, including a host, cannot approve an INSERT.
  -- Privileged imports may explicitly retain an approved legacy status.
  if auth.uid() is not null then
    new.status := 'pending'; new.hidden := true; new.pinned := false;
    new.reviewed_at := null; new.reviewed_by := null;
  end if;
  return new;
end $$;
revoke all on function public.require_photo_approval() from public, anon, authenticated;
drop trigger if exists require_photo_approval on public.photos;
create trigger require_photo_approval before insert on public.photos
  for each row execute function public.require_photo_approval();

-- Own rows remain readable for upload retry detection; public feeds explicitly
-- select approved, visible rows. Other guests cannot read pending uploads.
drop policy if exists photos_read on public.photos;
create policy photos_read on public.photos for select to authenticated using (
  public.is_host(event_id) or (public.is_photo_guest(event_id) and
    (uploaded_by = auth.uid() or (status = 'approved' and not hidden)))
);
drop policy if exists photo_reviewers_update on public.photos;
create policy photo_reviewers_update on public.photos as restrictive for update to authenticated
  using (public.can_review_posts(event_id)) with check (public.can_review_posts(event_id));

-- Event membership alone must not allow signing someone else's private upload.
drop policy if exists approved_photo_files on storage.objects;
create policy approved_photo_files on storage.objects as restrictive for select to authenticated using (
  case when bucket_id = 'photos' then public.is_host((storage.foldername(name))[1]::uuid) or exists (
    select 1 from public.photos p where p.storage_path = storage.objects.name and
      (public.is_host(p.event_id) or (public.is_photo_guest(p.event_id) and
        (p.uploaded_by = auth.uid() or (p.status = 'approved' and not p.hidden))))
  ) else true end
);

-- Migration 0024 replaces reporting with a permanent host-review lock. Do not
-- overwrite that newer implementation if 0023 is run again afterward.
do $migration$
begin
if to_regprocedure('public.review_wedding_posts_before_report_lock(uuid,jsonb,text)') is null then
execute $definition$
create or replace function public.flag_photo(p_photo uuid, p_reason text, p_removal boolean default false)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare wedding uuid;
begin
  select event_id into wedding from public.photos where id = p_photo and status = 'approved' and not hidden;
  if wedding is not null and not public.can_access_social_content(wedding) then raise exception 'Sign in with Google to interact with photos'; end if;
  if wedding is null or
    not (public.is_photo_guest(wedding) or public.is_host(wedding)) then raise exception 'Photo is unavailable'; end if;
  if char_length(coalesce(p_reason, '')) > 1000 then raise exception 'Keep the report under 1,000 characters'; end if;
  insert into public.photo_flags (photo_id, user_id, reason, is_removal_request)
    values (p_photo, auth.uid(), nullif(btrim(p_reason), ''), coalesce(p_removal, false))
    on conflict (photo_id, user_id) do update set reason = excluded.reason,
      is_removal_request = case when photo_flags.resolved_at is not null then excluded.is_removal_request
        else photo_flags.is_removal_request or excluded.is_removal_request end,
      created_at = now(), resolved_at = null, resolved_by = null;
end $$;
$definition$;
end if;
end $migration$;

-- Internal view: no client grants. Group BEFORE filtering or pagination so a
-- 10-photo post is always reviewed as one complete post, including older rows.
create or replace view public.wedding_moderation_posts as
  select p.event_id, coalesce(p.post_id, p.id) as id, 'photo'::text as kind,
    (array_agg(p.uploader_name order by p.post_position nulls first, p.id))[1] as name,
    (array_agg(p.caption order by p.post_position nulls first, p.id))[1] as text,
    case when bool_or(p.status = 'pending') then 'pending'
      when bool_and(p.status = 'rejected') then 'rejected' else 'approved' end as status,
    bool_or(p.hidden) as hidden, sum(coalesce(f.n, 0))::int as flags,
    min(p.created_at) as created_at, max(p.reviewed_at) as reviewed_at,
    jsonb_agg(jsonb_build_object('id', p.id, 'path', p.storage_path, 'caption', p.caption,
      'moment', p.moment, 'questId', p.quest_id, 'hidden', p.hidden, 'status', p.status,
      'reports', coalesce(f.reports, '[]'::jsonb)) order by p.post_position nulls first, p.id) as photos
  from public.photos p left join lateral (
    select count(*) as n, jsonb_agg(jsonb_build_object('reason', reason, 'removal', is_removal_request,
      'createdAt', created_at) order by created_at) as reports
    from public.photo_flags where photo_id = p.id and resolved_at is null
  ) f on true group by p.event_id, coalesce(p.post_id, p.id)
  union all
  select event_id, id, 'wish', name, message, status, status = 'rejected', 0, created_at, reviewed_at, '[]'::jsonb
    from public.guestbook_messages;
revoke all on public.wedding_moderation_posts from public, anon, authenticated;

create or replace function public.admin_post_review_queue(p_event uuid, p_filter text default 'review', p_kind text default 'all',
  p_query text default '', p_quest text default null, p_limit int default 12, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_host(p_event) then raise exception 'Only hosts can view the review queue'; end if;
  if p_filter is null or p_filter not in ('review', 'feed', 'hidden', 'all') or
    p_kind is null or p_kind not in ('all', 'photo', 'wish') or p_limit is null or p_limit not between 0 and 24 or
    p_offset is null or p_offset < 0 or char_length(coalesce(p_query, '')) > 120 then raise exception 'Invalid review filters'; end if;
  return (with matching as materialized (
    select * from public.wedding_moderation_posts where event_id = p_event
      and (p_kind = 'all' or kind = p_kind)
      and (coalesce(p_query, '') = '' or position(lower(p_query) in lower(name || ' ' || coalesce(text, ''))) > 0)
      and (coalesce(p_quest, '') = '' or photos @> jsonb_build_array(jsonb_build_object('questId', p_quest)))
  ), filtered as (
    select * from matching where p_filter = 'all'
      or (p_filter = 'review' and (status = 'pending' or flags > 0))
      or (p_filter = 'feed' and status = 'approved' and not hidden)
      or (p_filter = 'hidden' and (hidden or status = 'rejected') and status <> 'pending')
  ), page as (
    select * from filtered order by
      case when p_filter = 'review' then created_at end asc,
      created_at desc, kind, id limit p_limit offset p_offset
  ) select jsonb_build_object('canReview', public.can_review_posts(p_event),
    'total', (select count(*) from filtered), 'counts', (select jsonb_build_object(
      'review', count(*) filter (where status = 'pending' or flags > 0),
      'pending', count(*) filter (where status = 'pending'), 'reported', count(*) filter (where flags > 0),
      'feed', count(*) filter (where status = 'approved' and not hidden),
      'hidden', count(*) filter (where (hidden or status = 'rejected') and status <> 'pending'), 'all', count(*)) from matching),
    'posts', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'name', name,
      'text', text, 'status', status, 'hidden', hidden, 'flags', flags, 'createdAt', created_at,
      'reviewedAt', reviewed_at, 'photos', photos) order by
        case when p_filter = 'review' then created_at end asc, created_at desc, kind, id) from page), '[]'::jsonb)));
end $$;
revoke all on function public.admin_post_review_queue(uuid, text, text, text, text, int, int) from public, anon;
grant execute on function public.admin_post_review_queue(uuid, text, text, text, text, int, int) to authenticated;

-- One transaction for one or several selected posts. A failed item rolls back
-- the whole action. Lock the same post key used by the upload trigger.
-- Preserve the report-lock wrapper installed by 0024 when rerunning 0023.
do $migration$
begin
if to_regprocedure('public.review_wedding_posts_before_report_lock(uuid,jsonb,text)') is null then
execute $definition$
create or replace function public.review_wedding_posts(p_event uuid, p_posts jsonb, p_action text) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare item record; affected int := 0;
begin
  if not public.can_review_posts(p_event) then raise exception 'Only owners, co-owners and hosts can review posts'; end if;
  if p_action is null or p_action not in ('approve', 'hide') or jsonb_typeof(p_posts) is distinct from 'array' then
    raise exception 'Choose posts and an approval action'; end if;
  if jsonb_array_length(p_posts) not between 1 and 24 then raise exception 'Review between 1 and 24 posts at a time'; end if;
  for item in select distinct value->>'kind' as kind, (value->>'id')::uuid as id from jsonb_array_elements(p_posts) order by 1, 2 loop
    if item.id is null or item.kind is null or item.kind not in ('photo', 'wish') then raise exception 'Invalid post'; end if;
    if item.kind = 'photo' then
      perform pg_advisory_xact_lock(hashtextextended(item.id::text, 0));
      update public.photos set status = case when p_action = 'approve' then 'approved' else 'rejected' end,
        hidden = p_action <> 'approve', reviewed_by = auth.uid(), reviewed_at = now()
        where event_id = p_event and coalesce(post_id, id) = item.id;
      if not found then raise exception 'Post not found. Refresh the review queue'; end if;
      update public.photo_flags f set resolved_at = now(), resolved_by = auth.uid()
        where resolved_at is null and exists (select 1 from public.photos p
          where p.id = f.photo_id and p.event_id = p_event and coalesce(p.post_id, p.id) = item.id);
    else
      update public.guestbook_messages set status = case when p_action = 'approve' then 'approved' else 'rejected' end,
        reviewed_at = now(), reviewed_by = auth.uid() where event_id = p_event and id = item.id;
      if not found then raise exception 'Wish not found. Refresh the review queue'; end if;
    end if;
    affected := affected + 1;
  end loop;
  return affected;
end $$;
$definition$;
end if;
end $migration$;
revoke all on function public.review_wedding_posts(uuid, jsonb, text) from public, anon;
grant execute on function public.review_wedding_posts(uuid, jsonb, text) to authenticated;

create or replace function public.moderate_guestbook_wish(p_event uuid, p_wish uuid, p_status text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.can_review_posts(p_event) then raise exception 'Only owners, co-owners and hosts can review wishes'; end if;
  if p_status is null or p_status not in ('pending', 'approved', 'rejected') then raise exception 'Invalid wish status'; end if;
  update public.guestbook_messages set status = p_status, reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_wish and event_id = p_event;
  if not found then raise exception 'Wish not found'; end if;
end $$;

create or replace function public.set_photo_reaction(p_photo uuid, p_reaction text) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare wedding uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to react to photos'; end if;
  if p_reaction is not null and p_reaction not in ('akshate', 'love', 'wow', 'celebrate') then raise exception 'Choose a valid reaction'; end if;
  select event_id into wedding from public.photos where id = p_photo and (public.is_host(event_id) or (status = 'approved' and not hidden));
  if wedding is null or not public.can_access_social_content(wedding) or
    not (public.is_photo_guest(wedding) or public.is_host(wedding)) then raise exception 'Photo is unavailable'; end if;
  if p_reaction is null then
    delete from public.akshate where photo_id = p_photo and user_id = auth.uid();
  else
    insert into public.akshate (photo_id, user_id, reaction) values (p_photo, auth.uid(), p_reaction)
      on conflict (photo_id, user_id) do update set reaction = excluded.reaction;
  end if;
end $$;

-- Preserve the shape of existing host exports, while labeling pending uploads
-- correctly instead of calling them shared or hidden.
create or replace view public.wedding_guest_post_activity as
  select p.event_id, p.uploaded_by as user_id, coalesce(p.post_id, p.id)::text as id, 'photo'::text as kind,
    (array_agg(p.uploader_name order by p.post_position nulls first, p.id))[1] as author,
    (array_agg(p.caption order by p.post_position nulls first, p.id))[1] as text,
    jsonb_agg(jsonb_build_object('id', p.id, 'path', p.storage_path, 'caption', p.caption,
      'moment', p.moment, 'questId', p.quest_id, 'hidden', p.hidden, 'status', p.status)
      order by p.post_position nulls first, p.id) as photos, max(p.created_at) as created_at,
    case when bool_or(p.status = 'pending') then 'pending' when bool_and(p.status = 'rejected') then 'rejected'
      when bool_and(p.hidden) then 'hidden' when bool_or(p.hidden) then 'partly_hidden' else 'shared' end as status
  from public.photos p where p.uploaded_by is not null group by p.event_id, p.uploaded_by, coalesce(p.post_id, p.id)
  union all
  select event_id, user_id, id::text, 'wish', name, message, '[]'::jsonb, created_at, status from public.guestbook_messages;

create or replace function public.admin_wedding_analytics(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_host(p_event) then raise exception 'Only hosts can view analytics'; end if;
  return (with signed_users as (
    select user_id from public.wedding_analytics_signins where event_id = p_event
    union select user_id from public.event_visitors where event_id = p_event
    union select user_id from public.devices where event_id = p_event
  ), posts as (
    select * from public.wedding_moderation_posts where event_id = p_event
  ), recent as (
    select * from posts order by created_at desc, kind, id limit 20
  ) select jsonb_build_object(
    'visitors', (select count(*) from public.wedding_analytics_visits where event_id = p_event),
    'signedIn', (select count(*) from signed_users s where exists (
      select 1 from auth.identities i where i.user_id = s.user_id and i.provider = 'google')
      and not exists (select 1 from public.hosts h where h.event_id = p_event and h.user_id = s.user_id)),
    'photoPosts', (select count(*) from posts where kind = 'photo'),
    'wishes', (select count(*) from posts where kind = 'wish'),
    'recentPosts', coalesce((select jsonb_agg(jsonb_build_object('id', id::text, 'kind', kind, 'name', name,
      'text', text, 'photoPath', photos->0->>'path', 'photos', jsonb_array_length(photos), 'createdAt', created_at,
      'status', case when kind = 'photo' and status = 'approved' then case when hidden then
        case when not exists (select 1 from jsonb_array_elements(photos) photo where (photo->>'hidden')::boolean = false)
          then 'hidden' else 'partly_hidden' end else 'shared' end else status end)
      order by created_at desc, kind, id) from recent), '[]'::jsonb)));
end $$;

commit;
