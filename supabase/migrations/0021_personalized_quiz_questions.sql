begin;

create or replace function public.seed_wedding_quiz_questions(p_event uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  e public.events;
  entry jsonb;
  pid uuid;
  answer_index integer;
  question_position integer := 0;
  keep_ids uuid[] := '{}';
begin
  select * into e from public.events where id=p_event and slug='anand-susmita';
  if not found then return; end if;

  for entry in select * from jsonb_array_elements($questions$[
    {
      "question": "Anand and Susmita share a funny childhood memory involving pencils, paper and a little creativity. Which competition was it?",
      "options": ["Singing", "Drawing", "Dancing", "Running"],
      "answer": "Drawing"
    },
    {
      "question": "Despite their different eating habits, they both agree that nothing beats this round, homemade Indian staple. What is it?",
      "options": ["Pizza", "Biryani", "Roti", "Dosa"],
      "answer": "Roti"
    },
    {
      "question": "Susmita's favourite fruit comes with its own natural packaging — no knife, no preparation, just peel and enjoy. Which fruit is it?",
      "options": ["Mango", "Watermelon", "Banana", "Pineapple"],
      "answer": "Banana"
    },
    {
      "question": "Susmita's dream adventure involves going beneath the waves and getting surprisingly close to some of the ocean's most feared creatures. What is it?",
      "options": ["Skydiving", "Scuba diving with sharks", "Desert safari", "Bungee jumping"],
      "answer": "Scuba diving with sharks"
    },
    {
      "question": "For Susmita, the adventure isn't just about reaching the destination. It's about experiencing the journey by land, air and water. What makes a trip particularly exciting for her?",
      "options": ["Luxury hotels", "Shopping malls", "Different modes of transport", "Room service"],
      "answer": "Different modes of transport"
    },
    {
      "question": "Susmita loves an animal that wears a natural tuxedo, waddles around and cannot fly. Which one?",
      "options": ["Panda", "Penguin", "Dolphin", "Rabbit"],
      "answer": "Penguin"
    },
    {
      "question": "For Anand, the perfect weekend morning involves no alarms, no plans and absolutely no rush. What is his favourite morning activity?",
      "options": ["Going for a run", "Making breakfast", "Sleeping until noon", "Reading the newspaper"],
      "answer": "Sleeping until noon"
    },
    {
      "question": "Anand loves experimenting with food, even if it means breaking a few culinary rules. Which unusual combination could he happily try?",
      "options": ["Chocolate roti", "Ice cream biryani", "Coffee dosa", "Banana pizza"],
      "answer": "Chocolate roti"
    },
    {
      "question": "Anand's idea of an adventure involves challenging trails, tired legs and breathtaking views. What is his favourite outdoor activity?",
      "options": ["Fishing", "Trekking", "Cycling", "Surfing"],
      "answer": "Trekking"
    }
  ]$questions$::jsonb) loop
    question_position := question_position + 1;
    select (ordinality-1)::integer into answer_index
      from jsonb_array_elements_text(entry->'options') with ordinality
      where value=entry->>'answer';
    if answer_index is null then raise exception 'Quiz answer is missing from its options'; end if;

    select p.id into pid from public.wedding_polls p
      left join public.wedding_poll_answers a on a.poll_id=p.id
      where p.event_id=e.id and p.category='quiz' and p.kind='single'
        and p.question=entry->>'question' and p.options=entry->'options'
        and (a.correct=answer_index or not exists(select 1 from public.wedding_poll_votes v where v.poll_id=p.id))
      order by p.created_at,p.id limit 1;
    if not found then
      insert into public.wedding_polls(event_id,category,question,options,status,provisional,question_order)
        values(e.id,'quiz',entry->>'question',entry->'options','open',false,question_position)
        returning id into pid;
    else
      update public.wedding_polls set question_order=question_position,
        status=case when provisional or archived then 'open' else status end,
        provisional=false,archived=false where id=pid;
    end if;
    insert into public.wedding_poll_answers(poll_id,correct) values(pid,answer_index)
      on conflict(poll_id) do update set correct=excluded.correct;
    keep_ids := array_append(keep_ids,pid);
  end loop;

  update public.wedding_polls set status='draft',pinned=false,archived=true
    where event_id=e.id and category='quiz' and not (id=any(keep_ids));
end $$;
revoke all on function public.seed_wedding_quiz_questions(uuid) from public,anon,authenticated;

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
    perform public.seed_wedding_quiz_questions(e.id);
    insert into public.wedding_polls(event_id,category,question,options,status,starts_at,closes_at,results,pinned)
      values(e.id,'live','What are you enjoying the most today?','["Wedding food","Wedding ceremony","Taking photographs","Meeting friends & family"]','open',date_trunc('day',e.starts_at at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata',e.starts_at+interval '12 hours','always',true);
    insert into public.wedding_polls(event_id,category,kind,question,status,results) values(e.id,'words','text','Describe our love story in one word.','open','always');
    insert into public.wedding_polls(event_id,category,question,options,status) values(e.id,'secret','Who is more stubborn?',jsonb_build_array(e.couple_a,e.couple_b),'draft');
end $$;

do $$ declare eid uuid; begin
  for eid in select id from public.events where slug='anand-susmita' loop
    perform public.seed_wedding_quiz_questions(eid);
  end loop;
end $$;

commit;
