begin;

-- One final submit saves new family members and their attendance together.
-- A retry after a lost response must not add people or history twice.
alter table public.household_changes add column request_id uuid;
create unique index household_changes_request on public.household_changes(household_id, request_id) where request_id is not null;

create or replace function public.save_rsvp(p_event uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare d devices; me people; h households; item jsonb; n int; cap int; fns uuid[];
  request uuid := (p_payload->>'requestId')::uuid;
begin
  d := public.my_device(p_event);
  if d.user_id is null then raise exception 'Open your family invitation before replying'; end if;
  select * into h from public.households where id = d.household_id and event_id = p_event for update;
  if not found then raise exception 'Family invitation not found'; end if;
  if request is not null and exists (select 1 from public.household_changes where household_id = h.id and request_id = request) then return; end if;
  select * into me from public.people where id = d.person_id;
  select coalesce(h.cap, e.household_cap_default) into cap from public.events e where e.id = p_event;
  select count(*) into n from public.people where household_id = h.id;

  for item in select * from jsonb_array_elements(coalesce(p_payload->'add', '[]'::jsonb)) loop
    if n >= cap then raise exception 'Your family is full. Please ask the hosts to add more places.'; end if;
    if char_length(btrim(coalesce(item->>'name', ''))) not between 1 and 80 then raise exception 'Enter a name between 1 and 80 characters'; end if;
    fns := array(select jsonb_array_elements_text(coalesce(item->'functionIds', '[]'::jsonb)))::uuid[];
    if not fns <@ h.function_ids then raise exception 'Choose only the events on your invitation'; end if;
    insert into public.people (event_id, household_id, name, relation, is_child, added_by, attending)
      values (p_event, h.id, btrim(item->>'name'), item->>'relation', coalesce((item->>'isChild')::boolean, false), 'guest', fns);
    n := n + 1;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(p_payload->'attendance', '[]'::jsonb)) loop
    fns := array(select jsonb_array_elements_text(item->'functionIds'))::uuid[];
    if not fns <@ h.function_ids then raise exception 'Choose only the events on your invitation'; end if;
    update public.people set attending = fns where id = (item->>'personId')::uuid and household_id = h.id;
    if not found then raise exception 'A family member has changed. Reload your invitation and try again.'; end if;
  end loop;
  update public.households set
    coming = coalesce(p_payload->>'coming', coming),
    travel = case when p_payload ? 'travel' then nullif(p_payload->'travel', 'null'::jsonb) else travel end,
    stay = case when p_payload ? 'stay' then nullif(p_payload->'stay', 'null'::jsonb) else stay end,
    blessing = coalesce(p_payload->>'blessing', blessing),
    invite_status = case when p_payload ? 'coming' then 'responded' else invite_status end,
    updated_at = now(), updated_by = d.person_id
  where id = h.id;
  insert into public.household_changes (household_id, by_name, summary, request_id)
    values (h.id, me.name, coalesce(p_payload->>'summary', 'updated the RSVP'), request);
end $$;
revoke all on function public.save_rsvp(uuid, jsonb) from public, anon;
grant execute on function public.save_rsvp(uuid, jsonb) to authenticated;

commit;
