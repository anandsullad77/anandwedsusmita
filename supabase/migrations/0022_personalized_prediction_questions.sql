begin;

create or replace function public.seed_wedding_prediction_questions(p_event uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  e public.events;
  entry jsonb;
  pid uuid;
  question_position integer := 0;
  keep_ids uuid[] := '{}';
begin
  select * into e from public.events where id=p_event and slug='anand-susmita';
  if not found then return; end if;

  for entry in select * from jsonb_array_elements($questions$[
    {
      "question": "Which adventure will they tick off their bucket list first?",
      "options": ["Meghalaya", "Andaman scuba diving", "Himalayan trek", "Penguin spotting"]
    },
    {
      "question": "What will be their most frequent food debate?",
      "options": ["Mixing food", "What to order", "Roti vs chapati", "Which ice cream flavour"]
    },
    {
      "question": "What will always be stocked in their kitchen?",
      "options": ["Peanuts", "Tea", "Bananas", "All of the above"]
    },
    {
      "question": "What will their perfect Sunday look like?",
      "options": ["Sleeping till noon", "Trekking", "Food exploration", "Endless conversations"]
    },
    {
      "question": "What will their first holiday disagreement be about?",
      "options": ["Destination", "Packing", "Transportation", "Taking too many photos"]
    },
    {
      "question": "What will become their favourite travel tradition?",
      "options": ["Exploring local food", "Visiting temples", "Finding hidden places", "Taking scenic train journeys"]
    },
    {
      "question": "What will they still be doing at 70?",
      "options": ["Sending GIFs", "Arguing about food", "Planning trips", "Teasing each other"]
    },
    {
      "question": "What will their future home have too much of?",
      "options": ["Penguin collectibles", "Travel souvenirs", "Photographs", "Snacks"]
    },
    {
      "question": "What will be the title of their marriage book?",
      "options": ["Married & Still Arguing", "The Roti Chronicles", "Two People, Endless GIFs", "The Magic Continues"]
    }
  ]$questions$::jsonb) loop
    question_position := question_position + 1;
    select p.id into pid from public.wedding_polls p
      where p.event_id=e.id and p.category='prediction' and p.kind='single'
        and p.question=entry->>'question' and p.options=entry->'options'
      order by p.created_at,p.id limit 1;
    if not found then
      insert into public.wedding_polls(event_id,category,question,options,status,results,closes_at,reveal_at,question_order)
        values(e.id,'prediction',entry->>'question',entry->'options','open','after_vote',e.starts_at + interval '1 day',e.starts_at + interval '1 year',question_position)
        returning id into pid;
    else
      update public.wedding_polls set question_order=question_position,archived=false where id=pid;
    end if;
    keep_ids := array_append(keep_ids,pid);
  end loop;

  update public.wedding_polls set status='draft',pinned=false,archived=true
    where event_id=e.id and category='prediction' and not (id=any(keep_ids));
end $$;
revoke all on function public.seed_wedding_prediction_questions(uuid) from public,anon,authenticated;

create or replace function public.seed_wedding_playground(p_event uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.events;
begin
  select * into e from public.events where id=p_event and slug='anand-susmita';
  if not found or exists(select 1 from public.wedding_polls where event_id=p_event) then return; end if;
    perform public.seed_wedding_duel_questions(e.id);
    perform public.seed_wedding_prediction_questions(e.id);
    perform public.seed_wedding_quiz_questions(e.id);
    insert into public.wedding_polls(event_id,category,question,options,status,starts_at,closes_at,results,pinned)
      values(e.id,'live','What are you enjoying the most today?','["Wedding food","Wedding ceremony","Taking photographs","Meeting friends & family"]','open',date_trunc('day',e.starts_at at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata',e.starts_at+interval '12 hours','always',true);
    insert into public.wedding_polls(event_id,category,kind,question,status,results) values(e.id,'words','text','Describe our love story in one word.','open','always');
    insert into public.wedding_polls(event_id,category,question,options,status) values(e.id,'secret','Who is more stubborn?',jsonb_build_array(e.couple_a,e.couple_b),'draft');
end $$;

do $$ declare eid uuid; begin
  for eid in select id from public.events where slug='anand-susmita' loop
    perform public.seed_wedding_quiz_questions(eid);
    perform public.seed_wedding_prediction_questions(eid);
  end loop;
end $$;

commit;
