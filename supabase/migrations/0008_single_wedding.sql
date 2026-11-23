begin;

-- The public wedding website links directly to its album and guestbook. Keep
-- family records behind the existing personal invitations / wedding PIN.
create or replace function public.open_wedding_invite(p_name text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare wedding uuid; invitation_token text; bundle jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into wedding from public.events where slug = 'anand-susmita';
  if wedding is null then return null; end if;
  insert into public.general_invites (event_id) values (wedding)
    on conflict (event_id) do nothing;
  select token::text into invitation_token from public.general_invites where event_id = wedding;
  bundle := public.open_general_invite(invitation_token, p_name);
  return jsonb_build_object('token', invitation_token, 'bundle', bundle);
end $$;

revoke all on function public.open_wedding_invite(text) from public, anon;
grant execute on function public.open_wedding_invite(text) to authenticated;

-- Supabase may install pgcrypto in the extensions schema instead of public.
alter function public.check_pin(text, text) set search_path = public, extensions, pg_temp;
alter function public.set_event_pin(uuid, text) set search_path = public, extensions, pg_temp;

-- Host removal must delete the uploaded file as well as its database row.
create policy photos_host_delete_files on storage.objects for delete to authenticated using (
  bucket_id = 'photos' and public.is_host((storage.foldername(name))[1]::uuid)
);

commit;
