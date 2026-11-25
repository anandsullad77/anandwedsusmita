-- Run after migrations 0001 through 0008. Edit these three values first.
-- Create confirmed host accounts with passwords in Supabase Auth before running.
-- Rerunning updates this wedding and adds hosts; it does not remove families,
-- photos, wishes, existing invite tokens, or existing host memberships.
begin;
set local search_path = public, extensions, pg_temp;
do $$
declare
  host_emails text[] := array['REPLACE_WITH_HOST_EMAIL'];
  wedding_pin text := 'CHANGE_ME';
  host_whatsapp text := 'REPLACE_WITH_COUNTRY_CODE_AND_NUMBER';
  wedding_id uuid;
  host_email text;
begin
  if wedding_pin !~ '^[0-9]{6}$' then
    raise exception 'Set wedding_pin to your chosen six-digit PIN before running.';
  end if;
  if host_whatsapp !~ '^[1-9][0-9]{7,14}$' then
    raise exception 'Set host_whatsapp to the full number with country code, digits only.';
  end if;
  if coalesce(array_length(host_emails, 1), 0) = 0 then
    raise exception 'Add at least one host email.';
  end if;
  foreach host_email in array host_emails loop
    if not exists (select 1 from auth.users where lower(email) = lower(btrim(host_email))) then
      raise exception 'Create the confirmed host user % in Authentication > Users first.', host_email;
    end if;
  end loop;

  insert into public.events (slug, title, couple_a, couple_b, starts_at, venue, map_url,
                            pin_hash, host_whatsapp, theme, album_closes_at, guest_data_purge_at)
  values ('anand-susmita', 'Anand & Susmita''s wedding', 'Anand', 'Susmita',
          '2026-11-29 12:28:00+05:30',
          'Shri Shakambari Mangal Karyalaya, Hosakeri Galli, Sulebhavi, Belagavi',
          'https://maps.app.goo.gl/CzVGfb7yyeYVoxam6',
          crypt(wedding_pin, gen_salt('bf')), host_whatsapp,
          jsonb_build_object('primary', '#A53051', 'deep', '#283A2D', 'paper', '#FFF7EB',
            'card', '#F9F0E0', 'ink', '#2A2320', 'muted', '#6B5E57',
            'monogram', '/images/as-monogram.svg', 'portrait', '/images/wedding-couple-pink-green.png',
            'place', 'Sulebhavi', 'travelPoints', jsonb_build_object(
              'train', 'Belagavi Railway Station', 'bus', 'Belagavi CBT bus stand',
              'car', 'Driving straight to Sulebhavi', 'flight', 'Belagavi Airport (Sambra)')),
          '2026-11-29 12:28:00+05:30'::timestamptz + interval '90 days',
          '2026-11-29 12:28:00+05:30'::timestamptz + interval '30 days')
  on conflict (slug) do update set
    title = excluded.title, couple_a = excluded.couple_a, couple_b = excluded.couple_b,
    starts_at = excluded.starts_at, venue = excluded.venue, map_url = excluded.map_url,
    pin_hash = excluded.pin_hash, host_whatsapp = excluded.host_whatsapp, theme = excluded.theme
  returning id into wedding_id;

  if not exists (select 1 from public.event_functions where event_id = wedding_id) then
    insert into public.event_functions (event_id, name_en, name_kn, starts_at, venue, sort)
      values (wedding_id, 'Muhurta & Akshate', 'ಮುಹೂರ್ತ', '2026-11-29 12:28:00+05:30',
              'Shri Shakambari Mangal Karyalaya, Sulebhavi', 0);
  end if;

  insert into public.event_secrets (event_id, pin) values (wedding_id, wedding_pin)
    on conflict (event_id) do update set pin = excluded.pin;
  insert into public.general_invites (event_id) values (wedding_id)
    on conflict (event_id) do nothing;
  insert into public.general_invitation_settings (event_id) values (wedding_id)
    on conflict (event_id) do nothing;
  insert into public.hosts (event_id, user_id, role, display_name)
    select wedding_id, u.id, 'owner', u.email from auth.users u
    where lower(u.email) in (select lower(btrim(value)) from unnest(host_emails) as value)
    on conflict (event_id, user_id) do nothing;
  if to_regprocedure('public.seed_wedding_playground(uuid)') is not null then
    perform public.seed_wedding_playground(wedding_id);
  end if;
end $$;
commit;
