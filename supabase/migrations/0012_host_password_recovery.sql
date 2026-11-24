-- Recovery email eligibility is private. Only the Edge Function's server key
-- can look up host emails; anonymous and signed-in guests cannot enumerate them.
create or replace function public.host_password_reset_email(p_email text)
returns text
language sql stable security definer
set search_path = ''
as $$
  select u.email
  from auth.users u
  join public.hosts h on h.user_id = u.id
  join public.events e on e.id = h.event_id
  where lower(u.email) = lower(btrim(p_email))
    and e.slug = 'anand-susmita'
    and h.role in ('owner', 'cohost', 'planner', 'photographer')
  limit 1;
$$;

revoke all on function public.host_password_reset_email(text) from public, anon, authenticated;
grant execute on function public.host_password_reset_email(text) to service_role;
