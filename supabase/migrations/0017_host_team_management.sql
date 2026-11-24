begin;

create function public.admin_host_team(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_host(p_event) then raise exception 'Only hosts can view the host team'; end if;
  return jsonb_build_object('currentUserId', auth.uid(), 'canManage', exists (
    select 1 from public.hosts where event_id = p_event and user_id = auth.uid() and role = 'owner'
  ), 'members', coalesce((select jsonb_agg(jsonb_build_object(
    'id', h.user_id, 'email', u.email, 'name', coalesce(nullif(h.display_name, ''), nullif(u.raw_user_meta_data->>'full_name', ''), 'Host'),
    'role', h.role, 'confirmed', u.email_confirmed_at is not null
  ) order by case when h.role = 'owner' then 0 else 1 end, lower(coalesce(h.display_name, u.email, '')), h.user_id)
    from public.hosts h join auth.users u on u.id = h.user_id where h.event_id = p_event), '[]'::jsonb));
end $$;
revoke all on function public.admin_host_team(uuid) from public, anon;
grant execute on function public.admin_host_team(uuid) to authenticated;

-- Only the Edge Function may call these helpers. It derives p_actor from a
-- verified Auth bearer token; no browser can pass another owner's identity.
create function public.host_team_target(p_actor uuid, p_event uuid, p_email text default null, p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.hosts h join public.events e on e.id = h.event_id
    where h.event_id = p_event and h.user_id = p_actor and h.role = 'owner' and e.slug = 'anand-susmita')
    then raise exception 'Only owners can manage the host team'; end if;
  return (select jsonb_build_object('id', u.id, 'email', u.email, 'confirmed', u.email_confirmed_at is not null, 'role', h.role)
    from auth.users u left join public.hosts h on h.user_id = u.id and h.event_id = p_event
    where (p_user is not null and u.id = p_user and h.user_id is not null)
      or (p_user is null and p_email is not null and lower(u.email) = lower(btrim(p_email))) limit 1);
end $$;
revoke all on function public.host_team_target(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.host_team_target(uuid, uuid, text, uuid) to service_role;

create function public.host_team_add(p_actor uuid, p_event uuid, p_user uuid, p_role text, p_name text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare added integer;
begin
  -- Serialize invitations and recheck ownership immediately before granting.
  perform 1 from public.events where id = p_event and slug = 'anand-susmita' for update;
  if not found or not exists (select 1 from public.hosts where event_id = p_event and user_id = p_actor and role = 'owner')
    then raise exception 'Only owners can manage the host team'; end if;
  if p_role is null or p_role not in ('owner', 'cohost') then raise exception 'Choose Host or Co-owner'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 100 then raise exception 'Use a name of 1–100 characters'; end if;
  if not exists (select 1 from auth.users where id = p_user and email is not null) then raise exception 'Host account not found'; end if;
  insert into public.hosts (event_id, user_id, role, display_name) values (p_event, p_user, p_role, btrim(p_name))
    on conflict (event_id, user_id) do nothing;
  get diagnostics added = row_count;
  return added = 1;
end $$;
revoke all on function public.host_team_add(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.host_team_add(uuid, uuid, uuid, text, text) to service_role;

commit;
