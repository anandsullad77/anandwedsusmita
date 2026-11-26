begin;

-- Once a host returns a reported image to the feed, that image cannot be
-- reported again. Other images in the same post keep their reporting controls.
alter table public.photos add column if not exists report_locked boolean not null default false;
update public.photos p set report_locked = true
  where status = 'approved' and not hidden and exists (
    select 1 from public.photo_flags f where f.photo_id = p.id and f.resolved_at is not null
  );

create or replace function public.initialize_photo_report_lock() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.report_locked := false;
  return new;
end $$;
revoke all on function public.initialize_photo_report_lock() from public, anon, authenticated;
drop trigger if exists initialize_photo_report_lock on public.photos;
create trigger initialize_photo_report_lock before insert on public.photos
  for each row execute function public.initialize_photo_report_lock();

do $migration$
begin
  if to_regprocedure('public.review_wedding_posts_before_report_lock(uuid,jsonb,text)') is null then
    alter function public.review_wedding_posts(uuid, jsonb, text) rename to review_wedding_posts_before_report_lock;
  end if;
end $migration$;
revoke all on function public.review_wedding_posts_before_report_lock(uuid, jsonb, text) from public, anon, authenticated;
create or replace function public.review_wedding_posts(p_event uuid, p_posts jsonb, p_action text) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare affected int;
begin
  -- Existing authorization, validation, post locks and atomic bulk decisions.
  affected := public.review_wedding_posts_before_report_lock(p_event, p_posts, p_action);
  if p_action = 'approve' then
    update public.photos p set report_locked = true where p.event_id = p_event and exists (
      select 1 from jsonb_to_recordset(p_posts) as post(id uuid, kind text)
      where post.kind = 'photo' and post.id = coalesce(p.post_id, p.id)
    ) and exists (select 1 from public.photo_flags f where f.photo_id = p.id);
  end if;
  return affected;
end $$;
revoke all on function public.review_wedding_posts(uuid, jsonb, text) from public, anon;
grant execute on function public.review_wedding_posts(uuid, jsonb, text) to authenticated;

create or replace function public.flag_photo(p_photo uuid, p_reason text, p_removal boolean default false)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare wedding uuid; post_key uuid; locked boolean;
begin
  select event_id, coalesce(post_id, id) into wedding, post_key from public.photos
    where id = p_photo and status = 'approved' and not hidden;
  if wedding is not null and not public.can_access_social_content(wedding) then
    raise exception 'Sign in with Google to interact with photos'; end if;
  if wedding is null or not (public.is_photo_guest(wedding) or public.is_host(wedding)) then
    raise exception 'Photo is unavailable'; end if;

  -- Serialize with host decisions so a delayed report cannot reopen approval.
  perform pg_advisory_xact_lock(hashtextextended(post_key::text, 0));
  select report_locked into locked from public.photos
    where id = p_photo and event_id = wedding and status = 'approved' and not hidden;
  if not found then raise exception 'Photo is unavailable'; end if;
  if locked then raise exception 'This photo has already been reviewed by the hosts and cannot be reported again'; end if;
  if char_length(coalesce(p_reason, '')) > 1000 then raise exception 'Keep the report under 1,000 characters'; end if;
  insert into public.photo_flags (photo_id, user_id, reason, is_removal_request)
    values (p_photo, auth.uid(), nullif(btrim(p_reason), ''), coalesce(p_removal, false))
    on conflict (photo_id, user_id) do update set reason = excluded.reason,
      is_removal_request = case when photo_flags.resolved_at is not null then excluded.is_removal_request
        else photo_flags.is_removal_request or excluded.is_removal_request end,
      created_at = now(), resolved_at = null, resolved_by = null;
end $$;

commit;
