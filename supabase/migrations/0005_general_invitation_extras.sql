begin;

create table public.general_invitation_settings (
  event_id uuid primary key references public.events on delete cascade,
  welcome_message text not null default 'Warmly invite you to celebrate their wedding.' check (char_length(btrim(welcome_message)) between 1 and 500),
  cover_path text,
  sections jsonb not null default '{"cover":true,"schedule":true,"photos":true,"uploads":true,"updates":true,"guestbook":true,"download":true}'::jsonb
);
alter table public.general_invitation_settings enable row level security;
create policy invitation_settings_read on public.general_invitation_settings for select to authenticated
  using (is_host(event_id) or exists(select 1 from public.event_visitors v where v.event_id = general_invitation_settings.event_id and v.user_id = auth.uid()));
grant select on public.general_invitation_settings to authenticated;

create or replace function public.general_section_enabled(p_event uuid, p_section text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select (sections->>p_section)::boolean from general_invitation_settings where event_id = p_event), true);
$$;

create or replace function public.save_general_invitation_settings(p_event uuid, p_welcome text, p_cover text, p_sections jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare k text;
begin
  if not is_host(p_event) then raise exception 'Only hosts can customize the invitation'; end if;
  if p_welcome is null or char_length(btrim(p_welcome)) not between 1 and 500 then raise exception 'The welcome message must contain 1–500 characters'; end if;
  if jsonb_typeof(p_sections) is distinct from 'object' then raise exception 'Invalid section visibility'; end if;
  if (select count(*) from jsonb_object_keys(p_sections)) <> 7 then raise exception 'Invalid section visibility'; end if;
  foreach k in array array['cover','schedule','photos','uploads','updates','guestbook','download'] loop
    if jsonb_typeof(p_sections->k) is distinct from 'boolean' then raise exception 'Invalid visibility for %', k; end if;
  end loop;
  if p_cover is not null then
    if p_cover !~ ('^' || p_event::text || '/[0-9a-f-]{36}\.(webp|png|jpg)$') then raise exception 'Invalid cover photo'; end if;
    if not exists(select 1 from storage.objects where bucket_id = 'invitation-covers' and name = p_cover) then raise exception 'Upload the cover photo before saving'; end if;
  end if;
  insert into general_invitation_settings (event_id, welcome_message, cover_path, sections)
    values (p_event, btrim(p_welcome), p_cover, p_sections)
    on conflict (event_id) do update set welcome_message = excluded.welcome_message, cover_path = excluded.cover_path, sections = excluded.sections;
end $$;

create table public.guestbook_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  request_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  unique(event_id, user_id, request_id)
);
create index guestbook_event_status on public.guestbook_messages (event_id, status, created_at desc);
create index guestbook_sender on public.guestbook_messages (event_id, user_id, created_at desc);
alter table public.guestbook_messages enable row level security;
create policy wishes_read on public.guestbook_messages for select to authenticated using (
  is_host(event_id) or (status = 'approved' and general_section_enabled(event_id, 'guestbook')
    and exists(select 1 from public.event_visitors v where v.event_id = guestbook_messages.event_id and v.user_id = auth.uid()))
);
grant select on public.guestbook_messages to authenticated;
-- No client INSERT/UPDATE policies: submissions and moderation go through validated RPCs.

create or replace function public.submit_guestbook_wish(p_token text, p_name text, p_message text, p_request uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare ev uuid;
begin
  if auth.uid() is null then raise exception 'Open the invitation before leaving a wish'; end if;
  select g.event_id into ev from general_invites g join event_visitors v on v.event_id = g.event_id
    where g.token::text = p_token and v.user_id = auth.uid();
  if ev is null then raise exception 'Open the general invitation before leaving a wish'; end if;
  if not general_section_enabled(ev, 'guestbook') then raise exception 'The guestbook is currently closed'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'Enter a name between 1 and 80 characters'; end if;
  if p_message is null or char_length(btrim(p_message)) not between 1 and 1000 then raise exception 'Enter a wish between 1 and 1,000 characters'; end if;
  if p_request is null then raise exception 'Missing submission identifier'; end if;
  perform pg_advisory_xact_lock(hashtextextended(ev::text || auth.uid()::text, 0));
  if exists(select 1 from guestbook_messages where event_id = ev and user_id = auth.uid() and request_id = p_request) then return; end if;
  if exists(select 1 from guestbook_messages where event_id = ev and user_id = auth.uid() and created_at > now() - interval '30 seconds') then
    raise exception 'Please wait 30 seconds before sending another wish';
  end if;
  if (select count(*) from guestbook_messages where event_id = ev and user_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You can leave up to 10 wishes per day';
  end if;
  insert into guestbook_messages (event_id, user_id, request_id, name, message, status)
    values (ev, auth.uid(), p_request, btrim(p_name), btrim(p_message), 'pending');
end $$;

create or replace function public.moderate_guestbook_wish(p_event uuid, p_wish uuid, p_status text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_host(p_event) then raise exception 'Only hosts can review wishes'; end if;
  if p_status is null or p_status not in ('pending','approved','rejected') then raise exception 'Invalid wish status'; end if;
  update guestbook_messages set status = p_status where id = p_wish and event_id = p_event;
  if not found then raise exception 'Wish not found'; end if;
end $$;

insert into storage.buckets (id, name, public) values ('invitation-covers', 'invitation-covers', false) on conflict do nothing;
-- Private covers are signed only for hosts and visitors who opened the invitation.
create policy invitation_cover_read on storage.objects for select to authenticated using (
  bucket_id = 'invitation-covers' and (is_host((storage.foldername(name))[1]::uuid)
    or exists(select 1 from public.event_visitors v where v.event_id::text = (storage.foldername(name))[1] and v.user_id = auth.uid()))
);
create policy invitation_cover_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'invitation-covers' and is_host((storage.foldername(name))[1]::uuid)
);
create policy invitation_cover_delete on storage.objects for delete to authenticated using (
  bucket_id = 'invitation-covers' and is_host((storage.foldername(name))[1]::uuid)
);

revoke all on function public.general_section_enabled(uuid, text) from public, anon;
revoke all on function public.save_general_invitation_settings(uuid, text, text, jsonb) from public, anon;
revoke all on function public.submit_guestbook_wish(text, text, text, uuid) from public, anon;
revoke all on function public.moderate_guestbook_wish(uuid, uuid, text) from public, anon;
grant execute on function public.general_section_enabled(uuid, text) to authenticated;
grant execute on function public.save_general_invitation_settings(uuid, text, text, jsonb) to authenticated;
grant execute on function public.submit_guestbook_wish(text, text, text, uuid) to authenticated;
grant execute on function public.moderate_guestbook_wish(uuid, uuid, text) to authenticated;

commit;
