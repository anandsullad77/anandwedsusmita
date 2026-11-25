import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { GoogleSignIn } from '../components/GoogleSignIn';
import { celebration } from '../lib/celebration';
import { POLL_CATEGORIES, quizTitle, type Playground, type Poll } from '../lib/celebrationTypes';
import type { EventInfo } from '../lib/types';
import { useGuestAuth } from '../lib/useGuestAuth';
import { Icon } from './Icon';
import './celebration.css';

export function usePlayground(eventId: string, admin = false) {
  const { canAccess, user } = useGuestAuth();
  const [data,setData] = useState<Playground | null>(null);
  const [error,setError] = useState<string | null>(null);
  const [loading,setLoading] = useState(false);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request=++sequence.current;
    if (!canAccess) { setData(null); setError(null); return; }
    setLoading(true);
    try { const next=await celebration.playground(eventId,admin); if (request === sequence.current) { setData(next); setError(null); } }
    catch (e) { if (request === sequence.current) setError((e as Error).message); }
    finally { if (request === sequence.current) setLoading(false); }
  },[eventId,admin,canAccess,user?.id]);
  useEffect(() => {
    setData(null); void refresh();
    const timer=window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); },20000);
    window.addEventListener('focus',refresh);
    return () => { sequence.current++; window.clearInterval(timer); window.removeEventListener('focus',refresh); };
  },[refresh]);
  return { data,error,loading,refresh,canAccess,user };
}

export default function WeddingPlayground({ event,base }: { event: EventInfo; base: string }) {
  const { data,error,loading,refresh,canAccess,user }=usePlayground(event.id);
  const { activity: category }=useParams<{ activity: string }>();
  const [limit,setLimit]=useState(6);
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(() => { setLimit(6); heading.current?.focus({ preventScroll: true }); },[category]);
  const active=POLL_CATEGORIES.find(c => c.id === category)!;
  const polls=data?.polls.filter(p => p.category === category) ?? [];
  const revealDate=new Date(event.startsAt); revealDate.setUTCFullYear(revealDate.getUTCFullYear()+1);
  const quiz=data?.polls.filter(p => p.category === 'quiz') ?? [];
  const quizAnswered=quiz.filter(p => p.mine).length;
  const revealed=quiz.filter(p => p.correct !== null && p.mine);
  const correct=revealed.filter(p => p.mine?.[0] === String(p.correct)).length;
  if (category && !active) return <Navigate to={`${base}/playground`} replace />;
  if (!category) return <section id="wedding-playground" className="general-section wedding-playground" aria-labelledby="playground-title" lang="en">
    <div className="playground-intro"><div className="general-section-heading"><p className="general-eyebrow">A little friendly competition</p><h1 id="playground-title">The Wedding <i>Playground</i></h1><p>Play. Predict. Vote. Celebrate.<br />Choose an activity to get started.</p></div><div className="playground-monogram" aria-hidden="true"><span>{event.coupleA[0]}</span><i>&</i><span>{event.coupleB[0]}</span><small>THE GUESTS HAVE A SAY</small></div></div>
    <nav className="playground-categories" aria-label="Choose a playground activity">{POLL_CATEGORIES.map(c => <Link key={c.id} to={`${base}/playground/${c.id}`}><Icon size={23} d={c.icon} /><span><b>{c.id === 'duel' ? `${event.coupleA} vs ${event.coupleB}` : c.title}</b><small>{c.short}</small></span><span className="playground-category-arrow" aria-hidden="true">↗</span></Link>)}</nav>
    <VerdictPanel base={base} data={data} error={error} loading={loading} refresh={refresh} canAccess={canAccess} />
    {canAccess && data && <PlaygroundResults data={data} base={base} />}
  </section>;
  return <section id="wedding-playground" tabIndex={-1} className="general-section wedding-playground" aria-labelledby="playground-title" lang="en">
    <Link className="celebration-text-link playground-back" to={`${base}/playground`}>← All activities</Link>
    <div className="playground-activity-heading general-section-heading"><p className="general-eyebrow">{active?.short}</p><h1 ref={heading} tabIndex={-1} id="playground-title">{category === 'duel' ? `${event.coupleA} vs ${event.coupleB}` : active?.title}</h1></div>
    <div className="playground-panel" role="region" aria-label={active.title}>
      <div className="playground-panel-heading"><p className="celebration-help">{category === "duel" ? "Let the guests decide!" : active.short}</p>{canAccess && <button className="celebration-text-link" disabled={loading} onClick={() => void refresh()}><Icon size={16} d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 2M4 16l2 2a7 7 0 0 0 12-1" />{loading ? 'Updating…' : 'Refresh'}</button>}</div>
      {!canAccess ? <GoogleSignIn returnTo={`${base}/playground/${category}`} purpose="play, predict and vote" /> : <>
        {error && <p className="error" role="alert">{error} <button className="celebration-text-link" disabled={loading} onClick={() => void refresh()}>Try again</button></p>}
        {!data && loading && <p role="status">Getting the playground ready…</p>}
        {data && <>
            {category === 'prediction' && <div className="prediction-keepsake"><Icon size={22} d="M4 6h16v14H4zM8 3v6M16 3v6M4 11h16" /><p>A little time capsule for our first anniversary.<span>Revisit on {revealDate.toLocaleDateString('en-IN',{ day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Kolkata' })}.</span></p></div>}
            {category === 'quiz' && quiz.length > 0 && <div className="quiz-progress" role="status"><span>{quizAnswered} of {quiz.length} answers locked in</span>{revealed.length === quiz.length && quizAnswered === quiz.length ? <><b>{correct} / {quiz.length} · {quizTitle(Math.round(correct/quiz.length*100))}</b><span>Your quiz achievement</span></> : <small>One try per question. Scores appear when the hosts reveal the answers.</small>}</div>}
            {!polls.length && <div className="celebration-empty"><Icon size={28} d={active?.icon ?? POLL_CATEGORIES[0].icon} /><h4>{category === 'quiz' ? 'A few little secrets, coming soon.' : category === 'photo' ? 'First, let’s make some memories.' : 'The next chapter is on its way.'}</h4><p>{category === 'photo' ? 'The hosts will nominate wedding photos here. Then you get to choose your favourites.' : category === 'quiz' ? 'The hosts are putting the finishing touches on our couple quiz.' : 'Check back for new questions and the couple’s big reveals.'}</p>{category === 'photo' && <Link className="celebration-text-link" to={`${base}/feed`}>Explore the wedding feed →</Link>}</div>}
            <div className="playground-polls">{polls.slice(0,limit).map((poll,i) => <PollCard key={`${user?.id}:${poll.id}`} poll={poll} number={i+1} event={event} refresh={refresh} />)}</div>
            {polls.length > limit && <button className="btn btn-ghost" onClick={() => setLimit(n => n+6)}>More questions ({polls.length-limit})</button>}
        </>}
      </>}
    </div>
    <div className="playground-footnote"><p><Icon size={14} d="M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3" />One ballot per signed-in guest. Results update every 20 seconds.</p></div>
  </section>;
}

export function WeddingVerdict({ eventId,base }: { eventId: string; base: string }) {
  const state=usePlayground(eventId);
  return <VerdictPanel base={base} {...state} invitation />;
}

function VerdictPanel({ base,data,error,loading,refresh,canAccess,invitation=false }: {
  base: string; data: Playground | null; error: string | null; loading: boolean;
  refresh: () => Promise<void>; canAccess: boolean; invitation?: boolean;
}) {
  const titleId=useId();
  const polls=data?.polls.filter(p => p.pinned && p.status !== 'draft') ?? [];
  return <section className={`wedding-verdict${invitation ? ' general-section' : ''}`} aria-labelledby={titleId} lang="en">
    <div className="verdict-heading"><div><p className="general-eyebrow">The guests have spoken</p><h2 id={titleId}>The wedding verdict</h2></div>{canAccess && <button className="celebration-text-link" disabled={loading} onClick={() => void refresh()}>{loading ? 'Updating…' : 'Refresh'}</button>}</div>
    <div className="verdict-panel">
      {error ? <p className="error" role="alert">{error} <button className="celebration-text-link" disabled={loading} onClick={() => void refresh()}>Try again</button></p>
        : loading && !data ? <p className="celebration-help" role="status">Gathering the guest verdict…</p>
        : !canAccess ? <div className="celebration-empty"><Icon size={28} d={POLL_CATEGORIES[0].icon} /><h3>A little fun. A lot of opinions.</h3><p>Who knows us best? Join the Playground to vote, make predictions and discover the guest verdict.</p></div>
        : !polls.length ? <div className="celebration-empty"><Icon size={28} d={POLL_CATEGORIES[0].icon} /><h3>The next verdict is on its way.</h3><p>Meanwhile, pick a game and have your say in the Playground.</p></div>
        : <div className="playground-polls">{polls.map(p => <article className="playground-result-card verdict-poll" key={p.id}><h3>{p.question}</h3>
          {p.kind === 'text' ? <div className="love-word-cloud" aria-label="Words from wedding guests">{p.words.map(w => <span key={w.word} title={`${w.count} guests`}>{w.word}<small>{w.count}</small></span>)}</div>
            : p.counts !== null && (p.total ?? 0)>0 ? <dl>{p.options.map((option,i) => <div key={i}><dt>{option}</dt><dd><span>{Math.round(p.counts![i]/p.total!*100)}%</span><span className="overview-result-track" aria-hidden="true"><span style={{width:`${p.counts![i]/p.total!*100}%`}} /></span></dd></div>)}</dl>
            : <p className="celebration-help">{p.counts === null ? 'Join this activity in the Playground to see the results when they are available.' : 'The first vote could be yours. Join in at the Playground.'}</p>}
          {p.total !== null && <p className="celebration-help">{p.total} {p.total === 1 ? 'guest' : 'guests'} voted</p>}
        </article>)}</div>}
      <div className="verdict-actions"><Link className="btn btn-deep" to={`${base}/playground`}>Go to Playground <Icon size={17} d="M5 12h14m-6-6l6 6-6 6" /></Link></div>
    </div>
    {canAccess && <p className="celebration-help verdict-update-note">Results update every 20 seconds. Play and vote in the Playground.</p>}
  </section>;
}

function PlaygroundResults({ data,base }: { data: Playground; base: string }) {
  const results=data.polls.filter(p => !p.pinned && p.kind !== 'text' && p.counts !== null && (p.total ?? 0)>0);
  if (!results.length) return null;
  return <section className="playground-results" aria-labelledby="playground-results-title">
    <div className="general-section-heading"><p className="general-eyebrow">The guests have spoken</p><h2 id="playground-results-title">The celebration so far</h2><p>A little look at the votes and the friendly competition.</p></div>
    <div className="playground-polls">
      {results.slice(0,4).map(p => <article key={p.id} className="playground-result-card"><h3>{p.question}</h3><dl>{p.options.map((o,i) => <div key={i}><dt>{o}</dt><dd><span>{Math.round(p.counts![i]/p.total!*100)}%</span><span className="overview-result-track" aria-hidden="true"><span style={{width:`${p.counts![i]/p.total!*100}%`}} /></span></dd></div>)}</dl><p className="celebration-help">{p.total} {p.total === 1 ? 'guest' : 'guests'} voted</p><Link className="celebration-text-link" to={`${base}/playground/${p.category}`}>Open activity →</Link></article>)}
    </div>
  </section>;
}

function PollCard({ poll,number,event,refresh }: { poll: Poll; number: number; event: EventInfo; refresh: () => Promise<void> }) {
  const [selected,setSelected]=useState<string[]>(poll.mine ?? []);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string | null>(null);
  const [notice,setNotice]=useState<string | null>(null);
  const lock=useRef(false);
  const mine=JSON.stringify(poll.mine);
  useEffect(() => { setSelected(poll.mine ?? []); },[mine]);
  const closed=poll.status !== 'open' || (!!poll.closesAt && Date.parse(poll.closesAt)<=Date.now());
  const locked=closed || (poll.category === 'quiz' && !!poll.mine);
  async function vote(answer: string[]) {
    if (lock.current || locked) return;
    lock.current=true; setBusy(true); setError(null); setNotice(null);
    try { await celebration.vote(event.id,poll.id,answer); setSelected(answer); setNotice('Your vote is saved.'); await refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { lock.current=false; setBusy(false); }
  }
  return <article className={`playground-poll${poll.pinned ? ' poll-pinned' : ''}`} data-poll-id={poll.id}>
    <div className="poll-meta"><span>QUESTION {String(number).padStart(2,'0')}</span><span>{closed ? 'Voting closed' : poll.mine ? 'Your vote is in' : 'Have your say'}{poll.pinned && ' · Featured'}</span></div>
    <h4 id={`poll-${poll.id}`}>{poll.question}</h4>
    <div className={`poll-options${poll.category === 'photo' ? ' poll-photo-options' : ''}`} role="group" aria-labelledby={`poll-${poll.id}`}>{poll.options.map((option,i) => {
      const chosen=selected.includes(String(i));
      const percent=poll.total && poll.counts ? Math.round(poll.counts[i]/poll.total*100) : 0;
      return <button type="button" key={i} disabled={busy || locked} aria-pressed={chosen} className={`poll-option${chosen ? ' chosen' : ''}${poll.correct === i ? ' correct' : ''}`} onClick={() => {
        if (poll.kind === 'multiple') setSelected(s => chosen ? s.filter(x => x !== String(i)) : [...s,String(i)]);
        else void vote([String(i)]);
      }}>
        {poll.category === 'photo' && poll.photoUrls?.[i] && <img src={poll.photoUrls[i]!} alt={option} loading="lazy" />}
        <span className="poll-option-content"><span className="poll-choice-mark" aria-hidden="true">{chosen ? '✓' : poll.category === 'duel' ? option.slice(0,1) : String.fromCharCode(65+i)}</span><span>{option}{poll.correct === i && <small>Correct answer</small>}</span>{poll.counts !== null && <b>{percent}%</b>}</span>
        {poll.counts !== null && <span className="poll-result-track" aria-hidden="true"><span style={{ width:`${percent}%` }} /></span>}
      </button>;
    })}</div>
    {poll.kind === 'multiple' && !locked && <button className="btn btn-deep poll-submit" disabled={busy || !selected.length} onClick={() => void vote(selected)}>{busy ? 'Saving…' : 'Save my choices'}</button>}
    <div className="poll-bottom"><span>{poll.total !== null ? `${poll.total} ${poll.total === 1 ? 'guest' : 'guests'} voted` : poll.results === 'closed' ? 'Results appear after the reveal' : 'Vote to see the guest verdict'}{poll.kind === 'multiple' && poll.total !== null ? ' · Multiple choices allowed' : ''}</span>{poll.category === 'quiz' && poll.mine && <span>Answer locked in</span>}</div>
    {notice && <p className="poll-notice" role="status">{notice}</p>}{error && <p className="error" role="alert">{error}</p>}
  </article>;
}
