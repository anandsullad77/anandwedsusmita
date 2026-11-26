begin;

-- Explicit ordering keeps the couple's supplied question sequence stable.
alter table public.wedding_polls add column if not exists question_order integer not null default 0;
alter table public.wedding_polls add column if not exists archived boolean not null default false;

create or replace function public.seed_wedding_duel_questions(p_event uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  e public.events;
  q text;
  pid uuid;
  question_position integer := 0;
  keep_ids uuid[] := '{}';
begin
  select * into e from public.events where id=p_event and slug='anand-susmita';
  if not found then return; end if;

  foreach q in array array[
    'Who is more likely to plan a trekking adventure?',
    'Who is more likely to have peanuts in their bag?',
    'Who would experiment with chocolate inside a roti for breakfast?',
    'Who would travel across the city just for Naturals ice cream?',
    'Who would turn a random question into a full research project?',
    'Who would turn a small disagreement into a courtroom drama?',
    'Who would travel to Antarctica just to meet a penguin?',
    'Who would call a six-hour trek a relaxing weekend?',
    'Who would choose a holiday destination based on its local food?',
    'Who would plan the next vacation before returning from the current one?',
    'Who would create an Excel sheet to settle a household argument?',
    'Who would randomly start discussing their retirement plans at midnight?'
  ] loop
    question_position := question_position + 1;
    select id into pid from public.wedding_polls
      where event_id=e.id and category='duel' and kind='single' and question=q
        and options=jsonb_build_array(e.couple_a,e.couple_b)
      order by created_at,id limit 1;
    if not found then
      insert into public.wedding_polls(event_id,category,question,options,status,question_order)
        values(e.id,'duel',q,jsonb_build_array(e.couple_a,e.couple_b),'open',question_position)
        returning id into pid;
    else
      update public.wedding_polls set question_order=question_position,archived=false where id=pid;
    end if;
    keep_ids := array_append(keep_ids,pid);
  end loop;

  -- Archive replaced questions without relabelling or deleting their votes.
  update public.wedding_polls set status='draft',pinned=false,archived=true
    where event_id=e.id and category='duel' and not (id=any(keep_ids));
end $$;
revoke all on function public.seed_wedding_duel_questions(uuid) from public,anon,authenticated;

create or replace function public.seed_wedding_playground(p_event uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.events; q text; pid uuid; entry jsonb;
begin
  select * into e from public.events where id=p_event and slug='anand-susmita';
  if not found or exists(select 1 from public.wedding_polls where event_id=p_event) then return; end if;
    perform public.seed_wedding_duel_questions(e.id);
    for entry in select * from jsonb_array_elements('[{"q":"Where will our first international trip be?","o":["Maldives","Switzerland","Bali","Dubai"]},{"q":"What will our weekends look like?","o":["Movie nights","Long drives","Sleeping in","Exploring new places"]},{"q":"What will be our biggest household debate?","o":["What to eat","Room temperature","Shopping expenses","Where to travel"]}]'::jsonb) loop
      insert into public.wedding_polls(event_id,category,question,options,status,results,closes_at,reveal_at)
        values(e.id,'prediction',entry->>'q',entry->'o','open','after_vote',e.starts_at + interval '1 day',e.starts_at + interval '1 year');
    end loop;
    foreach q in array array['Who initiated the first conversation?','Who takes more photographs?','Who made the first move?'] loop
      insert into public.wedding_polls(event_id,category,question,options,status,provisional) values(e.id,'quiz',q,jsonb_build_array(e.couple_a,e.couple_b),'draft',true) returning id into pid;
      insert into public.wedding_poll_answers(poll_id,correct) values(pid,0);
    end loop;
    insert into public.wedding_polls(event_id,category,question,options,status,starts_at,closes_at,results,pinned)
      values(e.id,'live','What are you enjoying the most today?','["Wedding food","Wedding ceremony","Taking photographs","Meeting friends & family"]','open',date_trunc('day',e.starts_at at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata',e.starts_at+interval '12 hours','always',true);
    insert into public.wedding_polls(event_id,category,kind,question,status,results) values(e.id,'words','text','Describe our love story in one word.','open','always');
    insert into public.wedding_polls(event_id,category,question,options,status) values(e.id,'secret','Who is more stubborn?',jsonb_build_array(e.couple_a,e.couple_b),'draft');
end $$;

create or replace function public.wedding_playground(p_event uuid, p_admin boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare polls jsonb; teams jsonb;
begin
  if not public.can_use_wedding_playground(p_event) then raise exception 'Sign in and open this invitation first'; end if;
  if p_admin and not public.is_host(p_event) then raise exception 'Only hosts can manage polls'; end if;
  if not p_admin and not public.general_section_enabled(p_event,'playground') then
    return jsonb_build_object('polls','[]'::jsonb,'teams','[]'::jsonb,'myTeam',null,'stats',jsonb_build_object('votes',0,'voters',0,'completed',0),'pendingWords','[]'::jsonb);
  end if;
  with visible as (
    select p.*, v.answer as mine,
      (p.status='closed' or p.closes_at <= now()) as closed,
      ((p.status='closed' or p.closes_at <= now()) and (p.reveal_at is null or p.reveal_at <= now())) as revealed
    from public.wedding_polls p left join public.wedding_poll_votes v on v.poll_id=p.id and v.user_id=auth.uid()
    where p.event_id=p_event and not p.archived and (p_admin or (p.status <> 'draft' and not p.provisional and (p.starts_at is null or p.starts_at <= now())))
  ) select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'category',p.category,'kind',p.kind,'question',p.question,'options',p.options,'photoIds',p.photo_ids,
    'photoPaths',case when public.general_section_enabled(p_event,'photos') then
      (select jsonb_agg((select ph.storage_path from public.photos ph where ph.id=x.id and ph.event_id=p_event and not ph.hidden) order by x.n) from unnest(p.photo_ids) with ordinality x(id,n)) else '[]'::jsonb end,
    'status',case when not p_admin and p.closed then 'closed' else p.status end,'startsAt',p.starts_at,'closesAt',p.closes_at,'revealAt',p.reveal_at,
    'results',p.results,'pinned',p.pinned,'provisional',p.provisional,'mine',p.mine,
    'total',case when p_admin or p.results='always' or (p.results='after_vote' and p.mine is not null) or (p.results='closed' and p.revealed)
      then (select count(*) from public.wedding_poll_votes v where v.poll_id=p.id and v.approved) else null end,
    'counts',case when p_admin or p.results='always' or (p.results='after_vote' and p.mine is not null) or (p.results='closed' and p.revealed)
      then (select coalesce(jsonb_agg((select count(*) from public.wedding_poll_votes v where v.poll_id=p.id and v.approved and i::text=any(v.answer)) order by i),'[]'::jsonb) from generate_series(0,jsonb_array_length(p.options)-1) i) else null end,
    'correct',case when p_admin or p.revealed then a.correct else null end,
    'coupleAnswers',case when p_admin or p.revealed then to_jsonb(a.couple_answers) else null end,
    'words',case when p_admin or p.results='always' or (p.results='after_vote' and p.mine is not null) or (p.results='closed' and p.revealed) then
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
          and (p.status='closed' or p.closes_at<=now()) and (p.reveal_at is null or p.reveal_at<=now())) as score
    from public.wedding_teams t where t.event_id=p_event
  ) select jsonb_agg(jsonb_build_object('id',team,'members',members,'points',score) order by team) into teams from (
    select x.team,count(p.user_id) as members,coalesce(sum(p.score),0) as score from (values ('a'),('b'),('both')) x(team)
      left join points p on p.team=x.team group by x.team
  ) s;
  return jsonb_build_object('polls',polls,'teams',teams,'myTeam',(select team from public.wedding_teams where event_id=p_event and user_id=auth.uid()),
    'stats',case when p_admin then (select jsonb_build_object('votes',count(*),'voters',count(distinct v.user_id),'completed',count(distinct p.id))
      from public.wedding_poll_votes v join public.wedding_polls p on p.id=v.poll_id where p.event_id=p_event and not p.archived) else jsonb_build_object('votes',0,'voters',0,'completed',0) end,
    'pendingWords',case when p_admin then (select coalesce(jsonb_agg(jsonb_build_object('pollId',p.id,'userId',v.user_id,'question',p.question,'word',v.answer[1])),'[]'::jsonb)
      from public.wedding_poll_votes v join public.wedding_polls p on p.id=v.poll_id where p.event_id=p_event and not p.archived and p.kind='text' and not v.approved) else '[]'::jsonb end);
end $$;

do $$ declare eid uuid; begin
  for eid in select id from public.events where slug='anand-susmita' loop
    perform public.seed_wedding_duel_questions(eid);
  end loop;
end $$;

commit;
