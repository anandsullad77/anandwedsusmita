begin;

-- A quest is independent of the existing moment label and survives queued uploads.
alter table public.photos add column quest_id text check (quest_id is null or quest_id in (
  'proud-moment','generations-together','reunited','hug-to-remember','behind-celebration','for-the-couple',
  'dance-floor-hero','outfit-twins','big-selfie','then-and-now','little-scene-stealer','sweet-tooth'
));
create index photos_event_quest on public.photos (event_id, quest_id, created_at desc) where quest_id is not null;

update public.general_invitation_settings set sections = '{"quests":true}'::jsonb || sections;
alter table public.general_invitation_settings alter column sections set default
  '{"cover":true,"schedule":true,"photos":true,"uploads":true,"updates":true,"guestbook":true,"download":true,"quests":true}'::jsonb;

-- Older clients may still send seven section keys. Preserve that contract.
create or replace function public.save_general_invitation_settings(p_event uuid, p_welcome text, p_cover text, p_sections jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare k text; sections jsonb;
begin
  if not is_host(p_event) then raise exception 'Only hosts can customize the invitation'; end if;
  if p_welcome is null or char_length(btrim(p_welcome)) not between 1 and 500 then raise exception 'The welcome message must contain 1–500 characters'; end if;
  if jsonb_typeof(p_sections) is distinct from 'object' then raise exception 'Invalid section visibility'; end if;
  sections := jsonb_build_object('quests', general_section_enabled(p_event, 'quests')) || p_sections;
  if (select count(*) from jsonb_object_keys(sections)) <> 8 then raise exception 'Invalid section visibility'; end if;
  foreach k in array array['cover','schedule','photos','uploads','updates','guestbook','download','quests'] loop
    if jsonb_typeof(sections->k) is distinct from 'boolean' then raise exception 'Invalid visibility for %', k; end if;
  end loop;
  if p_cover is not null then
    if p_cover !~ ('^' || p_event::text || '/[0-9a-f-]{36}\.(webp|png|jpg)$') then raise exception 'Invalid cover photo'; end if;
    if not exists(select 1 from storage.objects where bucket_id = 'invitation-covers' and name = p_cover) then raise exception 'Upload the cover photo before saving'; end if;
  end if;
  insert into general_invitation_settings (event_id, welcome_message, cover_path, sections)
    values (p_event, btrim(p_welcome), p_cover, sections)
    on conflict (event_id) do update set welcome_message = excluded.welcome_message, cover_path = excluded.cover_path, sections = excluded.sections;
end $$;

-- Aggregate before the feed's 200-photo limit. Never include hidden photos or
-- another visitor's private contribution history in the response.
create or replace function public.photo_quest_summary(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare pid uuid; result jsonb;
begin
  if auth.uid() is null or (not is_photo_guest(p_event) and not is_host(p_event)) then raise exception 'Not a guest of this wedding'; end if;
  select person_id into pid from devices where event_id = p_event and user_id = auth.uid();
  select jsonb_build_object(
    'contributions', count(*) filter (where uploaded_by = auth.uid() or (uploaded_by is null and person_id = pid)),
    'completedQuestIds', coalesce(jsonb_agg(distinct quest_id) filter (where quest_id is not null and (uploaded_by = auth.uid() or (uploaded_by is null and person_id = pid))), '[]'::jsonb),
    'counts', coalesce((select jsonb_object_agg(quest_id, n) from (
      select quest_id, count(*) as n from photos where event_id = p_event and not hidden and quest_id is not null group by quest_id
    ) counts), '{}'::jsonb)
  ) into result from photos where event_id = p_event and not hidden;
  return result;
end $$;

revoke all on function public.photo_quest_summary(uuid) from public, anon;
grant execute on function public.photo_quest_summary(uuid) to authenticated;
revoke all on function public.save_general_invitation_settings(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_general_invitation_settings(uuid, text, text, jsonb) to authenticated;

commit;
