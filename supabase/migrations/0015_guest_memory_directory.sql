begin;

-- Preserve event-specific sign-in times; auth.users.last_sign_in_at may also
-- reflect other applications sharing this Supabase project.
alter table public.wedding_analytics_signins add column last_signed_in_at timestamptz;
update public.wedding_analytics_signins set last_signed_in_at = first_signed_in_at;
alter table public.wedding_analytics_signins alter column last_signed_in_at set default now();
alter table public.wedding_analytics_signins alter column last_signed_in_at set not null;

create or replace function public.record_wedding_signin(p_visitor uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare wedding uuid;
begin
  select id into wedding from public.events where slug = 'anand-susmita';
  if wedding is null then return; end if;
  if auth.uid() is null or not exists (
    select 1 from auth.identities where user_id = auth.uid() and provider = 'google'
  ) then raise exception 'Sign in with Google'; end if;
  if public.is_host(wedding) then return; end if;
  perform public.record_wedding_visit(p_visitor);
  insert into public.wedding_analytics_signins (event_id, user_id) values (wedding, auth.uid())
    on conflict (event_id, user_id) do update set last_signed_in_at = greatest(wedding_analytics_signins.last_signed_in_at, now());
end $$;
revoke all on function public.record_wedding_signin(uuid) from public, anon;
grant execute on function public.record_wedding_signin(uuid) to authenticated;

create index photos_guest_memory on public.photos (event_id, uploaded_by, created_at desc);

-- These owner-executed internal views have NO client grants. Only the checked
-- host RPCs below may read them. Never join a guest to a post by display name.
create view public.wedding_guest_post_activity as
  select p.event_id, p.uploaded_by as user_id, coalesce(p.post_id, p.id)::text as id, 'photo'::text as kind,
    (array_agg(p.uploader_name order by p.post_position nulls first, p.id))[1] as author,
    (array_agg(p.caption order by p.post_position nulls first, p.id))[1] as text,
    jsonb_agg(jsonb_build_object('id', p.id, 'path', p.storage_path, 'caption', p.caption,
      'moment', p.moment, 'questId', p.quest_id, 'hidden', p.hidden)
      order by p.post_position nulls first, p.id) as photos,
    max(p.created_at) as created_at,
    case when bool_and(p.hidden) then 'hidden' when bool_or(p.hidden) then 'partly_hidden' else 'shared' end as status
  from public.photos p where p.uploaded_by is not null group by p.event_id, p.uploaded_by, coalesce(p.post_id, p.id)
  union all
  select event_id, user_id, id::text, 'wish', name, message, '[]'::jsonb, created_at, status from public.guestbook_messages;
revoke all on public.wedding_guest_post_activity from public, anon, authenticated;

create view public.wedding_guest_directory as
with signals as (
  select event_id, user_id, first_signed_in_at as first_at, last_signed_in_at as last_at from public.wedding_analytics_signins
  union all select event_id, user_id, created_at, created_at from public.event_visitors
  union all select event_id, user_id, created_at, created_at from public.devices
  union all select event_id, user_id, created_at, created_at from public.wedding_guest_post_activity
  union all select p.event_id, a.user_id, null::timestamptz, null::timestamptz from public.akshate a join public.photos p on p.id = a.photo_id
), guests as (
  select event_id, user_id, min(first_at) as first_seen_at, max(last_at) as last_active_at from signals group by event_id, user_id
), posts as (
  select event_id, user_id, count(*) filter (where kind = 'photo') as photo_posts,
    coalesce(sum(jsonb_array_length(photos)) filter (where kind = 'photo'), 0) as photos,
    count(*) filter (where kind = 'wish') as wishes from public.wedding_guest_post_activity group by event_id, user_id
), reactions as (
  select p.event_id, a.user_id, count(*) as reactions from public.akshate a join public.photos p on p.id = a.photo_id group by p.event_id, a.user_id
)
select g.event_id, g.user_id,
  coalesce(nullif(i.identity_data->>'full_name', ''), nullif(i.identity_data->>'name', ''),
    nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'name', ''),
    nullif(v.display_name, ''), 'Guest') as name,
  coalesce(nullif(i.identity_data->>'email', ''), nullif(u.email, '')) as email,
  g.first_seen_at, g.last_active_at,
  (select min(first_signed_in_at) from public.wedding_analytics_signins s where s.event_id = g.event_id and s.user_id = g.user_id) as first_signed_in_at,
  (select max(last_signed_in_at) from public.wedding_analytics_signins s where s.event_id = g.event_id and s.user_id = g.user_id) as last_signed_in_at,
  coalesce(p.photo_posts, 0) as photo_posts, coalesce(p.photos, 0) as photos, coalesce(p.wishes, 0) as wishes, coalesce(r.reactions, 0) as reactions
from guests g join auth.users u on u.id = g.user_id
join lateral (select identity_data from auth.identities where user_id = g.user_id and provider = 'google'
  order by coalesce(identity_data->>'email', '') limit 1) i on true
left join public.event_visitors v on v.event_id = g.event_id and v.user_id = g.user_id
left join posts p on p.event_id = g.event_id and p.user_id = g.user_id
left join reactions r on r.event_id = g.event_id and r.user_id = g.user_id
where not exists (select 1 from public.hosts h where h.event_id = g.event_id and h.user_id = g.user_id);
revoke all on public.wedding_guest_directory from public, anon, authenticated;

create function public.admin_wedding_guests(p_event uuid, p_query text default '', p_limit integer default 50, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_host(p_event) then raise exception 'Only hosts can view guest contacts'; end if;
  return (with matching as (
    select * from public.wedding_guest_directory where event_id = p_event
      and position(lower(btrim(coalesce(p_query, ''))) in lower(name || ' ' || coalesce(email, ''))) > 0
  ), page as (
    select * from matching order by lower(name), user_id
      limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  ) select jsonb_build_object('total', (select count(*) from matching), 'guests', coalesce((select jsonb_agg(jsonb_build_object(
    'id', user_id, 'name', name, 'email', email, 'firstSeenAt', first_seen_at, 'lastActiveAt', last_active_at,
    'firstSignedInAt', first_signed_in_at, 'lastSignedInAt', last_signed_in_at,
    'photoPosts', photo_posts, 'photos', photos, 'wishes', wishes, 'reactions', reactions
  ) order by lower(name), user_id) from page), '[]'::jsonb)));
end $$;
revoke all on function public.admin_wedding_guests(uuid, text, integer, integer) from public, anon;
grant execute on function public.admin_wedding_guests(uuid, text, integer, integer) to authenticated;

create function public.admin_wedding_guest_posts(p_event uuid, p_user uuid default null, p_limit integer default 50, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_host(p_event) then raise exception 'Only hosts can view guest activities'; end if;
  return (with matching as (
    select a.*, g.name, g.email from public.wedding_guest_post_activity a
      join public.wedding_guest_directory g on g.event_id = a.event_id and g.user_id = a.user_id
    where a.event_id = p_event and (p_user is null or a.user_id = p_user)
  ), page as (
    select * from matching order by created_at desc, user_id, kind, id
      limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  ) select jsonb_build_object('total', (select count(*) from matching), 'posts', coalesce((select jsonb_agg(jsonb_build_object(
    'id', id, 'guestId', user_id, 'name', name, 'email', email, 'author', author, 'kind', kind, 'text', text,
    'photos', photos, 'createdAt', created_at, 'status', status
  ) order by created_at desc, user_id, kind, id) from page), '[]'::jsonb)));
end $$;
revoke all on function public.admin_wedding_guest_posts(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.admin_wedding_guest_posts(uuid, uuid, integer, integer) to authenticated;

commit;
