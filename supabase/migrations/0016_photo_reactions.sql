begin;

-- Keep existing blessings and one reaction per account per individual image.
alter table public.akshate add column reaction text not null default 'akshate'
  check (reaction in ('akshate', 'love', 'wow', 'celebrate'));

create policy akshate_own_update on public.akshate for update to authenticated
  using (user_id = auth.uid() and exists (
    select 1 from public.photos p where p.id = photo_id and (public.is_photo_guest(p.event_id) or public.is_host(p.event_id))
  )) with check (user_id = auth.uid() and exists (
    select 1 from public.photos p where p.id = photo_id and (public.is_photo_guest(p.event_id) or public.is_host(p.event_id))
  ));
grant select, insert, update, delete on public.akshate to authenticated;

-- Invoker rights preserve photo visibility, invitation and Google-access RLS.
-- An explicit desired state makes retries safe, unlike read-then-toggle.
create function public.set_photo_reaction(p_photo uuid, p_reaction text) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare wedding uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to react to photos'; end if;
  if p_reaction is not null and p_reaction not in ('akshate', 'love', 'wow', 'celebrate') then raise exception 'Choose a valid reaction'; end if;
  select event_id into wedding from public.photos where id = p_photo;
  if wedding is null or not public.can_access_social_content(wedding) or
    not (public.is_photo_guest(wedding) or public.is_host(wedding)) then raise exception 'Photo is unavailable'; end if;
  if p_reaction is null then
    delete from public.akshate where photo_id = p_photo and user_id = auth.uid();
  else
    insert into public.akshate (photo_id, user_id, reaction) values (p_photo, auth.uid(), p_reaction)
      on conflict (photo_id, user_id) do update set reaction = excluded.reaction;
  end if;
end $$;
revoke all on function public.set_photo_reaction(uuid, text) from public, anon;
grant execute on function public.set_photo_reaction(uuid, text) to authenticated;

-- Aggregate before REST pagination. Do not disclose other guests' account IDs.
create function public.photo_reaction_summary(p_photos uuid[]) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sign in to view reactions'; end if;
  if coalesce(cardinality(p_photos), 0) > 500 then raise exception 'Request up to 500 photos'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('photoId', photo_id, 'counts', counts, 'mine', mine) order by photo_id), '[]'::jsonb) from (
    select p.id as photo_id, jsonb_build_object(
      'akshate', count(a.user_id) filter (where a.reaction = 'akshate'),
      'love', count(a.user_id) filter (where a.reaction = 'love'),
      'wow', count(a.user_id) filter (where a.reaction = 'wow'),
      'celebrate', count(a.user_id) filter (where a.reaction = 'celebrate')
    ) as counts, max(a.reaction) filter (where a.user_id = auth.uid()) as mine
    from public.photos p left join public.akshate a on a.photo_id = p.id
    where p.id = any(p_photos) and public.can_access_social_content(p.event_id) group by p.id
  ) summary);
end $$;
revoke all on function public.photo_reaction_summary(uuid[]) from public, anon;
grant execute on function public.photo_reaction_summary(uuid[]) to authenticated;

commit;
