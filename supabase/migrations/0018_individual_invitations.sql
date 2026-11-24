begin;

-- Existing invitations keep their family flow. Contact imports explicitly opt in.
alter table public.households add column invitation_type text not null default 'family'
  check (invitation_type in ('individual', 'family'));
alter table public.households add constraint individual_invite_capacity check (invitation_type <> 'individual' or (cap is not null and cap = 1));

create function public.guard_individual_invitation() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.invitation_type = 'individual' and (select count(*) from public.people where household_id = new.id) > 1 then
    raise exception 'An invitation with multiple people must remain a family invitation';
  end if;
  return new;
end $$;
create trigger individual_household_guard before update on public.households for each row execute function public.guard_individual_invitation();

create function public.guard_individual_member() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare kind text;
begin
  select invitation_type into kind from public.households where id = new.household_id for update;
  if kind = 'individual' and exists(select 1 from public.people where household_id = new.household_id and id <> new.id) then
    raise exception 'An individual invitation is for one person only';
  end if;
  return new;
end $$;
create trigger individual_person_guard before insert or update of household_id on public.people for each row execute function public.guard_individual_member();
revoke all on function public.guard_individual_invitation(), public.guard_individual_member() from public, anon, authenticated;

alter function public.invite_bundle(text) rename to invite_bundle_before_invitation_type;
revoke all on function public.invite_bundle_before_invitation_type(text) from public, anon, authenticated;
create function public.invite_bundle(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare bundle jsonb; kind text;
begin
  bundle := public.invite_bundle_before_invitation_type(p_token);
  if bundle is null then return null; end if;
  select invitation_type into kind from public.households where token = p_token;
  return jsonb_set(bundle, '{household,invitationType}', to_jsonb(kind));
end $$;
revoke all on function public.invite_bundle(text) from public;
grant execute on function public.invite_bundle(text) to anon, authenticated;

-- Host-only Excel imports. One RPC is one transaction, including all people.
-- Existing names are skipped, making a retry safe if the response was lost.
create or replace function public.import_households(p_event uuid, p_households jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  h jsonb;
  person jsonb;
  hid uuid;
  name_key text;
  seen text[] := '{}';
  n int;
  cap int;
  total_people int := 0;
  created int := 0;
  skipped int := 0;
begin
  if not is_host(p_event) then raise exception 'Only hosts can import families'; end if;
  if jsonb_typeof(p_households) is distinct from 'array' then
    raise exception 'Families must be an array';
  end if;
  if jsonb_array_length(p_households) < 1 or jsonb_array_length(p_households) > 500 then
    raise exception 'Upload between 1 and 500 families';
  end if;

  -- Serialize imports for this event so simultaneous uploads cannot duplicate names.
  perform 1 from events where id = p_event for update;
  for h in select value from jsonb_array_elements(p_households) loop
    if jsonb_typeof(h) is distinct from 'object'
      or jsonb_typeof(h->'name') is distinct from 'string'
      or length(btrim(h->>'name')) < 1 or length(h->>'name') > 200 then
      raise exception 'Family names must contain 1–200 characters';
    end if;
    name_key := lower(regexp_replace(btrim(h->>'name'), '\s+', ' ', 'g'));
    if name_key = any(seen) then raise exception 'Duplicate family: %', h->>'name'; end if;
    seen := array_append(seen, name_key);
    if h->>'side' is not null and h->>'side' not in ('Bride', 'Groom', 'Both') then
      raise exception 'Invalid side for %', h->>'name';
    end if;
    if coalesce(length(h->>'invitedBy'), 0) > 200 then raise exception 'Invited by must be 200 characters or fewer'; end if;
    if jsonb_typeof(h->'cap') is distinct from 'number' or (h->>'cap') !~ '^[0-9]{1,2}$' then
      raise exception 'Max people must be a whole number from 1 to 20';
    end if;
    if coalesce(h->>'invitationType', 'family') not in ('individual', 'family') then raise exception 'Choose Individual or Family'; end if;
    if h->>'invitationType' = 'individual' and ((h->>'cap')::int <> 1 or jsonb_array_length(h->'people') <> 1) then raise exception 'An individual invitation must contain one person and one place'; end if;
    cap := (h->>'cap')::int;
    if cap < 1 or cap > 20 then raise exception 'Max people must be a whole number from 1 to 20'; end if;
    if jsonb_typeof(h->'people') is distinct from 'array' then raise exception 'Each family must include people'; end if;
    n := jsonb_array_length(h->'people');
    if n < 1 or n > cap then raise exception 'Max people for % must cover everyone listed', h->>'name'; end if;
    total_people := total_people + n;
    if total_people > 2000 then raise exception 'Upload at most 2,000 people at a time'; end if;
    if jsonb_typeof(h->'functionIds') is distinct from 'array' then raise exception 'Choose valid functions'; end if;
    if (jsonb_array_length(h->'functionIds') = 0 and exists(select 1 from event_functions where event_id = p_event))
      or exists (
        select 1 from jsonb_array_elements_text(h->'functionIds') as item(id)
        where not exists(select 1 from event_functions f where f.event_id = p_event and f.id::text = item.id)
      ) then raise exception 'Choose functions belonging to this wedding';
    end if;
    for person in select value from jsonb_array_elements(h->'people') loop
      if jsonb_typeof(person->'name') is distinct from 'string'
        or length(btrim(person->>'name')) < 1 or length(person->>'name') > 200 then
        raise exception 'Person names must contain 1–200 characters';
      end if;
      if jsonb_typeof(person->'isChild') is distinct from 'boolean' then raise exception 'Child must be Yes or No'; end if;
      if person->>'phone' is not null and (person->>'phone') !~ '^\+?[0-9]{7,15}$' then
        raise exception 'Invalid WhatsApp number for %', person->>'name';
      end if;
    end loop;
    if (select count(distinct lower(regexp_replace(btrim(value->>'name'), '\s+', ' ', 'g')))
        from jsonb_array_elements(h->'people')) <> n then
      raise exception 'Duplicate person in %', h->>'name';
    end if;

    if exists(select 1 from households where event_id = p_event
      and lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = name_key) then
      skipped := skipped + 1;
      continue;
    end if;
    insert into households (event_id, name, side, invited_by, cap, function_ids, invite_status, source, invitation_type)
      values (p_event, btrim(h->>'name'), h->>'side', nullif(btrim(h->>'invitedBy'), ''), cap,
        array(select distinct value::uuid from jsonb_array_elements_text(h->'functionIds')),
        'not_sent', 'list', coalesce(h->>'invitationType', 'family')) returning id into hid;
    insert into people (event_id, household_id, name, phone, is_child, added_by)
      select p_event, hid, btrim(value->>'name'), value->>'phone', (value->>'isChild')::boolean, 'host'
      from jsonb_array_elements(h->'people');
    created := created + 1;
  end loop;
  return jsonb_build_object('created', created, 'skipped', skipped);
end $$;

revoke all on function public.import_households(uuid, jsonb) from public, anon;
grant execute on function public.import_households(uuid, jsonb) to authenticated;

commit;
