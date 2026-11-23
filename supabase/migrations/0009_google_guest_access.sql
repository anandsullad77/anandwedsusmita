begin;

-- Existing invitation, venue, cover, updates and family RSVP access stay public
-- to invitation visitors. For this wedding only, media and wishes require a
-- server-verified Google identity, or the existing host account.
create or replace function public.can_access_social_content(p_event uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select e.slug <> 'anand-susmita' or public.is_host(e.id) or exists (
    select 1 from auth.identities i where i.user_id = auth.uid() and i.provider = 'google'
  ) from public.events e where e.id = p_event), false);
$$;
revoke all on function public.can_access_social_content(uuid) from public, anon;
grant execute on function public.can_access_social_content(uuid) to authenticated;

-- Restrictive policies are ANDed with the existing visitor/family permissions.
-- A Google login alone does not bypass invitation, event or moderation checks.
create policy social_photos_read on public.photos as restrictive for select to authenticated
  using (public.can_access_social_content(event_id));
create policy social_photos_insert on public.photos as restrictive for insert to authenticated
  with check (public.can_access_social_content(event_id));
create policy social_wishes_read on public.guestbook_messages as restrictive for select to authenticated
  using (public.can_access_social_content(event_id));

create policy social_storage_read on storage.objects as restrictive for select to authenticated using (
  case when bucket_id = 'photos' then public.can_access_social_content((storage.foldername(name))[1]::uuid) else true end
);
create policy social_storage_upload on storage.objects as restrictive for insert to authenticated with check (
  case when bucket_id = 'photos' then public.can_access_social_content((storage.foldername(name))[1]::uuid) else true end
);

-- Security-definer RPCs bypass RLS, so wrap them with the same Google check.
-- Keep their existing validation, invitation checks, rate limits and moderation.
alter function public.submit_guestbook_wish(text, text, text, uuid) rename to submit_guestbook_wish_before_google;
revoke all on function public.submit_guestbook_wish_before_google(text, text, text, uuid) from public, anon, authenticated;
create function public.submit_guestbook_wish(p_token text, p_name text, p_message text, p_request uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare wedding uuid;
begin
  select event_id into wedding from public.general_invites where token::text = p_token;
  if wedding is null then select event_id into wedding from public.households where token = p_token; end if;
  if wedding is not null and not public.can_access_social_content(wedding) then
    raise exception 'Sign in with Google to leave a wish';
  end if;
  perform public.submit_guestbook_wish_before_google(p_token, p_name, p_message, p_request);
end $$;
revoke all on function public.submit_guestbook_wish(text, text, text, uuid) from public, anon;
grant execute on function public.submit_guestbook_wish(text, text, text, uuid) to authenticated;

alter function public.flag_photo(uuid, text, boolean) rename to flag_photo_before_google;
revoke all on function public.flag_photo_before_google(uuid, text, boolean) from public, anon, authenticated;
create function public.flag_photo(p_photo uuid, p_reason text, p_removal boolean default false)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare wedding uuid;
begin
  select event_id into wedding from public.photos where id = p_photo;
  if wedding is not null and not public.can_access_social_content(wedding) then
    raise exception 'Sign in with Google to interact with photos';
  end if;
  perform public.flag_photo_before_google(p_photo, p_reason, p_removal);
end $$;
revoke all on function public.flag_photo(uuid, text, boolean) from public, anon;
grant execute on function public.flag_photo(uuid, text, boolean) to authenticated;

alter function public.photo_quest_summary(uuid) rename to photo_quest_summary_before_google;
revoke all on function public.photo_quest_summary_before_google(uuid) from public, anon, authenticated;
create function public.photo_quest_summary(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.can_access_social_content(p_event) then raise exception 'Sign in with Google to view photo collections'; end if;
  return public.photo_quest_summary_before_google(p_event);
end $$;
revoke all on function public.photo_quest_summary(uuid) from public, anon;
grant execute on function public.photo_quest_summary(uuid) to authenticated;

commit;
