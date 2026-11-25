import { api } from './backend';
import { requireGuestSignIn } from './guestAuth';
import { supabase } from './supabaseClient';
import { emptyPlayground, isPlaygroundCategory, type Playground, type Poll, type PollDraft, type Team } from './celebrationTypes';

const must = <T>(result: { data: T; error: { message: string } | null }): T => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const result = await supabase().rpc(name, args);
  if (result.error?.code === 'PGRST202' || result.error?.code === '42P01') throw new Error('This section is being prepared by the hosts. Please try again later.');
  return must(result) as T;
}
type Demo = { polls: Poll[]; votes: Record<string, Record<string, string[]>>; approved: Record<string, Record<string, boolean>>; teams: Record<string, Team['id']> };
function demoPolls(): Poll[] {
  const make = (category: Poll['category'], question: string, options = ['Anand','Susmita'], extra: Partial<Poll> = {}): Poll => ({ id:crypto.randomUUID(), category, kind:'single', question, options, photoIds:[],status:'open',startsAt:null,closesAt:null,revealAt:null,results:'after_vote',pinned:false,provisional:false,mine:null,counts:null,total:null,words:[],correct:null,coupleAnswers:null,...extra });
  return [
    ...['Who will say sorry first after an argument?','Who will control the TV remote?','Who will plan surprise dates?','Who will steal the blanket at night?','Who will take longer to get ready?'].map((q,index)=>make('duel',q,undefined,{pinned:index===0})),
    make('prediction','Where will our first international trip be?',['Maldives','Switzerland','Bali','Dubai'],{closesAt:'2026-11-30T12:28:00+05:30',revealAt:'2027-11-29T12:28:00+05:30'}),
    make('prediction','What will our weekends look like?',['Movie nights','Long drives','Sleeping in','Exploring new places'],{closesAt:'2026-11-30T12:28:00+05:30'}),
    make('prediction','What will be our biggest household debate?',['What to eat','Room temperature','Shopping expenses','Where to travel'],{closesAt:'2026-11-30T12:28:00+05:30'}),
    ...['Who initiated the first conversation?','Who takes more photographs?','Who made the first move?'].map(q=>make('quiz',q,undefined,{status:'draft',provisional:true,correct:0})),
  ];
}
const readDemo = (eventId: string): Demo => {
  const data = localStorage.getItem(`as-wedding-celebration:${eventId}`);
  if (data) { const saved=JSON.parse(data) as Demo; saved.approved ??= {}; return saved; }
  const initial: Demo={polls:demoPolls(),votes:{},approved:{},teams:{}};
  localStorage.setItem(`as-wedding-celebration:${eventId}`,JSON.stringify(initial)); return initial;
};
const writeDemo = (eventId: string, data: Demo) => { localStorage.setItem(`as-wedding-celebration:${eventId}`, JSON.stringify(data)); };

export const celebration = {
  async playground(eventId: string, admin = false): Promise<Playground> {
    const user = await requireGuestSignIn();
    if (api.kind === 'local') {
      const data = readDemo(eventId), result = emptyPlayground();
      if (admin && !user.host) throw new Error('Only hosts can manage polls.');
      result.polls = data.polls.filter(p => isPlaygroundCategory(p.category) && (admin || (p.status !== 'draft' && !p.provisional && (!p.startsAt || Date.parse(p.startsAt)<=Date.now())))).map(p => {
        const votes = Object.entries(data.votes[p.id] ?? {}).filter(([uid])=>p.kind!=='text'||data.approved[p.id]?.[uid]).map(([,answer])=>answer), mine = data.votes[p.id]?.[user.id] ?? null;
        const closed=p.status==='closed'|| (!!p.closesAt && Date.parse(p.closesAt)<=Date.now());
        const reveal = closed && (!p.revealAt || Date.parse(p.revealAt) <= Date.now());
        const show = admin || p.results === 'always' || (p.results === 'after_vote' && !!mine) || (p.results==='closed' && reveal);
        const words=Object.entries(votes.reduce<Record<string,number>>((all,v)=>{all[v[0]]=(all[v[0]]??0)+1;return all;},{})).map(([word,count])=>({word,count}));
        return { ...p, status:!admin&&closed?'closed':p.status, mine, total: show ? votes.length : null, counts: show ? p.options.map((_, i) => votes.filter(v => v.includes(String(i))).length) : null, words:show&&p.kind==='text'?words:[],correct: admin || reveal ? p.correct : null, coupleAnswers: admin || reveal ? p.coupleAnswers : null };
      });
      result.myTeam = data.teams[user.id] ?? null;
      let social: {photos?:{id:string;postId?:string;hidden:boolean;questId?:string}[];wishes?:{status:string}[] }={};
      try {social=JSON.parse(localStorage.getItem('as-wedding-demo-db-v1')||'{}');}catch{/* No demo posts yet. */}
      const photos=social.photos?.filter(p=>!p.hidden)??[];
      result.teams = (['a', 'b', 'both'] as const).map(id => ({ id, members: Object.values(data.teams).filter(t => t === id).length, points: Object.entries(data.teams).filter(([, t]) => t === id).reduce((n, [uid]) => n + data.polls.filter(p=>data.votes[p.id]?.[uid] && (p.kind!=='text'||data.approved[p.id]?.[uid])).length*5
        + result.polls.filter(p=>p.category==='quiz'&&p.correct!==null&&p.mine?.[0]===String(p.correct)&&p.status==='closed').length*20
        + new Set(photos.map(p=>p.postId||p.id)).size*10 + new Set(photos.flatMap(p=>p.questId?[p.questId]:[])).size*25 + (social.wishes?.filter(w=>w.status==='approved').length??0)*15, 0) }));
      result.stats={votes:Object.values(data.votes).reduce((n,v)=>n+Object.keys(v).length,0),voters:new Set(Object.values(data.votes).flatMap(v=>Object.keys(v))).size,completed:Object.keys(data.votes).length};
      if(admin)result.pendingWords=data.polls.filter(p=>p.kind==='text').flatMap(p=>Object.entries(data.votes[p.id]??{}).filter(([uid])=>!data.approved[p.id]?.[uid]).map(([userId,answer])=>({pollId:p.id,userId,question:p.question,word:answer[0]})));
      return result;
    }
    const data = await rpc<Playground>('wedding_playground', { p_event: eventId, p_admin: admin });
    data.polls = data.polls.filter(p => isPlaygroundCategory(p.category));
    const paths = data.polls.flatMap(p => p.photoPaths ?? []).filter((p): p is string => !!p);
    if (paths.length) {
      const urls = must(await supabase().storage.from('photos').createSignedUrls([...new Set(paths)], 300));
      data.polls = data.polls.map(p => ({ ...p, photoUrls: p.photoPaths?.map(path => urls?.find(url => url.path === path)?.signedUrl ?? null) }));
    }
    return data;
  },
  async vote(eventId: string, pollId: string, answer: string[]) {
    const user = await requireGuestSignIn();
    if (api.kind === 'local') {
      const data=readDemo(eventId),p=data.polls.find(p=>p.id===pollId);
      if(!p||p.status!=='open'||p.provisional||(p.startsAt&&Date.parse(p.startsAt)>Date.now())||(p.closesAt&&Date.parse(p.closesAt)<=Date.now()))throw new Error('Voting is not open for this poll.');
      if(!answer.length||(p.kind!=='multiple'&&answer.length!==1)||new Set(answer).size!==answer.length||(p.kind!=='text'&&answer.some(a=>!p.options[Number(a)])))throw new Error('Choose a valid answer.');
      if(p.category==='quiz'&&data.votes[pollId]?.[user.id]&&JSON.stringify(data.votes[pollId][user.id])!==JSON.stringify(answer))throw new Error('Your quiz answer is already locked in.');
      if(p.kind==='text'){if(!/^\S{1,30}$/.test(answer[0].trim()))throw new Error('Share one word, up to 30 characters.');answer=[answer[0].trim().toLowerCase()];}
      data.votes[pollId]??={};data.votes[pollId][user.id]=answer;data.approved[pollId]??={};data.approved[pollId][user.id]=p.kind!=='text';writeDemo(eventId,data);return;
    }
    await rpc('vote_wedding_poll', { p_poll: pollId, p_answer: answer });
  },
  async joinTeam(eventId: string, team: Team['id']) {
    const user = await requireGuestSignIn();
    if (api.kind === 'local') { const data = readDemo(eventId); data.teams[user.id] = team; writeDemo(eventId, data); return; }
    await rpc('join_wedding_team', { p_event: eventId, p_team: team });
  },
  async savePoll(eventId: string, poll: PollDraft) {
    const user=await requireGuestSignIn();
    if(!isPlaygroundCategory(poll.category))throw new Error('This activity is no longer available.');
    if (api.kind === 'local') {
      if(!user.host)throw new Error('Only hosts can manage polls.');
      if(poll.provisional&&poll.status==='open')throw new Error('Confirm provisional answers before publishing.');
      if(poll.kind!=='text'&&(poll.options.length<2||poll.options.length>6||poll.options.some(o=>!o.trim())||new Set(poll.options.map(o=>o.trim().toLowerCase())).size!==poll.options.length))throw new Error('Add 2–6 different options.');
      if(poll.category==='quiz'&&poll.status==='open'&&poll.correct===null)throw new Error('Choose the correct answer.');
      const data=readDemo(eventId),existing=data.polls.find(p=>p.id===poll.id);
      if(existing&&Object.keys(data.votes[poll.id]??{}).length&&['options','category','kind','correct','coupleAnswers','photoIds'].some(k=>JSON.stringify(existing[k as keyof Poll])!==JSON.stringify(poll[k as keyof PollDraft])))throw new Error('This poll has votes. Duplicate it to change options or answer keys.');
      if(existing)Object.assign(existing,poll);else data.polls.push({...poll,mine:null,counts:null,total:null,words:[]});writeDemo(eventId,data);return;
    }
    await rpc('save_wedding_poll', { p_event: eventId, p_poll: poll });
  },
  async moderateWord(eventId: string, pollId: string, userId: string, approved: boolean) {
    const user=await requireGuestSignIn();
    if (api.kind === 'local') {if(!user.host)throw new Error('Only hosts can review words.');const data=readDemo(eventId);data.approved[pollId]??={};if(approved)data.approved[pollId][userId]=true;else delete data.votes[pollId]?.[userId];writeDemo(eventId,data);return;}
    await rpc('moderate_wedding_word', { p_event: eventId, p_poll: pollId, p_user: userId, p_approved: approved });
  },
};
