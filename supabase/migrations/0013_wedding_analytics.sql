begin;

-- A random browser ID counts invitation visitors without creating Auth accounts.
-- Do not collect URLs, family tokens, IP addresses or user agents.
create table public.wedding_analytics_visits (
  event_id uuid not null references public.events on delete cascade,
  visitor_id uuid not null,
  first_seen_at timestamptz not null default now(),
  primary key (event_id, visitor_id)
);
create table public.wedding_analytics_signins (
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  first_signed_in_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.wedding_analytics_visits enable row level security;
alter table public.wedding_analytics_signins enable row level security;
create policy analytics_visits_host on public.wedding_analytics_visits for select to authenticated using (public.is_host(event_id));
create policy analytics_signins_host on public.wedding_analytics_signins for select to authenticated using (public.is_host(event_id));
revoke all on public.wedding_analytics_visits, public.wedding_analytics_signins from public, anon, authenticated;
grant select on public.wedding_analytics_visits, public.wedding_analytics_signins to authenticated;

create function public.record_wedding_visit(p_visitor uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare wedding uuid;
begin
  if p_visitor is null then raise exception 'A visitor ID is required'; end if;
  select id into wedding from public.events where slug = 'anand-susmita';
  if wedding is null then return; end if;
  insert into public.wedding_analytics_visits (event_id, visitor_id) values (wedding, p_visitor)
    on conflict (event_id, visitor_id) do nothing;
end $$;
revoke all on function public.record_wedding_visit(uuid) from public;
grant execute on function public.record_wedding_visit(uuid) to anon, authenticated;

create function public.record_wedding_signin(p_visitor uuid) returns void
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
    on conflict (event_id, user_id) do nothing;
end $$;
revoke all on function public.record_wedding_signin(uuid) from public, anon;
grant execute on function public.record_wedding_signin(uuid) to authenticated;

create function public.admin_wedding_analytics(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_host(p_event) then raise exception 'Only hosts can view analytics'; end if;
  return (
    with signed_users as (
      select user_id from public.wedding_analytics_signins where event_id = p_event
      union select user_id from public.event_visitors where event_id = p_event
      union select user_id from public.devices where event_id = p_event
    ), photo_posts as (
      select coalesce(p.post_id, p.id) as id,
        (array_agg(p.uploader_name order by p.post_position nulls first, p.id))[1] as name,
        (array_agg(p.caption order by p.post_position nulls first, p.id))[1] as text,
        (array_agg(p.storage_path order by p.post_position nulls first, p.id))[1] as photo_path,
        count(*) as photos, max(p.created_at) as created_at,
        case when bool_and(p.hidden) then 'hidden' when bool_or(p.hidden) then 'partly_hidden' else 'shared' end as status
      from public.photos p where p.event_id = p_event group by coalesce(p.post_id, p.id)
    ), all_posts as (
      select id::text, 'photo'::text as kind, name, text, photo_path, photos, created_at, status from photo_posts
      union all
      select id::text, 'wish', name, message, null, 0, created_at, status from public.guestbook_messages where event_id = p_event
    ), recent as (
      select * from all_posts order by created_at desc, kind, id limit 20
    )
    select jsonb_build_object(
      'visitors', (select count(*) from public.wedding_analytics_visits where event_id = p_event),
      'signedIn', (select count(*) from signed_users s where exists (
        select 1 from auth.identities i where i.user_id = s.user_id and i.provider = 'google'
      ) and not exists (select 1 from public.hosts h where h.event_id = p_event and h.user_id = s.user_id)),
      'photoPosts', (select count(*) from photo_posts),
      'wishes', (select count(*) from public.guestbook_messages where event_id = p_event),
      'recentPosts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'kind', kind, 'name', name, 'text', text, 'photoPath', photo_path,
        'photos', photos, 'createdAt', created_at, 'status', status
      ) order by created_at desc, kind, id) from recent), '[]'::jsonb)
    )
  );
end $$;
revoke all on function public.admin_wedding_analytics(uuid) from public, anon;
grant execute on function public.admin_wedding_analytics(uuid) to authenticated;

commit;
