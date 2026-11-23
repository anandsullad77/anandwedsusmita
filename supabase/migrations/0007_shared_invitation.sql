begin;

-- Family devices use the same invitation settings, cover and moderated guestbook as general visitors.
-- is_guest still requires a linked family device; general visitors do not gain family access.
alter policy invitation_settings_read on public.general_invitation_settings
  using (is_host(event_id) or is_photo_guest(event_id));

alter policy wishes_read on public.guestbook_messages using (
  is_host(event_id) or (status = 'approved' and general_section_enabled(event_id, 'guestbook') and is_photo_guest(event_id))
);

alter policy invitation_cover_read on storage.objects using (
  bucket_id = 'invitation-covers' and (
    is_host((storage.foldername(name))[1]::uuid) or is_photo_guest((storage.foldername(name))[1]::uuid)
  )
);

-- Accept either an opened general token or the token belonging to this device's family.
create or replace function public.submit_guestbook_wish(p_token text, p_name text, p_message text, p_request uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare ev uuid;
begin
  if auth.uid() is null then raise exception 'Open the invitation before leaving a wish'; end if;
  select g.event_id into ev from general_invites g join event_visitors v on v.event_id = g.event_id
    where g.token::text = p_token and v.user_id = auth.uid();
  if ev is null then
    select h.event_id into ev from households h join devices d on d.household_id = h.id and d.event_id = h.event_id
      where h.token = p_token and d.user_id = auth.uid();
  end if;
  if ev is null then raise exception 'Open your invitation before leaving a wish'; end if;
  if not general_section_enabled(ev, 'guestbook') then raise exception 'The guestbook is currently closed'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'Enter a name between 1 and 80 characters'; end if;
  if p_message is null or char_length(btrim(p_message)) not between 1 and 1000 then raise exception 'Enter a wish between 1 and 1,000 characters'; end if;
  if p_request is null then raise exception 'Missing submission identifier'; end if;
  perform pg_advisory_xact_lock(hashtextextended(ev::text || auth.uid()::text, 0));
  if exists(select 1 from guestbook_messages where event_id = ev and user_id = auth.uid() and request_id = p_request) then return; end if;
  if exists(select 1 from guestbook_messages where event_id = ev and user_id = auth.uid() and created_at > now() - interval '30 seconds') then
    raise exception 'Please wait 30 seconds before sending another wish';
  end if;
  if (select count(*) from guestbook_messages where event_id = ev and user_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You can leave up to 10 wishes per day';
  end if;
  insert into guestbook_messages (event_id, user_id, request_id, name, message, status)
    values (ev, auth.uid(), p_request, btrim(p_name), btrim(p_message), 'pending');
end $$;

revoke all on function public.submit_guestbook_wish(text, text, text, uuid) from public, anon;
grant execute on function public.submit_guestbook_wish(text, text, text, uuid) to authenticated;

commit;
