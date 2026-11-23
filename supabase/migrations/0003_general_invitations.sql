begin;

-- Shareable invitation access is separate from household membership and RSVP.
create table public.general_invites (
  event_id uuid primary key references public.events on delete cascade,
  token uuid not null unique default gen_random_uuid()
);
create table public.event_visitors (
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.general_invites enable row level security;
alter table public.event_visitors enable row level security;
create policy general_invites_host on public.general_invites for select using (is_host(event_id));
create policy visitors_read on public.event_visitors for select using (user_id = auth.uid() or is_host(event_id));
grant select on public.general_invites, public.event_visitors to authenticated;

create or replace function public.general_invite_token(p_event uuid) returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not is_host(p_event) then raise exception 'hosts only'; end if;
  insert into general_invites (event_id) values (p_event) on conflict (event_id) do nothing;
  select token::text into t from general_invites where event_id = p_event;
  return t;
end $$;

-- Only the link holder can join. Return invitation details, never family data or the PIN.
create or replace function public.open_general_invite(p_token text, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events; nm text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select ev.* into e from events ev join general_invites g on g.event_id = ev.id where g.token::text = p_token;
  if not found then return null; end if;
  if p_name is not null then
    nm := btrim(p_name);
    if char_length(nm) not between 1 and 80 then raise exception 'Enter a name between 1 and 80 characters'; end if;
  end if;
  insert into event_visitors (event_id, user_id, display_name) values (e.id, auth.uid(), nm)
    on conflict (event_id, user_id) do update
      set display_name = coalesce(excluded.display_name, event_visitors.display_name)
    returning display_name into nm;
  return jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'slug', e.slug, 'title', e.title, 'coupleA', e.couple_a, 'coupleB', e.couple_b,
      'startsAt', e.starts_at, 'venue', e.venue, 'mapUrl', e.map_url, 'theme', e.theme, 'hostWhatsapp', e.host_whatsapp),
    'functions', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nameEn', f.name_en, 'nameKn', f.name_kn,
      'startsAt', f.starts_at, 'venue', f.venue) order by f.sort) from event_functions f where f.event_id = e.id), '[]'::jsonb),
    'guestName', nm
  );
end $$;

-- Keep is_guest/my_device unchanged: visitors cannot access family planning RPCs.
create or replace function public.is_photo_guest(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_guest(p_event) or exists (
    select 1 from event_visitors where event_id = p_event and user_id = auth.uid()
  );
$$;

-- Leave legacy ownership unknown; apply the authenticated default only to new uploads.
alter table public.photos add column uploaded_by uuid references auth.users on delete set null;
alter table public.photos alter column uploaded_by set default auth.uid();

drop policy photos_read on public.photos;
create policy photos_read on public.photos for select using (
  is_host(event_id) or (is_photo_guest(event_id) and not hidden)
);
drop policy photos_insert on public.photos;
create policy photos_insert on public.photos for insert with check (
  uploaded_by = auth.uid() and (
    is_host(event_id)
    or (is_guest(event_id) and person_id = (my_device(event_id)).person_id)
    or (person_id is null and exists (
      select 1 from event_visitors v where v.event_id = photos.event_id and v.user_id = auth.uid()
        and v.display_name is not null and char_length(btrim(photos.uploader_name)) between 1 and 80
    ))
  )
);

drop policy akshate_read on public.akshate;
create policy akshate_read on public.akshate for select using (
  exists (select 1 from photos p where p.id = photo_id and (is_photo_guest(p.event_id) or is_host(p.event_id)))
);
drop policy akshate_own on public.akshate;
create policy akshate_own on public.akshate for insert with check (
  user_id = auth.uid() and exists (
    select 1 from photos p where p.id = photo_id and (is_photo_guest(p.event_id) or is_host(p.event_id))
  )
);
drop policy ann_read on public.announcements;
create policy ann_read on public.announcements for select using (is_photo_guest(event_id) or is_host(event_id));

drop policy photos_upload on storage.objects;
create policy photos_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'photos' and (is_photo_guest((storage.foldername(name))[1]::uuid) or is_host((storage.foldername(name))[1]::uuid))
);
drop policy photos_view on storage.objects;
create policy photos_view on storage.objects for select to authenticated using (
  bucket_id = 'photos' and (is_photo_guest((storage.foldername(name))[1]::uuid) or is_host((storage.foldername(name))[1]::uuid))
);

-- Visitors can request host review, and never hide or delete photos themselves.
create or replace function public.flag_photo(p_photo uuid, p_reason text, p_removal boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare ev uuid;
begin
  select event_id into ev from photos where id = p_photo;
  if ev is null or (not is_photo_guest(ev) and not is_host(ev)) then raise exception 'not allowed'; end if;
  insert into photo_flags (photo_id, user_id, reason, is_removal_request)
    values (p_photo, auth.uid(), p_reason, coalesce(p_removal, false))
    on conflict (photo_id, user_id) do update
      set reason = excluded.reason,
          is_removal_request = photo_flags.is_removal_request or excluded.is_removal_request;
end $$;

revoke execute on function public.general_invite_token(uuid) from public, anon;
revoke execute on function public.open_general_invite(text, text) from public, anon;
revoke execute on function public.is_photo_guest(uuid) from public, anon;
revoke execute on function public.flag_photo(uuid, text, boolean) from public, anon;
grant execute on function public.general_invite_token(uuid) to authenticated;
grant execute on function public.open_general_invite(text, text) to authenticated;
grant execute on function public.is_photo_guest(uuid) to authenticated;
grant execute on function public.flag_photo(uuid, text, boolean) to authenticated;

commit;
