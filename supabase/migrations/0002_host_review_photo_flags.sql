-- Guests can report a photo or request its removal, but only hosts moderate it.
-- Replaces the automatic hide-on-request / hide-after-two-reports behavior.
-- Existing photos_host and photos_host_delete policies keep updates/deletes host-only.
create or replace function public.flag_photo(p_photo uuid, p_reason text, p_removal boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare ev uuid;
begin
  select event_id into ev from photos where id = p_photo;
  if ev is null or (not is_guest(ev) and not is_host(ev)) then
    raise exception 'not allowed';
  end if;

  insert into photo_flags (photo_id, user_id, reason, is_removal_request)
    values (p_photo, auth.uid(), p_reason, coalesce(p_removal, false))
    on conflict (photo_id, user_id) do update
      set reason = excluded.reason,
          is_removal_request = photo_flags.is_removal_request or excluded.is_removal_request;
end $$;
