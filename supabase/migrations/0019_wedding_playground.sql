begin;

create function public.can_use_wedding_playground(p_event uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and public.can_access_social_content(p_event)
    and (public.is_host(p_event) or public.is_photo_guest(p_event));
$$;

create table public.wedding_polls (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  category text not null check (category in ('duel','prediction','quiz','live','secret','words','photo')),
  kind text not null default 'single' check (kind in ('single','multiple','rating','text')),
  question text not null check (char_length(btrim(question)) between 1 and 240),
  options jsonb not null default '[]',
  photo_ids uuid[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','open','closed')),
  starts_at timestamptz,
  closes_at timestamptz,
  reveal_at timestamptz,
  results text not null default 'after_vote' check (results in ('after_vote','always','closed')),
  pinned boolean not null default false,
  provisional boolean not null default false,
  created_at timestamptz not null default now(),
  check (closes_at is null or starts_at is null or closes_at > starts_at),
  check (jsonb_typeof(options) = 'array' and ((kind = 'text' and jsonb_array_length(options) = 0) or (kind <> 'text' and jsonb_array_length(options) between 2 and 6)))
);
create index wedding_polls_event on public.wedding_polls(event_id,status,created_at);
create table public.wedding_poll_answers (
  poll_id uuid primary key references public.wedding_polls on delete cascade,
  correct integer,
  couple_answers text[]
);
create table public.wedding_poll_votes (
  poll_id uuid not null references public.wedding_polls on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  answer text[] not null,
  approved boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(poll_id,user_id)
);
create table public.wedding_teams (
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  team text not null check (team in ('a','b','both')),
  primary key(event_id,user_id)
);
alter table public.wedding_polls enable row level security;
alter table public.wedding_poll_answers enable row level security;
alter table public.wedding_poll_votes enable row level security;
alter table public.wedding_teams enable row level security;
-- These tables have no direct client policies or grants. Only the validated RPCs
-- below expose aggregates, the current guest's ballot and revealed answer keys.
revoke all on public.wedding_polls, public.wedding_poll_answers, public.wedding_poll_votes, public.wedding_teams from anon, authenticated;

create function public.save_wedding_poll(p_event uuid, p_poll jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare pid uuid := (p_poll->>'id')::uuid; old public.wedding_polls; opt jsonb := p_poll->'options'; correct integer := (p_poll->>'correct')::integer;
  photos uuid[] := array(select jsonb_array_elements_text(coalesce(p_poll->'photoIds','[]'))::uuid);
  secrets text[] := case when jsonb_typeof(p_poll->'coupleAnswers') = 'array' then array(select jsonb_array_elements_text(p_poll->'coupleAnswers')) else null end;
begin
  if not public.is_host(p_event) then raise exception 'Only hosts can manage polls'; end if;
  select * into old from public.wedding_polls where id = pid for update;
  if found and old.event_id <> p_event then raise exception 'Poll belongs to another wedding'; end if;
  if jsonb_typeof(opt) is distinct from 'array' then raise exception 'Add poll options'; end if;
  if exists(select 1 from jsonb_array_elements(opt) x where jsonb_typeof(x) <> 'string' or char_length(btrim(x#>>'{}')) not between 1 and 100)
    or (select count(distinct lower(btrim(x))) from jsonb_array_elements_text(opt) x) <> jsonb_array_length(opt) then raise exception 'Options must be different, with 1 to 100 characters each'; end if;
  if p_poll->>'category' in ('quiz','secret','photo','duel') and p_poll->>'kind' <> 'single' then raise exception 'Use single choice for this category'; end if;
  if (p_poll->>'category' = 'words') is distinct from (p_poll->>'kind' = 'text') then raise exception 'Words of Love uses text responses'; end if;
  if correct is not null and (correct < 0 or correct >= jsonb_array_length(opt)) then raise exception 'Choose a valid correct answer'; end if;
  if p_poll->>'status' = 'open' and coalesce((p_poll->>'provisional')::boolean,false) then raise exception 'Confirm provisional answers before publishing'; end if;
  if p_poll->>'category' = 'quiz' and p_poll->>'status' = 'open' and correct is null then raise exception 'Set the correct answer before publishing'; end if;
  if p_poll->>'category' = 'secret' and p_poll->>'status' = 'open' and (coalesce(cardinality(secrets),0) <> 2 or not secrets <@ array(select jsonb_array_elements_text(opt))) then raise exception 'Add both private answers before publishing'; end if;
  if p_poll->>'category' = 'photo' and (cardinality(photos) <> jsonb_array_length(opt) or exists (
    select 1 from unnest(photos) f where not exists(select 1 from public.photos p where p.id = f and p.event_id = p_event and not p.hidden))) then raise exception 'Choose a visible wedding photo for every option'; end if;
  if exists(select 1 from public.wedding_poll_votes where poll_id = pid) and (
    old.options is distinct from opt or old.category is distinct from p_poll->>'category' or old.kind is distinct from p_poll->>'kind'
    or old.photo_ids is distinct from photos or (select a.correct from public.wedding_poll_answers a where a.poll_id = pid) is distinct from correct
    or (select a.couple_answers from public.wedding_poll_answers a where a.poll_id = pid) is distinct from secrets
  ) then raise exception 'This poll has votes. Duplicate it to change options or answer keys'; end if;
  insert into public.wedding_polls(id,event_id,category,kind,question,options,photo_ids,status,starts_at,closes_at,reveal_at,results,pinned,provisional)
    values(pid,p_event,p_poll->>'category',p_poll->>'kind',btrim(p_poll->>'question'),opt,photos,p_poll->>'status',
      (p_poll->>'startsAt')::timestamptz,(p_poll->>'closesAt')::timestamptz,(p_poll->>'revealAt')::timestamptz,
      p_poll->>'results',coalesce((p_poll->>'pinned')::boolean,false),coalesce((p_poll->>'provisional')::boolean,false))
    on conflict(id) do update set category=excluded.category,kind=excluded.kind,question=excluded.question,options=excluded.options,photo_ids=excluded.photo_ids,
      status=excluded.status,starts_at=excluded.starts_at,closes_at=excluded.closes_at,reveal_at=excluded.reveal_at,results=excluded.results,pinned=excluded.pinned,provisional=excluded.provisional;
  insert into public.wedding_poll_answers(poll_id,correct,couple_answers) values(pid,correct,secrets)
    on conflict(poll_id) do update set correct=excluded.correct,couple_answers=excluded.couple_answers;
end $$;

create function public.vote_wedding_poll(p_poll uuid, p_answer text[]) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.wedding_polls;
begin
  select * into p from public.wedding_polls where id = p_poll for update;
  if not found then raise exception 'Poll not found'; end if;
  if not public.can_use_wedding_playground(p.event_id) then raise exception 'Sign in and open this invitation first'; end if;
  if not public.general_section_enabled(p.event_id,'playground') or p.status <> 'open' or p.provisional
    or p.starts_at > now() or p.closes_at <= now() then raise exception 'Voting is not open for this poll'; end if;
  if p_answer is null or cardinality(p_answer) < 1 or cardinality(p_answer) > 6 or array_position(p_answer,null) is not null then raise exception 'Choose an answer'; end if;
  if p.kind <> 'multiple' and cardinality(p_answer) <> 1 then raise exception 'Choose one answer'; end if;
  if p.kind = 'text' then
    if char_length(btrim(p_answer[1])) not between 1 and 30 or btrim(p_answer[1]) ~ '\s' then raise exception 'Share one word, up to 30 characters'; end if;
    p_answer := array[lower(btrim(p_answer[1]))];
  elsif exists(select 1 from unnest(p_answer) x where not x = any(array(select generate_series(0,jsonb_array_length(p.options)-1)::text)))
    or (select count(distinct x) from unnest(p_answer) x) <> cardinality(p_answer) then raise exception 'Choose valid, different options'; end if;
  if p.category = 'quiz' and exists(select 1 from public.wedding_poll_votes where poll_id = p_poll and user_id = auth.uid()) then
    if exists(select 1 from public.wedding_poll_votes where poll_id = p_poll and user_id = auth.uid() and answer = p_answer) then return; end if;
    raise exception 'Your quiz answer is already locked in';
  end if;
  insert into public.wedding_poll_votes(poll_id,user_id,answer,approved) values(p_poll,auth.uid(),p_answer,p.kind <> 'text')
    on conflict(poll_id,user_id) do update set answer=excluded.answer,approved=excluded.approved,updated_at=now();
end $$;

create function public.join_wedding_team(p_event uuid, p_team text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.can_use_wedding_playground(p_event) or not public.general_section_enabled(p_event,'playground') then raise exception 'Open the wedding playground first'; end if;
  insert into public.wedding_teams(event_id,user_id,team) values(p_event,auth.uid(),p_team)
    on conflict(event_id,user_id) do update set team=excluded.team;
end $$;

create function public.moderate_wedding_word(p_event uuid, p_poll uuid, p_user uuid, p_approved boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_host(p_event) then raise exception 'Only hosts can review words'; end if;
  if not exists(select 1 from public.wedding_polls where id=p_poll and event_id=p_event and kind='text') then raise exception 'Word poll not found'; end if;
  if p_approved then update public.wedding_poll_votes set approved=true where poll_id=p_poll and user_id=p_user;
  else delete from public.wedding_poll_votes where poll_id=p_poll and user_id=p_user; end if;
end $$;

create function public.wedding_playground(p_event uuid, p_admin boolean default false) returns jsonb
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
    where p.event_id=p_event and (p_admin or (p.status <> 'draft' and not p.provisional and (p.starts_at is null or p.starts_at <= now())))
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
  ) order by p.pinned desc,p.created_at,p.id),'[]'::jsonb) into polls from visible p left join public.wedding_poll_answers a on a.poll_id=p.id;

  with points as (
    select t.team,t.user_id,
      (select count(*)*5 from public.wedding_poll_votes v join public.wedding_polls p on p.id=v.poll_id where p.event_id=p_event and p.status<>'draft' and v.user_id=t.user_id and v.approved)
      + (select count(distinct coalesce(ph.post_id,ph.id))*10 from public.photos ph where ph.event_id=p_event and ph.uploaded_by=t.user_id and not ph.hidden)
      + (select count(*)*15 from public.guestbook_messages w where w.event_id=p_event and w.user_id=t.user_id and w.status='approved')
      + (select count(distinct ph.quest_id)*25 from public.photos ph where ph.event_id=p_event and ph.uploaded_by=t.user_id and not ph.hidden and ph.quest_id is not null)
      + (select count(*)*20 from public.wedding_poll_votes v join public.wedding_polls p on p.id=v.poll_id join public.wedding_poll_answers a on a.poll_id=p.id
        where p.event_id=p_event and p.category='quiz' and v.user_id=t.user_id and v.answer=array[a.correct::text]
          and (p.status='closed' or p.closes_at<=now()) and (p.reveal_at is null or p.reveal_at<=now())) as score
    from public.wedding_teams t where t.event_id=p_event
  ) select jsonb_agg(jsonb_build_object('id',team,'members',members,'points',score) order by team) into teams from (
    select x.team,count(p.user_id) as members,coalesce(sum(p.score),0) as score from (values ('a'),('b'),('both')) x(team)
      left join points p on p.team=x.team group by x.team
  ) s;
  return jsonb_build_object('polls',polls,'teams',teams,'myTeam',(select team from public.wedding_teams where event_id=p_event and user_id=auth.uid()),
    'stats',case when p_admin then (select jsonb_build_object('votes',count(*),'voters',count(distinct v.user_id),'completed',count(distinct p.id))
      from public.wedding_poll_votes v join public.wedding_polls p on p.id=v.poll_id where p.event_id=p_event) else jsonb_build_object('votes',0,'voters',0,'completed',0) end,
    'pendingWords',case when p_admin then (select coalesce(jsonb_agg(jsonb_build_object('pollId',p.id,'userId',v.user_id,'question',p.question,'word',v.answer[1])),'[]'::jsonb)
      from public.wedding_poll_votes v join public.wedding_polls p on p.id=v.poll_id where p.event_id=p_event and p.kind='text' and not v.approved) else '[]'::jsonb end);
end $$;

-- Default sections are backward compatible with callers still sending eight keys.
update public.general_invitation_settings set sections='{"nostalgia":true,"playground":true}'::jsonb || sections;
create or replace function public.save_general_invitation_settings(p_event uuid,p_welcome text,p_cover text,p_sections jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare k text; sections jsonb;
begin
  if not public.is_host(p_event) then raise exception 'Only hosts can customize the invitation'; end if;
  if p_welcome is null or char_length(btrim(p_welcome)) not between 1 and 500 then raise exception 'The welcome message must contain 1–500 characters'; end if;
  if jsonb_typeof(p_sections) is distinct from 'object' then raise exception 'Invalid section visibility'; end if;
  sections:=jsonb_build_object('quests',public.general_section_enabled(p_event,'quests'),'nostalgia',public.general_section_enabled(p_event,'nostalgia'),'playground',public.general_section_enabled(p_event,'playground')) || p_sections;
  if (select count(*) from jsonb_object_keys(sections))<>10 then raise exception 'Invalid section visibility'; end if;
  foreach k in array array['cover','schedule','photos','uploads','updates','guestbook','download','quests','nostalgia','playground'] loop
    if jsonb_typeof(sections->k) is distinct from 'boolean' then raise exception 'Invalid visibility for %',k; end if;
  end loop;
  if p_cover is not null and (p_cover !~ ('^'||p_event::text||'/[0-9a-f-]{36}\.(webp|png|jpg)$') or not exists(select 1 from storage.objects where bucket_id='invitation-covers' and name=p_cover)) then raise exception 'Invalid cover photo'; end if;
  insert into public.general_invitation_settings(event_id,welcome_message,cover_path,sections) values(p_event,btrim(p_welcome),p_cover,sections)
    on conflict(event_id) do update set welcome_message=excluded.welcome_message,cover_path=excluded.cover_path,sections=excluded.sections;
end $$;

-- Starter polls have no fabricated votes. Private quiz answer keys are explicitly
-- provisional drafts; hosts must confirm them before publication.
create function public.seed_wedding_playground(p_event uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.events; q text; pid uuid; entry jsonb;
begin
  select * into e from public.events where id=p_event and slug='anand-susmita';
  if not found or exists(select 1 from public.wedding_polls where event_id=p_event) then return; end if;
    foreach q in array array['Who will say sorry first after an argument?','Who will control the TV remote?','Who will plan surprise dates?','Who will steal the blanket at night?','Who will take longer to get ready?'] loop
      insert into public.wedding_polls(event_id,category,question,options,status) values(e.id,'duel',q,jsonb_build_array(e.couple_a,e.couple_b),'open');
    end loop;
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
revoke all on function public.seed_wedding_playground(uuid) from public,anon,authenticated;
do $$ declare eid uuid; begin for eid in select id from public.events where slug='anand-susmita' loop perform public.seed_wedding_playground(eid); end loop; end $$;

revoke all on function public.can_use_wedding_playground(uuid),public.save_wedding_poll(uuid,jsonb),public.vote_wedding_poll(uuid,text[]),public.join_wedding_team(uuid,text),public.moderate_wedding_word(uuid,uuid,uuid,boolean),public.wedding_playground(uuid,boolean) from public,anon;
grant execute on function public.can_use_wedding_playground(uuid),public.save_wedding_poll(uuid,jsonb),public.vote_wedding_poll(uuid,text[]),public.join_wedding_team(uuid,text),public.moderate_wedding_word(uuid,uuid,uuid,boolean),public.wedding_playground(uuid,boolean) to authenticated;

commit;
