import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { GoogleSignIn } from '../components/GoogleSignIn';
import { celebration } from '../lib/celebration';
import { POLL_CATEGORIES, playgroundNow, playgroundPhase, playgroundSchedule, quizTitle, type Playground, type PlaygroundPhase, type PlaygroundSchedule, type Poll } from '../lib/celebrationTypes';
import type { EventInfo } from '../lib/types';
import { useGuestAuth } from '../lib/useGuestAuth';
import { Icon } from './Icon';
import './celebration.css';
import './playground.css';

const PLAY_ICON = 'M8 21h8M12 17v4M7 3h10v7a5 5 0 0 1-10 0V3M7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4';
const LOCK = 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3';
const CLOCK = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2';
const MOON = 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z';
const CHECK = 'm5 12.5 4.5 4.5L19 7.5';
const ENVELOPE = 'M3 6h18v13H3zM3 6l9 7 9-7';
// Anand vs Susmita answers use one fixed childhood photo each, from the Nostalgia album.
const COUPLE_PHOTOS: Record<string, { src: string; position: string }> = {
  anand: { src: '/images/nostalgia/anand-little-gentleman-480.jpg', position: '50% 20%' },
  susmita: { src: '/images/nostalgia/susmita-balcony-480.jpg', position: '50% 30%' },
};
const couplePhoto = (option: string) => COUPLE_PHOTOS[option.trim().toLowerCase()];

export function usePlayground(eventId: string, admin = false, startsAt?: string) {
  const { canAccess, user } = useGuestAuth();
  const [data, setData] = useState<Playground | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    if (!canAccess) { setData(null); setError(null); return; }
    setLoading(true);
    try { const next = await celebration.playground(eventId, admin, startsAt); if (request === sequence.current) { setData(next); setError(null); } }
    catch (e) { if (request === sequence.current) setError((e as Error).message); }
    finally { if (request === sequence.current) setLoading(false); }
  }, [eventId, admin, startsAt, canAccess, user?.id]);
  useEffect(() => {
    setData(null); void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 20000);
    window.addEventListener('focus', refresh);
    return () => { sequence.current++; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [refresh]);
  return { data, error, loading, refresh, canAccess, user };
}

/** Re-renders every 30 seconds, so countdowns and phase changes appear without a reload. */
function useNow() {
  const [now, setNow] = useState(playgroundNow);
  useEffect(() => { const timer = window.setInterval(() => setNow(playgroundNow()), 30000); return () => window.clearInterval(timer); }, []);
  return now;
}
function useSchedule(event: EventInfo, data: Playground | null) {
  const now = useNow();
  const schedule: PlaygroundSchedule = data?.schedule ?? playgroundSchedule(event.startsAt);
  return { now, schedule, phase: playgroundPhase(schedule, now) };
}
const ist = (iso: string, options: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', ...options });
const revealDay = (s: PlaygroundSchedule) => ist(s.revealAt, { weekday: 'long', day: 'numeric', month: 'long' });
const revealTime = (s: PlaygroundSchedule) => ist(s.revealAt, { hour: 'numeric', minute: '2-digit' }).toUpperCase();
function timeLeft(s: PlaygroundSchedule, now: number) {
  const mins = Math.max(0, Math.ceil((Date.parse(s.closesAt) - now) / 60000)), d = Math.floor(mins / 1440), h = Math.floor(mins % 1440 / 60), m = mins % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

const isClosed = (poll: Poll, phase: PlaygroundPhase) => phase === 'closed' || phase === 'revealed' || poll.status !== 'open' || (!!poll.closesAt && Date.parse(poll.closesAt) <= playgroundNow());
const percent = (poll: Poll, i: number) => poll.total && poll.counts ? Math.round(poll.counts[i] / poll.total * 100) : 0;
const hasResults = (poll: Poll) => poll.kind !== 'text' && poll.counts !== null && (poll.total ?? 0) > 0;
const topOption = (poll: Poll) => poll.counts ? poll.counts.reduce((best, n, i, all) => n > all[best] ? i : best, 0) : -1;
const agreed = (poll: Poll) => hasResults(poll) && !!poll.mine?.includes(String(topOption(poll)));
const title = (category: typeof POLL_CATEGORIES[number], event: EventInfo) => category.id === 'duel' ? `${event.coupleA} vs ${event.coupleB}` : category.title;
const answerText = (poll: Poll, answer: string[] | null) => answer?.map(i => poll.options[Number(i)]).filter(Boolean).join(', ') ?? '';

/** Results to show as "the wedding verdict": pinned polls first, else the most-voted ones. */
function verdictPolls(data: Playground | null) {
  const withResults = data?.polls.filter(hasResults) ?? [];
  const pinned = withResults.filter(p => p.pinned);
  return (pinned.length ? pinned : [...withResults].sort((a, b) => (b.total ?? 0) - (a.total ?? 0))).slice(0, 2);
}

function ResultBars({ poll }: { poll: Poll }) {
  return <div className="pg-bars">
    {poll.options.map((option, i) => {
      const mine = !!poll.mine?.includes(String(i));
      return <div key={i} className={`pg-bar${mine ? ' is-mine' : ''}`}>
        <div className="pg-bar-label"><span>{option}{mine && <b> · your pick</b>}{poll.correct === i && <b> · correct</b>}</span><span>{percent(poll, i)}%</span></div>
        <span className="pg-bar-track" aria-hidden="true"><span style={{ width: `${percent(poll, i)}%` }} /></span>
      </div>;
    })}
    <p className="pg-note">{poll.total} {poll.total === 1 ? 'guest' : 'guests'} voted</p>
  </div>;
}

function Envelope({ open = false }: { open?: boolean }) {
  return <span className={`pg-envelope${open ? ' is-open' : ''}`} aria-hidden="true">
    {open && <span className="pg-letter-sheet"><i /><i /><i /></span>}
    <span className="pg-flap" /><span className="pg-wax">A&amp;S</span>
  </span>;
}

/** The card at the top of the Playground: sealed, last call, closed, or opened. */
function PhaseCard({ phase, schedule, now, data }: { phase: PlaygroundPhase; schedule: PlaygroundSchedule; now: number; data: Playground | null }) {
  const answered = data?.polls.filter(p => p.mine).length ?? 0;
  if (phase === 'lastcall') {
    const mins = Math.max(0, Math.ceil((Date.parse(schedule.closesAt) - now) / 60000));
    return <section className="pg-phase pg-lastcall" aria-labelledby="pg-phase-title"><Icon size={24} d={CLOCK} />
      <h2 id="pg-phase-title">Last call to vote</h2>
      <p>Voting closes at midnight. Still time to change your mind.</p>
      <p className="pg-big" aria-label={`${Math.floor(mins / 60)} hours ${mins % 60} minutes left`}>{Math.floor(mins / 60)}<small>hrs</small> {mins % 60}<small>mins</small></p>
    </section>;
  }
  if (phase === 'closed') return <section className="pg-phase pg-closed" aria-labelledby="pg-phase-title"><Icon size={24} d={MOON} />
    <h2 id="pg-phase-title">Voting has closed</h2>
    <p>Thank you for playing. Everyone’s answers are counted and the results arrive at {revealTime(schedule)}, {revealDay(schedule)}.</p>
    {data && <p className="pg-locked"><span><Icon size={16} d={LOCK} /></span>{answered ? `Your ${answered} ${answered === 1 ? 'answer is' : 'answers are'} locked in.` : 'You didn’t play this time.'}</p>}
  </section>;
  if (phase === 'revealed') {
    const scored = data?.polls.filter(p => p.mine && hasResults(p) && p.category !== 'quiz') ?? [];
    const quiz = data?.polls.filter(p => p.category === 'quiz' && p.mine && p.correct !== null) ?? [];
    const right = quiz.filter(p => p.mine?.[0] === String(p.correct)).length;
    return <section className="pg-phase pg-env is-opened" aria-labelledby="pg-phase-title"><Envelope open />
      <h2 id="pg-phase-title">The envelope is open</h2>
      <p>Here’s what everyone thought{answered ? ', and how you did' : ''}.</p>
      <div className="pg-stats">
        <span><b>{data?.players ?? '—'}</b>guests played</span>
        {answered ? <><span><b>{scored.filter(agreed).length} / {scored.length}</b>you matched</span>
          {quiz.length > 0 && <span><b>{right} / {quiz.length}</b>quiz score</span>}</>
          : <span className="pg-stat-note">You didn’t play this time, but here’s the verdict.</span>}
      </div>
    </section>;
  }
  return <section className="pg-phase pg-env" aria-labelledby="pg-phase-title"><Envelope />
    <h2 id="pg-phase-title">Sealed until after the wedding</h2>
    <p>Nobody sees the results yet, not even the couple. The envelope opens the morning after the wedding.</p>
    <span className="pg-date"><Icon size={16} d={ENVELOPE} />Opens {revealDay(schedule)}</span>
  </section>;
}

/** One line per result on reveal day; tap to see every option. */
function RevealRow({ poll }: { poll: Poll }) {
  const top = topOption(poll), winner = poll.options[top], mine = answerText(poll, poll.mine);
  const photo = poll.category === 'duel' ? couplePhoto(winner) : null, picture = poll.category === 'photo' ? poll.photoUrls?.[top] : null;
  const quiz = poll.category === 'quiz' && poll.correct !== null, right = quiz && poll.mine?.[0] === String(poll.correct);
  return <details className="pg-reveal-row">
    <summary>
      <span className="pg-winner">{photo ? <img src={photo.src} alt="" style={{ objectPosition: photo.position }} /> : picture ? <img src={picture} alt="" /> : <b>{String.fromCharCode(65 + (quiz ? poll.correct! : top))}</b>}</span>
      <span className="pg-reveal-q"><b>{poll.question}</b>
        <small>{quiz ? `Answer: ${poll.options[poll.correct!]}` : `Guests chose ${winner}`} · <em className={(quiz ? right : agreed(poll)) ? 'is-match' : ''}>{mine ? `You: ${mine}${(quiz ? right : agreed(poll)) ? ' ✓' : ''}` : 'You didn’t answer'}</em></small></span>
      <span className="pg-reveal-pct">{percent(poll, quiz ? poll.correct! : top)}%<small>{quiz ? 'got it right' : winner}</small></span>
    </summary>
    <ResultBars poll={poll} />
  </details>;
}

export default function WeddingPlayground({ event, base }: { event: EventInfo; base: string }) {
  const { data, error, loading, refresh, canAccess, user } = usePlayground(event.id, false, event.startsAt);
  const { activity: category } = useParams<{ activity: string }>();
  const { now, schedule, phase } = useSchedule(event, data);
  const heading = useRef<HTMLHeadingElement>(null);
  const [tab, setTab] = useState<string>(POLL_CATEGORIES[0].id);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [category]);
  const active = POLL_CATEGORIES.find(c => c.id === category);
  if (category && !active) return <Navigate to={`${base}/playground`} replace />;
  const errorLine = error && <p className="error" role="alert">{error} <button className="celebration-text-link" disabled={loading} onClick={() => void refresh()}>Try again</button></p>;

  if (!active) {
    const stats = POLL_CATEGORIES.map(c => {
      const polls = data?.polls.filter(p => p.category === c.id) ?? [];
      return { c, total: polls.length, answered: polls.filter(p => p.mine).length };
    });
    const played = stats.filter(s => s.answered > 0).length;
    const next = stats.find(s => s.total > s.answered && s.answered === 0) ?? stats.find(s => s.total > s.answered);
    const voting = phase === 'open' || phase === 'lastcall';
    const revealed = phase === 'revealed' && canAccess && data;
    const tabPolls = data?.polls.filter(p => p.category === tab && p.kind !== 'text') ?? [];
    return <section className="playground" aria-labelledby="playground-title" lang="en">
      <h1 id="playground-title" ref={heading} tabIndex={-1}>The Wedding <i>Playground</i></h1>
      <p className="pg-lead">{voting ? 'Play, predict and vote. Change your answers as often as you like until the wedding day ends.' : phase === 'closed' ? 'Voting is over for this wedding.' : 'The results are in.'}</p>
      <PhaseCard phase={phase} schedule={schedule} now={now} data={canAccess ? data : null} />
      {!canAccess ? <div className="pg-signin"><GoogleSignIn returnTo={`${base}/playground`} purpose="play, predict and vote" /></div>
        : data && voting && <div className="pg-progress" role="status"><b>{played}<small> / {POLL_CATEGORIES.length}</small></b><span>activities played.{next ? ` Try ${title(next.c, event)} next.` : ' You’ve played them all.'}</span></div>}
      {errorLine}
      {revealed ? <section className="pg-reveal" aria-label="Results">
        <div className="pg-tabs" role="tablist" aria-label="Activities">
          {POLL_CATEGORIES.map(c => <button key={c.id} type="button" role="tab" aria-selected={tab === c.id} onClick={() => setTab(c.id)}>{title(c, event)}</button>)}
        </div>
        <div className="pg-reveal-list" role="tabpanel">
          {tabPolls.length ? tabPolls.map(p => hasResults(p) ? <RevealRow key={p.id} poll={p} /> : <p key={p.id} className="pg-reveal-none"><b>{p.question}</b><small>No votes for this one.</small></p>)
            : <p className="pg-note">No questions in this activity.</p>}
        </div>
        <p className="pg-note">Tap a result to see every answer.</p>
      </section>
      : <nav className="pg-tiles" aria-label="Choose a playground activity">
        {stats.map(({ c, total, answered }) => {
          const status = !canAccess || !data ? null : total === 0 ? 'Opens soon' : !voting ? `${answered} of ${total} answered` : answered === total ? `Edit answers · ${answered} of ${total}` : answered ? `${answered} of ${total} answered` : `${total} ${total === 1 ? 'question' : 'questions'}`;
          return <Link key={c.id} className="pg-tile" to={`${base}/playground/${c.id}`}>
            <span className="pg-tile-icon"><Icon size={22} d={c.icon} /></span>
            <b>{title(c, event)}</b>
            <small>{c.short}</small>
            {status && <span className={`pg-chip${total > 0 && answered === total ? ' is-done' : ''}`}>{status}</span>}
          </Link>;
        })}
      </nav>}
    </section>;
  }

  const polls = data?.polls.filter(p => p.category === active.id) ?? [];
  const answered = polls.filter(p => p.mine).length;
  return <section className="playground pg-activity" aria-labelledby="playground-title" lang="en">
    <Link className="pg-back" to={`${base}/playground`}><Icon size={18} d="M15 6l-6 6 6 6" />All activities</Link>
    <h1 id="playground-title" ref={heading} tabIndex={-1}>{title(active, event)}</h1>
    {phase !== 'revealed' && <p className={`pg-strip${phase === 'lastcall' ? ' is-urgent' : ''}`}><Icon size={16} d={phase === 'closed' ? MOON : LOCK} />
      {phase === 'closed' ? <span>Voting has closed<b>Results {revealTime(schedule)}, {ist(schedule.revealAt, { day: 'numeric', month: 'short' })}</b></span>
        : <span>Results sealed<b>{timeLeft(schedule, now)} left to vote</b></span>}</p>}
    {!canAccess ? <div className="pg-signin"><GoogleSignIn returnTo={`${base}/playground/${active.id}`} purpose="play, predict and vote" /></div> : <>
      {errorLine}
      {!data && loading && <p className="pg-note" role="status">Getting the playground ready…</p>}
      {data && polls.length === 0 && <div className="pg-empty"><Icon size={28} d={active.icon} /><h2>{active.id === 'quiz' ? 'A few little secrets, coming soon.' : active.id === 'photo' ? 'First, let’s make some memories.' : 'New questions are on their way.'}</h2><p>{active.id === 'photo' ? 'The hosts will nominate wedding photos here. Then you choose your favourite.' : 'Check back soon.'}</p>{active.id === 'photo' && <Link to={`${base}/feed`}>Open the gallery</Link>}</div>}
      {data && polls.length > 0 && <>
        <div className="pg-sheet">
          {polls.map((poll, i) => phase === 'revealed'
            ? <article key={poll.id} className="pg-sq" data-poll-id={poll.id}><small>Question {i + 1}</small><h2>{poll.question}</h2>
              {hasResults(poll) ? <ResultBars poll={poll} /> : <p className="pg-note">{poll.mine ? `You picked ${answerText(poll, poll.mine)}. ` : ''}No results for this question.</p>}</article>
            : <SheetQuestion key={`${user?.id}:${poll.id}`} poll={poll} number={i + 1} event={event} closed={isClosed(poll, phase)} refresh={refresh} />)}
        </div>
        {phase === 'revealed' && active.id === 'quiz' && (() => { const q = polls.filter(p => p.correct !== null && p.mine), right = q.filter(p => p.mine?.[0] === String(p.correct)).length; return q.length ? <p className="pg-score"><b>{right} / {q.length}</b> · {quizTitle(Math.round(right / q.length * 100))}</p> : null; })()}
        {phase !== 'revealed' && <p className="pg-autosave" role="status"><i aria-hidden="true" />{phase === 'closed' ? `You answered ${answered} of ${polls.length}.` : `Every change saves on its own. ${answered} of ${polls.length} answered.`}</p>}
      </>}
    </>}
  </section>;
}

/** One question on the answer sheet. Taps save straight away; the latest tap always wins. */
function SheetQuestion({ poll, number, event, closed, refresh }: { poll: Poll; number: number; event: EventInfo; closed: boolean; refresh: () => Promise<void> }) {
  const [pending, setPending] = useState<string[] | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const queue = useRef<{ running: boolean; next: string[] | null }>({ running: false, next: null });
  const selected = pending ?? poll.mine ?? [];
  async function save(answer: string[]) {
    queue.current.next = answer;
    if (queue.current.running) return;
    queue.current.running = true;
    while (queue.current.next) {
      const sending = queue.current.next; queue.current.next = null;
      setState('saving'); setError(null);
      try { await celebration.vote(event.id, poll.id, sending, event.startsAt); }
      catch (e) { setState('error'); setError((e as Error).message); queue.current.running = false; return; }
    }
    queue.current.running = false;
    await refresh(); setPending(null); setState('idle');
  }
  const choose = (i: number) => {
    if (closed) return;
    const value = String(i);
    let answer = [value];
    if (poll.kind === 'multiple') { answer = selected.includes(value) ? selected.filter(x => x !== value) : [...selected, value]; if (!answer.length) return; }
    else if (selected.length === 1 && selected[0] === value && state !== 'error') return;
    setPending(answer); void save(answer);
  };
  const on = (i: number) => selected.includes(String(i));
  const couple = poll.category === 'duel' && poll.options.length === 2 && poll.options.every(o => couplePhoto(o));
  const label = `poll-${poll.id}`;
  return <article className={`pg-sq${closed ? ' is-closed' : ''}`} data-poll-id={poll.id} aria-busy={state === 'saving'}>
    <small>Question {number}</small>
    <h2 id={label}>{poll.question}</h2>
    {couple ? <div className="pg-seg" role="group" aria-labelledby={label}>
      {poll.options.map((option, i) => { const photo = couplePhoto(option)!; return <button type="button" key={i} aria-pressed={on(i)} disabled={closed} onClick={() => choose(i)}>
        <img src={photo.src} alt="" style={{ objectPosition: photo.position }} />{option}</button>; })}
    </div> : poll.category === 'photo' && poll.photoUrls?.some(Boolean) ? <div className="pg-photo-options" role="group" aria-labelledby={label}>
      {poll.options.map((option, i) => <button type="button" key={i} disabled={closed} aria-pressed={on(i)} onClick={() => choose(i)}>
        {poll.photoUrls?.[i] && <img src={poll.photoUrls[i]!} alt={option} loading="lazy" />}<span>{option}{on(i) && <b> · Your pick</b>}</span>
      </button>)}
    </div> : <div className="pg-options" role="group" aria-labelledby={label}>
      {poll.options.map((option, i) => <button type="button" key={i} disabled={closed} aria-pressed={on(i)} onClick={() => choose(i)}>
        <span className="pg-letter" aria-hidden="true">{on(i) ? '✓' : String.fromCharCode(65 + i)}</span><span className="pg-option-text">{option}</span>{on(i) && <em>Your answer</em>}
      </button>)}
    </div>}
    {state === 'error' ? <p className="error" role="alert">Not saved. {error} <button type="button" className="celebration-text-link" onClick={() => pending && void save(pending)}>Try again</button></p>
      : state === 'saving' ? <p className="pg-note" role="status">Saving…</p>
      : poll.kind === 'multiple' && !closed ? <p className="pg-note">Choose all that apply.</p> : null}
  </article>;
}

/** The invitation page's verdict: a small sealed envelope until the reveal, then the results. */
export function WeddingVerdict({ event, base }: { event: EventInfo; base: string }) {
  const { data, canAccess } = usePlayground(event.id, false, event.startsAt);
  const { schedule, phase } = useSchedule(event, data);
  const titleId = useId();
  const verdict = verdictPolls(data).slice(0, 1);
  if (phase === 'revealed' && canAccess && verdict.length) return <section className="pg-verdict pg-verdict-invite" aria-labelledby={titleId} lang="en">
    <div className="pg-section-head"><h2 id={titleId}>The wedding verdict</h2><Link to={`${base}/playground`}>All results</Link></div>
    <p className="pg-lead">The envelope is open. Here’s what the guests thought.</p>
    {verdict.map(p => <article key={p.id} className="pg-card"><h3>{p.question}</h3><ResultBars poll={p} /></article>)}
    <Link className="btn btn-deep btn-block pg-have-say" to={`${base}/playground`}><Icon size={18} d={PLAY_ICON} />See every result</Link>
  </section>;
  const players = canAccess ? data?.players ?? 0 : 0, over = phase === 'closed' || phase === 'revealed';
  return <section className="pg-invite-env" aria-labelledby={titleId} lang="en">
    <Envelope open={phase === 'revealed'} />
    <h2 id={titleId}>The wedding verdict</h2>
    <p>{phase === 'revealed' ? 'The envelope is open. See what everyone thought.' : over ? `Voting has closed. Opens ${revealDay(schedule)} at ${revealTime(schedule)}.` : `Sealed until the wedding is done. Opens ${revealDay(schedule)}.`}</p>
    {players > 0 && <span className="pg-date"><b>{players}</b>{players === 1 ? (over ? 'guest played' : 'guest has played so far') : (over ? 'guests played' : 'guests have played so far')}</span>}
    <Link className="btn btn-deep btn-block pg-have-say" to={`${base}/playground`}><Icon size={18} d={PLAY_ICON} />{over ? 'Open the Playground' : 'Play while it’s open'}</Link>
  </section>;
}
