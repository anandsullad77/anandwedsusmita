-- Jothe Jotheyali — pilot schema
-- Identity model: Person (people) · Device (devices: an anonymous auth user) · Household · Attendance
-- Guests never sign in with OTP: a family link or the event PIN links their device to a person.
-- Hosts sign in with email/SMS OTP and are listed in `hosts`.

create extension if not exists pgcrypto;

-- ───────────────────────── tables ─────────────────────────
create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  couple_a text not null,
  couple_b text not null,
  starts_at timestamptz not null,
  venue text not null,
  map_url text,
  pin_hash text not null,                       -- crypt(pin, gen_salt('bf'))
  host_whatsapp text,                           -- for "Ask the hosts"
  household_cap_default int not null default 6,
  theme jsonb not null default '{}'::jsonb,
  album_closes_at timestamptz,                  -- 90 days after the event
  guest_data_purge_at timestamptz,              -- 30 days after the event
  created_at timestamptz not null default now()
);

-- The readable PIN, for hosts composing invite messages. Hosts only (RLS below).
create table public.event_secrets (
  event_id uuid primary key references public.events on delete cascade,
  pin text not null
);

create table public.event_functions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  name_en text not null,
  name_kn text,
  starts_at timestamptz not null,
  venue text,
  sort int not null default 0
);

create table public.hosts (
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('owner','cohost','planner','photographer')),
  display_name text,
  primary key (event_id, user_id)
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  name text not null,
  token text unique not null default encode(gen_random_bytes(9), 'hex'),
  side text,                                    -- 'bride' | 'groom' | free text
  invited_by text,
  cap int,
  function_ids uuid[] not null default '{}',
  invite_status text not null default 'not_sent' check (invite_status in ('not_sent','sent','opened','responded')),
  coming text check (coming in ('yes','no')),
  travel jsonb,                                 -- {mode, point, window}
  stay jsonb,                                   -- {nights: [...], manage: bool}
  blessing text,
  source text not null default 'list' check (source in ('list','open')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  household_id uuid not null references public.households on delete cascade,
  name text not null,
  relation text,                                -- picked by the guest: "Susmita's Chikkappa"
  phone text,                                   -- optional; never shown to other guests
  is_child boolean not null default false,
  added_by text not null default 'host' check (added_by in ('host','guest')),
  attending uuid[] not null default '{}',       -- event_function ids
  arrived_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.people (event_id, lower(name));
create index on public.people (event_id, phone);

create table public.devices (
  user_id uuid not null references auth.users on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  household_id uuid not null references public.households on delete cascade,
  person_id uuid not null references public.people on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create table public.household_changes (
  id bigserial primary key,
  household_id uuid not null references public.households on delete cascade,
  by_name text not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  person_id uuid references public.people on delete set null,
  uploader_name text not null,
  storage_path text not null,
  moment text,
  caption text,
  hidden boolean not null default false,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.photos (event_id, created_at desc);

create table public.akshate (
  photo_id uuid not null references public.photos on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  primary key (photo_id, user_id)
);

create table public.photo_flags (
  photo_id uuid not null references public.photos on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  reason text,
  is_removal_request boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);

create table public.photo_downloads (
  photo_id uuid not null references public.photos on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table public.announcements (
  id bigserial primary key,
  event_id uuid not null references public.events on delete cascade,
  body text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.pin_attempts (
  user_id uuid not null,
  event_id uuid not null references public.events on delete cascade,
  failures int not null default 0,
  last_failure_at timestamptz,
  primary key (user_id, event_id)
);

create table public.access_requests (
  id bigserial primary key,
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null,
  name text not null,
  phone text,
  note text,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now()
);

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.is_host(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from hosts where event_id = p_event and user_id = auth.uid());
$$;

create or replace function public.is_guest(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from devices where event_id = p_event and user_id = auth.uid());
$$;

create or replace function public.my_device(p_event uuid) returns public.devices
language sql stable security definer set search_path = public as $$
  select * from devices where event_id = p_event and user_id = auth.uid();
$$;

-- ───────────────────────── RLS ─────────────────────────
alter table public.events enable row level security;
alter table public.event_functions enable row level security;
alter table public.event_secrets enable row level security;
create policy secrets_host on public.event_secrets for select using (is_host(event_id));
alter table public.hosts enable row level security;
alter table public.households enable row level security;
alter table public.people enable row level security;
alter table public.devices enable row level security;
alter table public.household_changes enable row level security;
alter table public.photos enable row level security;
alter table public.akshate enable row level security;
alter table public.photo_flags enable row level security;
alter table public.photo_downloads enable row level security;
alter table public.announcements enable row level security;
alter table public.pin_attempts enable row level security;
alter table public.access_requests enable row level security;

create policy events_read on public.events for select using (is_guest(id) or is_host(id));
create policy events_host_write on public.events for update using (is_host(id));

create policy fn_read on public.event_functions for select using (is_guest(event_id) or is_host(event_id));
create policy fn_host on public.event_functions for all using (is_host(event_id)) with check (is_host(event_id));

create policy hosts_read on public.hosts for select using (is_host(event_id));

-- Guests read only their own household row; hosts manage all.
create policy hh_guest_read on public.households for select
  using (id = (my_device(event_id)).household_id);
create policy hh_host on public.households for all using (is_host(event_id)) with check (is_host(event_id));

-- People: hosts see everything (incl. phone). Guests read names via people_public view.
create policy people_host on public.people for all using (is_host(event_id)) with check (is_host(event_id));

create policy devices_self on public.devices for select using (user_id = auth.uid() or is_host(event_id));

create policy changes_read on public.household_changes for select using (
  exists (select 1 from households h where h.id = household_id
          and (is_host(h.event_id) or h.id = (my_device(h.event_id)).household_id)));

create policy photos_read on public.photos for select using (
  is_host(event_id) or (is_guest(event_id) and not hidden));
create policy photos_insert on public.photos for insert with check (
  is_host(event_id) or (is_guest(event_id) and person_id = (my_device(event_id)).person_id));
create policy photos_host on public.photos for update using (is_host(event_id));
create policy photos_host_delete on public.photos for delete using (is_host(event_id));

create policy akshate_read on public.akshate for select using (
  exists (select 1 from photos p where p.id = photo_id and (is_guest(p.event_id) or is_host(p.event_id))));
create policy akshate_own on public.akshate for insert with check (user_id = auth.uid());
create policy akshate_own_del on public.akshate for delete using (user_id = auth.uid());

create policy flags_host on public.photo_flags for select using (
  exists (select 1 from photos p where p.id = photo_id and is_host(p.event_id)));

create policy downloads_host on public.photo_downloads for select using (
  exists (select 1 from photos p where p.id = photo_id and is_host(p.event_id)));
create policy downloads_own on public.photo_downloads for insert with check (user_id = auth.uid());

create policy ann_read on public.announcements for select using (is_guest(event_id) or is_host(event_id));
create policy ann_host on public.announcements for insert with check (is_host(event_id));

create policy req_host on public.access_requests for all using (is_host(event_id)) with check (is_host(event_id));

-- Names and relations only — never phone numbers — for guests.
create or replace view public.people_public with (security_barrier) as
  select id, event_id, household_id, name, relation, is_child, arrived_at
  from public.people
  where is_guest(event_id) or is_host(event_id);
grant select on public.people_public to authenticated;

-- ───────────────────────── RPCs (guests) ─────────────────────────

-- Everything Banni needs for one family link. Callable before the device is linked.
create or replace function public.invite_bundle(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h households; e events;
begin
  select * into h from households where token = p_token;
  if not found then return null; end if;
  select * into e from events where id = h.event_id;
  return jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'slug', e.slug, 'title', e.title, 'coupleA', e.couple_a, 'coupleB', e.couple_b,
                                'startsAt', e.starts_at, 'venue', e.venue, 'mapUrl', e.map_url, 'theme', e.theme,
                                'hostWhatsapp', e.host_whatsapp),
    'functions', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nameEn', f.name_en, 'nameKn', f.name_kn,
                                'startsAt', f.starts_at, 'venue', f.venue) order by f.sort)
                           from event_functions f where f.id = any(h.function_ids)), '[]'::jsonb),
    'household', jsonb_build_object('id', h.id, 'name', h.name, 'cap', coalesce(h.cap, e.household_cap_default),
                                'coming', h.coming, 'travel', h.travel, 'stay', h.stay, 'updatedAt', h.updated_at),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'relation', p.relation,
                                'isChild', p.is_child, 'attending', p.attending, 'linked',
                                exists (select 1 from devices d where d.person_id = p.id)) order by p.created_at)
                        from people p where p.household_id = h.id), '[]'::jsonb)
  );
end $$;

-- "Who are you?" — link this device to a person (or add yourself) via the family link.
create or replace function public.claim_person(p_token text, p_person uuid, p_new_name text default null,
                                               p_relation text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare h households; pid uuid; n int; cap int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into h from households where token = p_token;
  if not found then raise exception 'invite not found'; end if;
  if p_person is not null then
    select id into pid from people where id = p_person and household_id = h.id;
    if pid is null then raise exception 'person not in household'; end if;
  else
    select count(*) into n from people where household_id = h.id;
    select coalesce(h.cap, e.household_cap_default) into cap from events e where e.id = h.event_id;
    if n >= cap then raise exception 'household is full — ask the hosts'; end if;
    insert into people (event_id, household_id, name, relation, added_by)
      values (h.event_id, h.id, p_new_name, p_relation, 'guest') returning id into pid;
  end if;
  if p_relation is not null then update people set relation = p_relation where id = pid; end if;
  insert into devices (user_id, event_id, household_id, person_id) values (auth.uid(), h.event_id, h.id, pid)
    on conflict (user_id, event_id) do update set household_id = excluded.household_id, person_id = excluded.person_id;
  update households set invite_status = case when invite_status in ('not_sent','sent') then 'opened' else invite_status end
    where id = h.id;
  return pid;
end $$;

-- Event PIN check with lockout: 5 wrong tries → 15 minutes.
create or replace function public.check_pin(p_slug text, p_pin text) returns uuid
language plpgsql security definer set search_path = public as $$
declare e events; a pin_attempts;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into e from events where slug = p_slug;
  if not found then raise exception 'event not found'; end if;
  select * into a from pin_attempts where user_id = auth.uid() and event_id = e.id;
  if a.failures >= 5 and a.last_failure_at > now() - interval '15 minutes' then
    raise exception 'too many tries — wait 15 minutes or ask the hosts';
  end if;
  if crypt(p_pin, e.pin_hash) <> e.pin_hash then
    insert into pin_attempts (user_id, event_id, failures, last_failure_at) values (auth.uid(), e.id, 1, now())
      on conflict (user_id, event_id) do update
      set failures = case when pin_attempts.last_failure_at < now() - interval '15 minutes' then 1 else pin_attempts.failures + 1 end,
          last_failure_at = now();
    return null;
  end if;
  delete from pin_attempts where user_id = auth.uid() and event_id = e.id;
  return e.id;
end $$;

-- After a correct PIN: find yourself on the host's list (by phone, else by name).
create or replace function public.find_on_list(p_slug text, p_pin text, p_query text, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ev uuid;
begin
  ev := check_pin(p_slug, p_pin);
  if ev is null then raise exception 'wrong PIN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('personId', p.id, 'name', p.name, 'household', h.name,
                                                       'householdToken', h.token))
                   from people p join households h on h.id = p.household_id
                   where p.event_id = ev
                     and ((p_phone is not null and p.phone = p_phone)
                          or (p_query <> '' and lower(p.name) like '%' || lower(p_query) || '%'))
                   limit 8), '[]'::jsonb);
end $$;

-- Open link, not on the list: create a household (number optional) and link this device.
create or replace function public.open_join(p_slug text, p_pin text, p_household text, p_people jsonb, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ev uuid; hid uuid; tok text; first_pid uuid; person jsonb; pid uuid;
begin
  ev := check_pin(p_slug, p_pin);
  if ev is null then raise exception 'wrong PIN'; end if;
  insert into households (event_id, name, source, function_ids)
    values (ev, p_household, 'open', (select coalesce(array_agg(id), '{}') from event_functions where event_id = ev))
    returning id, token into hid, tok;
  for person in select * from jsonb_array_elements(p_people) loop
    insert into people (event_id, household_id, name, relation, is_child, added_by, phone)
      values (ev, hid, person->>'name', person->>'relation', coalesce((person->>'isChild')::boolean, false), 'guest',
              case when first_pid is null then p_phone end)
      returning id into pid;
    if first_pid is null then first_pid := pid; end if;
  end loop;
  insert into devices (user_id, event_id, household_id, person_id) values (auth.uid(), ev, hid, first_pid)
    on conflict (user_id, event_id) do update set household_id = excluded.household_id, person_id = excluded.person_id;
  return jsonb_build_object('householdToken', tok, 'personId', first_pid);
end $$;

-- Save the shared household RSVP. Latest write wins; every save logs who changed what.
create or replace function public.save_rsvp(p_event uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare d devices; me people; summary text; item jsonb; n int; cap int;
begin
  d := my_device(p_event);
  if d.user_id is null then raise exception 'not a guest of this event'; end if;
  select * into me from people where id = d.person_id;

  for item in select * from jsonb_array_elements(coalesce(p_payload->'add', '[]'::jsonb)) loop
    select count(*) into n from people where household_id = d.household_id;
    select coalesce(h.cap, e.household_cap_default) into cap from households h join events e on e.id = h.event_id
      where h.id = d.household_id;
    if n >= cap then raise exception 'household is full — ask the hosts'; end if;
    insert into people (event_id, household_id, name, relation, is_child, added_by)
      values (p_event, d.household_id, item->>'name', item->>'relation', coalesce((item->>'isChild')::boolean, false), 'guest');
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_payload->'attendance', '[]'::jsonb)) loop
    update people set attending = array(select jsonb_array_elements_text(item->'functionIds'))::uuid[]
      where id = (item->>'personId')::uuid and household_id = d.household_id;
  end loop;

  update households set
    coming = coalesce(p_payload->>'coming', coming),
    travel = coalesce(p_payload->'travel', travel),
    stay = coalesce(p_payload->'stay', stay),
    blessing = coalesce(p_payload->>'blessing', blessing),
    invite_status = 'responded',
    updated_at = now(),
    updated_by = d.person_id
  where id = d.household_id;

  summary := coalesce(p_payload->>'summary', 'updated the RSVP');
  insert into household_changes (household_id, by_name, summary) values (d.household_id, me.name, summary);
end $$;

create or replace function public.mark_arrived(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d devices;
begin
  d := my_device(p_event);
  if d.user_id is null then raise exception 'not a guest'; end if;
  update people set arrived_at = coalesce(arrived_at, now()) where household_id = d.household_id and (attending <> '{}' or id = d.person_id);
end $$;

-- Two flags hide a photo until a host reviews it; a removal request hides it at once.
create or replace function public.flag_photo(p_photo uuid, p_reason text, p_removal boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare ev uuid; n int;
begin
  select event_id into ev from photos where id = p_photo;
  if not is_guest(ev) and not is_host(ev) then raise exception 'not allowed'; end if;
  insert into photo_flags (photo_id, user_id, reason, is_removal_request) values (p_photo, auth.uid(), p_reason, p_removal)
    on conflict do nothing;
  select count(*) into n from photo_flags where photo_id = p_photo;
  if p_removal or n >= 2 then update photos set hidden = true where id = p_photo; end if;
end $$;

-- "Ask the hosts" when the PIN fails.
create or replace function public.request_access(p_slug text, p_name text, p_phone text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare ev uuid;
begin
  select id into ev from events where slug = p_slug;
  insert into access_requests (event_id, user_id, name, phone, note) values (ev, auth.uid(), p_name, p_phone, p_note);
end $$;

-- Host: set or change the event PIN (stored hashed).
create or replace function public.set_event_pin(p_event uuid, p_pin text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_host(p_event) then raise exception 'hosts only'; end if;
  if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN must be 6 digits'; end if;
  update events set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_event;
  insert into event_secrets (event_id, pin) values (p_event, p_pin)
    on conflict (event_id) do update set pin = excluded.pin;
end $$;

grant execute on function public.invite_bundle(text) to anon, authenticated;
grant execute on function public.claim_person(text, uuid, text, text) to authenticated;
grant execute on function public.find_on_list(text, text, text, text) to authenticated;
grant execute on function public.open_join(text, text, text, jsonb, text) to authenticated;
grant execute on function public.save_rsvp(uuid, jsonb) to authenticated;
grant execute on function public.mark_arrived(uuid) to authenticated;
grant execute on function public.flag_photo(uuid, text, boolean) to authenticated;
grant execute on function public.request_access(text, text, text, text) to authenticated;
grant execute on function public.set_event_pin(uuid, text) to authenticated;
revoke execute on function public.check_pin(text, text) from public, anon;

-- ───────────────────────── storage ─────────────────────────
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict do nothing;

create policy photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (is_guest((storage.foldername(name))[1]::uuid) or is_host((storage.foldername(name))[1]::uuid)));
create policy photos_view on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (is_guest((storage.foldername(name))[1]::uuid) or is_host((storage.foldername(name))[1]::uuid)));

-- ───────────────────────── retention ─────────────────────────
-- Run daily (pg_cron or a scheduled Edge Function):
--   guest contact & travel data 30 days after the event; everything 90 days after (after the couple's ZIP link is sent).
create or replace function public.purge_expired() returns void
language plpgsql security definer set search_path = public as $$
begin
  update people p set phone = null from events e
    where p.event_id = e.id and e.guest_data_purge_at < now() and p.phone is not null;
  update households h set travel = null, stay = null from events e
    where h.event_id = e.id and e.guest_data_purge_at < now() and (h.travel is not null or h.stay is not null);
  delete from events where album_closes_at < now() - interval '30 days';  -- cascade deletes everything else
end $$;
