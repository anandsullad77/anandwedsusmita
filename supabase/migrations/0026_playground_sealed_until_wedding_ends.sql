-- Playground answers stay editable until the wedding day ends (midnight, India time).
-- Everyone's results, quiz answers and predictions are sealed for guests until
-- 8:00 AM the next morning. Hosts keep seeing live totals in the admin view.

create or replace function public.wedding_playground_schedule(p_event uuid)
returns table(closes_at timestamptz, reveal_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select d.closes_at, d.closes_at + interval '8 hours'
  from public.events e
  cross join lateral (select (((e.starts_at at time zone 'Asia/Kolkata')::date + 1)::timestamp at time zone 'Asia/Kolkata') as closes_at) d
  where e.id = p_event
$$;
revoke all on function public.wedding_playground_schedule(uuid) from public, anon, authenticated;

create or replace function public.vote_wedding_poll(p_poll uuid, p_answer text[]) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.wedding_polls;
begin
  select * into p from public.wedding_polls where id = p_poll for update;
  if not found then raise exception 'Poll not found'; end if;
  if not public.can_use_wedding_playground(p.event_id) then raise exception 'Sign in and open this invitation first'; end if;
  if not public.general_section_enabled(p.event_id,'playground') or p.status <> 'open' or p.provisional
    or p.starts_at > now() or p.closes_at <= now() then raise exception 'Voting is not open for this poll'; end if;
  if now() >= (select s.closes_at from public.wedding_playground_schedule(p.event_id) s) then raise exception 'Voting has closed for the wedding'; end if;
  if p_answer is null or cardinality(p_answer) < 1 or cardinality(p_answer) > 6 or array_position(p_answer,null) is not null then raise exception 'Choose an answer'; end if;
  if p.kind <> 'multiple' and cardinality(p_answer) <> 1 then raise exception 'Choose one answer'; end if;
  if p.kind = 'text' then
    if char_length(btrim(p_answer[1])) not between 1 and 30 or btrim(p_answer[1]) ~ '\s' then raise exception 'Share one word, up to 30 characters'; end if;
    p_answer := array[lower(btrim(p_answer[1]))];
  elsif exists(select 1 from unnest(p_answer) x where not x = any(array(select generate_series(0,jsonb_array_length(p.options)-1)::text)))
    or (select count(distinct x) from unnest(p_answer) x) <> cardinality(p_answer) then raise exception 'Choose valid, different options'; end if;
  insert into public.wedding_poll_votes(poll_id,user_id,answer,approved) values(p_poll,auth.uid(),p_answer,p.kind <> 'text')
    on conflict(poll_id,user_id) do update set answer=excluded.answer,approved=excluded.approved,updated_at=now();
end $$;

create or replace function public.wedding_playground(p_event uuid, p_admin boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare polls jsonb; teams jsonb; sched record;
begin
  if not public.can_use_wedding_playground(p_event) then raise exception 'Sign in and open this invitation first'; end if;
  if p_admin and not public.is_host(p_event) then raise exception 'Only hosts can manage polls'; end if;
  if not p_admin and not public.general_section_enabled(p_event,'playground') then
    return jsonb_build_object('polls','[]'::jsonb,'teams','[]'::jsonb,'myTeam',null,'stats',jsonb_build_object('votes',0,'voters',0,'completed',0),'pendingWords','[]'::jsonb);
  end if;
  select * into sched from public.wedding_playground_schedule(p_event);
  with visible as (
    select p.*, v.answer as mine,
      (p.status='closed' or p.closes_at <= now() or now() >= sched.closes_at) as closed,
      (now() >= sched.reveal_at) as revealed
    from public.wedding_polls p left join public.wedding_poll_votes v on v.poll_id=p.id and v.user_id=auth.uid()
    where p.event_id=p_event and not p.archived and (p_admin or (p.status <> 'draft' and not p.provisional and (p.starts_at is null or p.starts_at <= now())))
  ) select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'category',p.category,'kind',p.kind,'question',p.question,'options',p.options,'photoIds',p.photo_ids,
    'photoPaths',case when public.general_section_enabled(p_event,'photos') then
      (select jsonb_agg((select ph.storage_path from public.photos ph where ph.id=x.id and ph.event_id=p_event and not ph.hidden) order by x.n) from unnest(p.photo_ids) with ordinality x(id,n)) else '[]'::jsonb end,
    'status',case when not p_admin and p.closed then 'closed' else p.status end,'startsAt',p.starts_at,'closesAt',p.closes_at,'revealAt',p.reveal_at,
    'results',p.results,'pinned',p.pinned,'provisional',p.provisional,'mine',p.mine,
    'total',case when p_admin or p.revealed
      then (select count(*) from public.wedding_poll_votes v where v.poll_id=p.id and v.approved) else null end,
    'counts',case when p_admin or p.revealed
      then (select coalesce(jsonb_agg((select count(*) from public.wedding_poll_votes v where v.poll_id=p.id and v.approved and i::text=any(v.answer)) order by i),'[]'::jsonb) from generate_series(0,jsonb_array_length(p.options)-1) i) else null end,
    'correct',case when p_admin or p.revealed then a.correct else null end,
    'coupleAnswers',case when p_admin or p.revealed then to_jsonb(a.couple_answers) else null end,
    'words',case when p_admin or p.revealed then
      (select coalesce(jsonb_agg(jsonb_build_object('word',w.word,'count',w.n) order by w.n desc,w.word),'[]'::jsonb) from (
        select v.answer[1] as word,count(*) as n from public.wedding_poll_votes v where v.poll_id=p.id and v.approved and p.kind='text' group by v.answer[1] order by count(*) desc,v.answer[1] limit 60) w) else '[]'::jsonb end
  ) order by p.question_order,p.pinned desc,p.created_at,p.id),'[]'::jsonb) into polls from visible p left join public.wedding_poll_answers a on a.poll_id=p.id;

  with points as (
    select t.team,t.user_id,
      (select count(*)*5 from public.wedding_poll_votes v join public.wedding_polls p on p.id=v.poll_id where p.event_id=p_event and not p.archived and p.status<>'draft' and v.user_id=t.user_id and v.approved)
      + (select count(distinct coalesce(ph.post_id,ph.id))*10 from public.photos ph where ph.event_id=p_event and ph.uploaded_by=t.user_id and not ph.hidden)
      + (select count(*)*15 from public.guestbook_messages w where w.event_id=p_event and w.user_id=t.user_id and w.status='approved')
      + (select count(distinct ph.quest_id)*25 from public.photos ph where ph.event_id=p_event and ph.uploaded_by=t.user_id and not ph.hidden and ph.quest_id is not null)
      + (select count(*)*20 from public.wedding_poll_votes v join public.wedding_polls p on p.id=v.poll_id join public.wedding_poll_answers a on a.poll_id=p.id
        where p.event_id=p_event and not p.archived and p.category='quiz' and v.user_id=t.user_id and v.answer=array[a.correct::text]
          and now() >= sched.reveal_at) as score
    from public.wedding_teams t where t.event_id=p_event
  ) select jsonb_agg(jsonb_build_object('id',team,'members',members,'points',score) order by team) into teams from (
    select x.team,count(p.user_id) as members,coalesce(sum(p.score),0) as score from (values ('a'),('b'),('both')) x(team)
      left join points p on p.team=x.team group by x.team
  ) s;
  return jsonb_build_object('polls',polls,'teams',teams,
    'schedule',jsonb_build_object('closesAt',sched.closes_at,'revealAt',sched.reveal_at),
    'players',(select count(distinct v.user_id) from public.wedding_poll_votes v join public.wedding_polls p on p.id=v.poll_id
      where p.event_id=p_event and not p.archived and p.status<>'draft' and v.approved),'myTeam',(select team from public.wedding_teams where event_id=p_event and user_id=auth.uid()),
    'stats',case when p_admin then (select jsonb_build_object('votes',count(*),'voters',count(distinct v.user_id),'completed',count(distinct p.id))
      from public.wedding_poll_votes v join public.wedding_polls p on p.id=v.poll_id where p.event_id=p_event and not p.archived) else jsonb_build_object('votes',0,'voters',0,'completed',0) end,
    'pendingWords',case when p_admin then (select coalesce(jsonb_agg(jsonb_build_object('pollId',p.id,'userId',v.user_id,'question',p.question,'word',v.answer[1])),'[]'::jsonb)
      from public.wedding_poll_votes v join public.wedding_polls p on p.id=v.poll_id where p.event_id=p_event and not p.archived and p.kind='text' and not v.approved) else '[]'::jsonb end);
end $$;
