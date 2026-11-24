begin;

-- Only host-selected invitation previews are available before Google sign-in.
-- The guest photos bucket and all existing social-content policies stay private.
alter table public.general_invitation_settings add column preview_photo_paths text[] not null default '{}'
  check (cardinality(preview_photo_paths) <= 3 and array_position(preview_photo_paths, null) is null);

insert into storage.buckets (id, name, public)
  values ('invitation-previews', 'invitation-previews', false) on conflict do nothing;

create policy invitation_preview_read on storage.objects for select to authenticated using (
  bucket_id = 'invitation-previews' and (
    public.is_host((storage.foldername(name))[1]::uuid) or exists (
      select 1 from public.general_invitation_settings s
      where s.event_id::text = (storage.foldername(name))[1]
        and name = any(s.preview_photo_paths)
        and public.general_section_enabled(s.event_id, 'photos')
        and public.is_photo_guest(s.event_id)
    )
  )
);
create policy invitation_preview_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'invitation-previews' and public.is_host((storage.foldername(name))[1]::uuid)
);
create policy invitation_preview_delete on storage.objects for delete to authenticated using (
  bucket_id = 'invitation-previews' and public.is_host((storage.foldername(name))[1]::uuid)
    and not exists(select 1 from public.general_invitation_settings s where name = any(s.preview_photo_paths))
);

-- Save the entire invitation atomically; retain the original RPC for older clients.
create function public.save_general_invitation_with_previews(
  p_event uuid, p_welcome text, p_cover text, p_sections jsonb, p_preview_paths text[]
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare preview_path text;
begin
  if not public.is_host(p_event) then raise exception 'Only hosts can customize the invitation'; end if;
  if p_preview_paths is null or cardinality(p_preview_paths) > 3 then raise exception 'Choose up to three preview photos'; end if;
  if (select count(distinct path) from unnest(p_preview_paths) path) <> cardinality(p_preview_paths) then
    raise exception 'Choose different photos for each preview';
  end if;
  foreach preview_path in array p_preview_paths loop
    if preview_path is null or preview_path !~ ('^' || p_event::text || '/[0-9a-f-]{36}\.(webp|png|jpg)$') then
      raise exception 'Invalid preview photo';
    end if;
    if not exists(select 1 from storage.objects where bucket_id = 'invitation-previews' and name = preview_path) then
      raise exception 'Upload the preview photos before saving';
    end if;
  end loop;
  perform public.save_general_invitation_settings(p_event, p_welcome, p_cover, p_sections);
  update public.general_invitation_settings set preview_photo_paths = p_preview_paths where event_id = p_event;
end $$;
revoke all on function public.save_general_invitation_with_previews(uuid, text, text, jsonb, text[]) from public, anon;
grant execute on function public.save_general_invitation_with_previews(uuid, text, text, jsonb, text[]) to authenticated;

commit;
