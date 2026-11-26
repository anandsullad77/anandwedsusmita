begin;

alter table public.wedding_polls add column if not exists replaces_poll_id uuid references public.wedding_polls on delete set null;
create unique index if not exists wedding_polls_one_replacement on public.wedding_polls(replaces_poll_id) where replaces_poll_id is not null;

-- Let hosts edit voted questions without relabelling anyone's saved ballot.
-- Content changes replace the active question; presentation changes keep it.
create or replace function public.edit_wedding_poll(p_event uuid, p_poll jsonb, p_allow_revision boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  pid uuid := (p_poll->>'id')::uuid;
  old public.wedding_polls;
  replacement public.wedding_polls;
  old_correct integer;
  old_secrets text[];
  correct integer := (p_poll->>'correct')::integer;
  photos uuid[] := array(select jsonb_array_elements_text(coalesce(p_poll->'photoIds', '[]'))::uuid);
  secrets text[] := case when jsonb_typeof(p_poll->'coupleAnswers') = 'array' then array(select jsonb_array_elements_text(p_poll->'coupleAnswers')) else null end;
  changed boolean;
  new_id uuid;
begin
  if not public.is_host(p_event) then raise exception 'Only hosts can manage polls'; end if;
  if pid is null then raise exception 'Choose a question to save'; end if;
  if p_poll->>'category' is null or p_poll->>'category' not in ('duel', 'prediction', 'quiz', 'photo') then
    raise exception 'Choose an available activity'; end if;
  perform pg_advisory_xact_lock(hashtextextended(pid::text, 1));
  select * into old from public.wedding_polls where id = pid for update;
  if not found then
    perform public.save_wedding_poll(p_event, p_poll);
    return jsonb_build_object('id', pid, 'revised', false);
  end if;
  if old.event_id <> p_event then raise exception 'Poll belongs to another wedding'; end if;
  if old.archived then
    select * into replacement from public.wedding_polls where replaces_poll_id = pid and event_id = p_event;
    -- A lost response may retry the same completed replacement. Never create
    -- another question or overwrite a newer edit by another host.
    if found and p_allow_revision and not replacement.archived
      and replacement.category = p_poll->>'category' and replacement.kind = p_poll->>'kind'
      and replacement.question = btrim(p_poll->>'question') and replacement.options = p_poll->'options'
      and replacement.photo_ids = photos and replacement.status = p_poll->>'status'
      and replacement.starts_at is not distinct from (p_poll->>'startsAt')::timestamptz
      and replacement.closes_at is not distinct from (p_poll->>'closesAt')::timestamptz
      and replacement.reveal_at is not distinct from (p_poll->>'revealAt')::timestamptz
      and replacement.results = p_poll->>'results' and replacement.pinned = coalesce((p_poll->>'pinned')::boolean, false)
      and replacement.provisional = coalesce((p_poll->>'provisional')::boolean, false)
      and (select a.correct from public.wedding_poll_answers a where a.poll_id = replacement.id) is not distinct from correct
      and (select a.couple_answers from public.wedding_poll_answers a where a.poll_id = replacement.id) is not distinct from secrets
    then return jsonb_build_object('id', replacement.id, 'revised', true); end if;
    raise exception 'This question has already been updated. Refresh the list and edit its latest version';
  end if;
  select a.correct, a.couple_answers into old_correct, old_secrets from public.wedding_poll_answers a where a.poll_id = pid;
  changed := old.question is distinct from btrim(p_poll->>'question') or old.options is distinct from p_poll->'options'
    or old.category is distinct from p_poll->>'category' or old.kind is distinct from p_poll->>'kind'
    or old.photo_ids is distinct from photos or old_correct is distinct from correct or old_secrets is distinct from secrets;
  if changed and exists (select 1 from public.wedding_poll_votes where poll_id = pid) then
    if not coalesce(p_allow_revision, false) then
      raise exception 'Guests have already voted. Save these edits as a new voting round to keep their earlier answers intact';
    end if;
    new_id := gen_random_uuid();
    -- Reuse all existing validation. A failure rolls back the replacement and
    -- leaves the original question and its ballots untouched.
    perform public.save_wedding_poll(p_event, jsonb_set(p_poll, '{id}', to_jsonb(new_id::text)));
    update public.wedding_polls set replaces_poll_id = pid, question_order = old.question_order where id = new_id;
    update public.wedding_polls set archived = true, status = 'draft', pinned = false where id = pid;
    return jsonb_build_object('id', new_id, 'revised', true);
  end if;
  perform public.save_wedding_poll(p_event, p_poll);
  return jsonb_build_object('id', pid, 'revised', false);
end $$;
revoke all on function public.edit_wedding_poll(uuid, jsonb, boolean) from public, anon;
grant execute on function public.edit_wedding_poll(uuid, jsonb, boolean) to authenticated;

commit;
