import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { GoogleSignIn } from '../components/GoogleSignIn';
import { celebration } from '../lib/celebration';
import { POLL_CATEGORIES, quizTitle, type Playground, type Poll } from '../lib/celebrationTypes';
import type { EventInfo } from '../lib/types';
import { useGuestAuth } from '../lib/useGuestAuth';
import { Icon } from './Icon';
import './celebration.css';
import './playground.css';

const PLAY_ICON = 'M8 21h8M12 17v4M7 3h10v7a5 5 0 0 1-10 0V3M7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4';
// Anand vs Susmita answers use one fixed childhood photo each, from the Nostalgia album.
const COUPLE_PHOTOS: Record<string, { src: string; position: string }> = {
  anand: { src: '/images/nostalgia/anand-little-gentleman-480.jpg', position: '50% 20%' },
  susmita: { src: '/images/nostalgia/susmita-flowers-480.jpg', position: '50% 30%' },
};

export function usePlayground(eventId: string, admin = false) {
  const { canAccess, user } = useGuestAuth();
  const [data, setData] = useState<Playground | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    if (!canAccess) { setData(null); setError(null); return; }
    setLoading(true);
    try { const next = await celebration.playground(eventId, admin); if (request === sequence.current) { setData(next); setError(null); } }
    catch (e) { if (request === sequence.current) setError((e as Error).message); }
    finally { if (request === sequence.current) setLoading(false); }
  }, [eventId, admin, canAccess, user?.id]);
  useEffect(() => {
    setData(null); void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 20000);
    window.addEventListener('focus', refresh);
    return () => { sequence.current++; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [refresh]);
  return { data, error, loading, refresh, canAccess, user };
}

const isClosed = (poll: Poll) => poll.status !== 'open' || (!!poll.closesAt && Date.parse(poll.closesAt) <= Date.now());
const percent = (poll: Poll, i: number) => poll.total && poll.counts ? Math.round(poll.counts[i] / poll.total * 100) : 0;
const hasResults = (poll: Poll) => poll.kind !== 'text' && poll.counts !== null && (poll.total ?? 0) > 0;
const title = (category: typeof POLL_CATEGORIES[number], event: EventInfo) => category.id === 'duel' ? `${event.coupleA} vs ${event.coupleB}` : category.title;

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

export default function WeddingPlayground({ event, base }: { event: EventInfo; base: string }) {
  const { data, error, loading, refresh, canAccess, user } = usePlayground(event.id);
  const { activity: category } = useParams<{ activity: string }>();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [category]);
  const active = POLL_CATEGORIES.find(c => c.id === category);
  if (category && !active) return <Navigate to={`${base}/playground`} replace />;

  if (!active) {
    const stats = POLL_CATEGORIES.map(c => {
      const polls = data?.polls.filter(p => p.category === c.id) ?? [];
      return { c, total: polls.length, answered: polls.filter(p => p.mine).length, open: polls.filter(p => !isClosed(p) && !p.mine).length };
    });
    const played = stats.filter(s => s.answered > 0).length;
    const next = stats.find(s => s.open > 0 && s.answered === 0) ?? stats.find(s => s.open > 0);
    const verdict = verdictPolls(data);
    return <section className="playground" aria-labelledby="playground-title" lang="en">
      <h1 id="playground-title" ref={heading} tabIndex={-1}>The Wedding <i>Playground</i></h1>
      <p className="pg-lead">Play, predict and vote. Your answers stay private; only totals are shown.</p>
      {!canAccess ? <div className="pg-signin"><GoogleSignIn returnTo={`${base}/playground`} purpose="play, predict and vote" /></div>
        : data && <div className="pg-progress" role="status"><b>{played}<small> / {POLL_CATEGORIES.length}</small></b><span>activities played.{next ? ` Try ${title(next.c, event)} next.` : ' You’ve played them all.'}</span></div>}
      {error && <p className="error" role="alert">{error} <button className="celebration-text-link" disabled={loading} onClick={() => void refresh()}>Try again</button></p>}
      <nav className="pg-tiles" aria-label="Choose a playground activity">
        {stats.map(({ c, total, answered }) => {
          const status = !canAccess || !data ? null : total === 0 ? 'Opens soon' : answered === total ? `Played · ${answered} of ${total}` : answered ? `${answered} of ${total} answered` : `${total} ${total === 1 ? 'question' : 'questions'}`;
          return <Link key={c.id} className="pg-tile" to={`${base}/playground/${c.id}`}>
            <span className="pg-tile-icon"><Icon size={22} d={c.icon} /></span>
            <b>{title(c, event)}</b>
            <small>{c.short}</small>
            {status && <span className={`pg-chip${total > 0 && answered === total ? ' is-done' : ''}`}>{status}</span>}
          </Link>;
        })}
      </nav>
      {canAccess && verdict.length > 0 && <section className="pg-verdict" aria-labelledby="pg-verdict-title">
        <div className="pg-section-head"><h2 id="pg-verdict-title">The wedding verdict</h2><span>{loading ? 'Updating…' : 'Updated just now'}</span></div>
        {verdict.map(p => <article key={p.id} className="pg-card"><h3>{p.question}</h3><ResultBars poll={p} /></article>)}
      </section>}
    </section>;
  }

  const polls = data?.polls.filter(p => p.category === active.id) ?? [];
  const current = polls.find(p => !isClosed(p) && !p.mine);
  const position = current ? polls.indexOf(current) + 1 : polls.length;
  const answered = polls.filter(p => p.mine || isClosed(p));
  const revealDate = new Date(event.startsAt); revealDate.setUTCFullYear(revealDate.getUTCFullYear() + 1);
  const quiz = active.id === 'quiz' ? polls : [];
  const quizRevealed = quiz.filter(p => p.correct !== null && p.mine);
  const quizCorrect = quizRevealed.filter(p => p.mine?.[0] === String(p.correct)).length;
  return <section className="playground pg-activity" aria-labelledby="playground-title" lang="en">
    <Link className="pg-back" to={`${base}/playground`}><Icon size={18} d="M15 6l-6 6 6 6" />All activities</Link>
    <h1 id="playground-title" ref={heading} tabIndex={-1}>{title(active, event)}</h1>
    {active.id === 'prediction' && <div className="pg-capsule"><span><Icon size={20} d="M4 5h16v15H4zM4 10h16M9 3v4M15 3v4" /></span><p><b>A time capsule.</b> Your guesses stay sealed until our first anniversary, {revealDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })}.</p></div>}
    {!canAccess ? <div className="pg-signin"><GoogleSignIn returnTo={`${base}/playground/${active.id}`} purpose="play, predict and vote" /></div> : <>
      {error && <p className="error" role="alert">{error} <button className="celebration-text-link" disabled={loading} onClick={() => void refresh()}>Try again</button></p>}
      {!data && loading && <p className="pg-note" role="status">Getting the playground ready…</p>}
      {data && polls.length === 0 && <div className="pg-empty"><Icon size={28} d={active.icon} /><h2>{active.id === 'quiz' ? 'A few little secrets, coming soon.' : active.id === 'photo' ? 'First, let’s make some memories.' : 'New questions are on their way.'}</h2><p>{active.id === 'photo' ? 'The hosts will nominate wedding photos here. Then you choose your favourite.' : 'Check back soon.'}</p>{active.id === 'photo' && <Link to={`${base}/feed`}>Open the gallery</Link>}</div>}
      {data && polls.length > 0 && <>
        <div className="pg-steps"><span>{current ? `Question ${position} of ${polls.length}` : `All ${polls.length} answered`}</span><span className="pg-steps-track" aria-hidden="true"><span style={{ width: `${(current ? position - 1 : polls.length) / polls.length * 100}%` }} /></span></div>
        {active.id === 'quiz' && quizRevealed.length === quiz.length && answered.length === quiz.length && <p className="pg-score"><b>{quizCorrect} / {quiz.length}</b> · {quizTitle(Math.round(quizCorrect / quiz.length * 100))}</p>}
        {current ? <PollStep key={`${user?.id}:${current.id}`} poll={current} event={event} refresh={refresh} />
          : <div className="pg-done"><Icon size={26} d="m5 12.5 4.5 4.5L19 7.5" /><p>{active.id === 'prediction' ? 'Your predictions are sealed. See you on our anniversary.' : 'You’ve answered every question. Results update as guests vote.'}</p></div>}
        {answered.length > 0 && <section className="pg-answers" aria-labelledby="pg-answers-title">
          <h2 id="pg-answers-title">Your answers so far</h2>
          {answered.map(p => <article key={p.id} className="pg-card"><h3>{p.question}</h3>
            {hasResults(p) ? <ResultBars poll={p} /> : <p className="pg-note">{p.mine ? `You picked ${p.mine.map(i => p.options[Number(i)]).filter(Boolean).join(', ')}. ` : ''}{p.results === 'closed' ? 'Results appear after the reveal.' : 'Voting is closed.'}</p>}
          </article>)}
        </section>}
      </>}
    </>}
  </section>;
}

/** One question at a time. Anand vs Susmita uses photo choices; predictions are sealed with a button. */
function PollStep({ poll, event, refresh }: { poll: Poll; event: EventInfo; refresh: () => Promise<void> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const confirmFirst = poll.kind === 'multiple' || poll.category === 'prediction';
  async function vote(answer: string[]) {
    if (lock.current || !answer.length) return;
    lock.current = true; setBusy(true); setError(null);
    try { await celebration.vote(event.id, poll.id, answer); await refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  const choose = (i: number) => {
    const value = String(i);
    if (poll.kind === 'multiple') setSelected(s => s.includes(value) ? s.filter(x => x !== value) : [...s, value]);
    else if (confirmFirst) setSelected([value]);
    else void vote([value]);
  };
  const couple = poll.category === 'duel' && poll.options.every(o => COUPLE_PHOTOS[o.trim().toLowerCase()]);
  return <article className="pg-question" aria-busy={busy}>
    <h2 id={`poll-${poll.id}`}>{poll.question}</h2>
    {couple ? <div className="pg-faces" role="group" aria-labelledby={`poll-${poll.id}`}>
      {poll.options.map((option, i) => {
        const photo = COUPLE_PHOTOS[option.trim().toLowerCase()];
        return <button type="button" key={i} disabled={busy} onClick={() => choose(i)}>
          <span><img src={photo.src} alt="" style={{ objectPosition: photo.position }} /></span><b>{option}</b>
        </button>;
      })}
    </div> : poll.category === 'photo' && poll.photoUrls?.some(Boolean) ? <div className="pg-photo-options" role="group" aria-labelledby={`poll-${poll.id}`}>
      {poll.options.map((option, i) => <button type="button" key={i} disabled={busy} aria-pressed={selected.includes(String(i))} onClick={() => choose(i)}>
        {poll.photoUrls?.[i] && <img src={poll.photoUrls[i]!} alt={option} loading="lazy" />}<span>{option}</span>
      </button>)}
    </div> : <div className="pg-options" role="group" aria-labelledby={`poll-${poll.id}`}>
      {poll.options.map((option, i) => {
        const on = selected.includes(String(i));
        return <button type="button" key={i} disabled={busy} aria-pressed={on} onClick={() => choose(i)}>
          <span className="pg-letter" aria-hidden="true">{on && poll.kind === 'multiple' ? '✓' : String.fromCharCode(65 + i)}</span>{option}
        </button>;
      })}
    </div>}
    {confirmFirst && <button type="button" className="btn btn-primary btn-block pg-confirm" disabled={busy || !selected.length} onClick={() => void vote(selected)}>
      {busy ? 'Saving…' : poll.category === 'prediction' ? 'Seal my prediction' : 'Save my choices'}</button>}
    <p className="pg-note">{couple ? 'Tap a photo to vote. ' : ''}{poll.category === 'quiz' ? 'One try per question.' : poll.category === 'prediction' ? 'Your guess stays sealed until the reveal.' : poll.results === 'closed' ? 'Results appear after the reveal.' : 'The guest verdict shows right after you vote.'}</p>
    {error && <p className="error" role="alert">{error}</p>}
  </article>;
}

/** The invitation page's verdict: live results, or one short row inviting guests to play. */
export function WeddingVerdict({ eventId, base }: { eventId: string; base: string }) {
  const { data, canAccess } = usePlayground(eventId);
  const titleId = useId();
  const verdict = verdictPolls(data).slice(0, 1);
  if (!canAccess || !verdict.length) return <Link className="pg-teaser" to={`${base}/playground`} lang="en">
    <span className="pg-tile-icon"><Icon size={22} d={PLAY_ICON} /></span>
    <span><b>The Wedding Playground</b><small>{canAccess ? 'Be the first to vote. Results appear here.' : 'Play, predict and vote with the other guests.'}</small></span>
    <Icon size={18} d="m9 6 6 6-6 6" />
  </Link>;
  return <section className="pg-verdict pg-verdict-invite" aria-labelledby={titleId} lang="en">
    <div className="pg-section-head"><h2 id={titleId}>The wedding verdict</h2><Link to={`${base}/playground`}>Play</Link></div>
    <p className="pg-lead">What the guests think so far.</p>
    {verdict.map(p => <article key={p.id} className="pg-card"><h3>{p.question}</h3><ResultBars poll={p} /></article>)}
    <Link className="btn btn-deep btn-block pg-have-say" to={`${base}/playground`}><Icon size={18} d={PLAY_ICON} />Have your say</Link>
  </section>;
}
