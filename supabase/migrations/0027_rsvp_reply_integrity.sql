-- Follows 0026_playground_sealed_until_wedding_ends.sql from main.
begin;

-- Retried requests may be repeated, but must not silently discard a changed reply.
alter table public.household_changes add column if not exists request_fingerprint text;

-- Include the saved message when guests reopen their invitation.
create or replace function public.invite_bundle(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare bundle jsonb; kind text; message text;
begin
  bundle := public.invite_bundle_before_invitation_type(p_token);
  if bundle is null then return null; end if;
  select invitation_type, blessing into kind, message from public.households where token = p_token;
  return jsonb_set(bundle, '{household}', (bundle->'household') || jsonb_build_object('invitationType', kind, 'blessing', message));
end $$;
revoke all on function public.invite_bundle(text) from public;
grant execute on function public.invite_bundle(text) to anon, authenticated;

create or replace function public.save_rsvp(p_event uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare d devices; me people; h households; item jsonb; n int; cap int; fns uuid[]; allowed uuid[];
  request uuid := (p_payload->>'requestId')::uuid;
  fingerprint text := md5((p_payload - 'requestId')::text);
  previous_fingerprint text;
  reply text;
begin
  d := public.my_device(p_event);
  if d.user_id is null then raise exception 'Open your family invitation before replying'; end if;
  select * into h from public.households where id = d.household_id and event_id = p_event for update;
  if not found then raise exception 'Family invitation not found'; end if;
  if request is not null then
    select request_fingerprint into previous_fingerprint from public.household_changes where household_id = h.id and request_id = request;
    if found then
      -- Requests saved before this migration have no fingerprint; keep their retries safe.
      if previous_fingerprint is not null and previous_fingerprint is distinct from fingerprint then
        raise exception 'This reply was already received. Reopen your invitation before making further changes.';
      end if;
      return;
    end if;
  end if;
  if p_payload ? 'coming' and coalesce(p_payload->>'coming', '') not in ('yes', 'no') then
    raise exception 'Please tell us whether you can attend';
  end if;
  reply := coalesce(p_payload->>'coming', h.coming);
  select * into me from public.people where id = d.person_id and household_id = h.id;
  select coalesce(h.cap, e.household_cap_default) into cap from public.events e where e.id = p_event;
  select count(*) into n from public.people where household_id = h.id;
  select coalesce(array_agg(id), '{}'::uuid[]) into allowed from public.event_functions where event_id = p_event and id = any(h.function_ids);

  for item in select * from jsonb_array_elements(coalesce(p_payload->'add', '[]'::jsonb)) loop
    if n >= cap then raise exception 'Your family is full. Please ask the hosts to add more places.'; end if;
    if char_length(btrim(coalesce(item->>'name', ''))) not between 1 and 80 then raise exception 'Enter a name between 1 and 80 characters'; end if;
    fns := array(select jsonb_array_elements_text(coalesce(item->'functionIds', '[]'::jsonb)))::uuid[];
    if not fns <@ allowed then raise exception 'Choose only the events on your invitation'; end if;
    insert into public.people (event_id, household_id, name, relation, is_child, added_by, attending)
      values (p_event, h.id, btrim(item->>'name'), item->>'relation', coalesce((item->>'isChild')::boolean, false), 'guest', fns);
    n := n + 1;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(p_payload->'attendance', '[]'::jsonb)) loop
    fns := array(select jsonb_array_elements_text(item->'functionIds'))::uuid[];
    if not fns <@ allowed then raise exception 'Choose only the events on your invitation'; end if;
    update public.people set attending = fns where id = (item->>'personId')::uuid and household_id = h.id;
    if not found then raise exception 'A family member has changed. Reload your invitation and try again.'; end if;
  end loop;
  if reply = 'yes' and not exists (select 1 from public.people where household_id = h.id and attending && allowed) then
    raise exception 'Please select at least one guest and one event.';
  end if;
  if reply = 'no' then update public.people set attending = '{}' where household_id = h.id; end if;
  update public.households set
    coming = reply,
    travel = case when reply = 'no' then null when p_payload ? 'travel' then nullif(p_payload->'travel', 'null'::jsonb) else travel end,
    stay = case when reply = 'no' then null when p_payload ? 'stay' then nullif(p_payload->'stay', 'null'::jsonb) else stay end,
    blessing = coalesce(p_payload->>'blessing', blessing),
    invite_status = case when p_payload ? 'coming' then 'responded' else invite_status end,
    updated_at = now(), updated_by = d.person_id
  where id = h.id;
  insert into public.household_changes (household_id, by_name, summary, request_id, request_fingerprint)
    values (h.id, me.name, coalesce(p_payload->>'summary', 'updated the RSVP'), request, fingerprint);
end $$;
revoke all on function public.save_rsvp(uuid, jsonb) from public, anon;
grant execute on function public.save_rsvp(uuid, jsonb) to authenticated;

commit;
