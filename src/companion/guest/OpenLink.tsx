// Event PIN → family lookup → join or request access.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, setSession } from '../lib/backend';
import type { ListMatch } from '../lib/types';
import { WEDDING_SLUG } from '../lib/wedding';
import { WeddingMark, WeddingTextile } from '../components/WeddingBrand';
import './entry.css';

type Step = 'pin' | 'find' | 'new' | 'ask';

export default function OpenLink() {
  const { slug = WEDDING_SLUG } = useParams();
  const nav = useNavigate();
  const [step, setStep] = useState<Step>('pin');
  const [pin, setPin] = useState('');
  const [query, setQuery] = useState('');
  const [phone, setPhone] = useState('');
  const [matches, setMatches] = useState<ListMatch[] | null>(null);
  const [count, setCount] = useState(1);
  const [names, setNames] = useState<string[]>(['']);
  const [family, setFamily] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [step]);

  const move = (next: Step) => { setErr(null); setStep(next); };
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };
  const checkPin = () => run(async () => {
    await api.findOnList(slug, pin, '', undefined);
    move('find');
  });
  const search = () => run(async () => setMatches(await api.findOnList(slug, pin, query.trim(), phone.trim() || undefined)));
  const pick = (m: ListMatch) => run(async () => {
    const pid = await api.claimPerson(m.householdToken, m.personId);
    const b = await api.inviteBundle(m.householdToken);
    if (!b) throw new Error('This invitation is unavailable. Please ask the hosts for a new link.');
    setSession({ eventId: b.event.id, slug, householdToken: m.householdToken, personId: pid });
    nav(`/i/${m.householdToken}?edit=1`);
  });
  const join = () => run(async () => {
    const people = names.slice(0, count).map(name => ({ name: name.trim() }));
    if (people.some(p => !p.name)) throw new Error('Please add a name for each family member.');
    const r = await api.openJoin(slug, pin, family.trim() || `${people[0].name}'s family`, people, phone.trim() || undefined);
    const b = await api.inviteBundle(r.householdToken);
    if (!b) throw new Error('Could not open your invitation. Please find your family again.');
    setSession({ eventId: b.event.id, slug, householdToken: r.householdToken, personId: r.personId });
    nav(`/i/${r.householdToken}?edit=1`);
  });
  const ask = () => run(async () => { await api.requestAccess(slug, names[0].trim(), phone.trim(), note.trim()); setDone(true); });
  const setCountN = (n: number) => {
    const c = Math.max(1, Math.min(8, n)); setCount(c);
    setNames(a => Array.from({ length: c }, (_, i) => a[i] ?? ''));
  };
  const title = step === 'pin' ? 'Welcome to the wedding' : step === 'find' ? 'Find your family' : step === 'new' ? 'Add your family' : done ? 'Your request is sent' : 'Ask the hosts';

  return <main className="entry-shell" lang="en">
    <header className="entry-top"><a href="/" aria-label="Anand and Susmita — wedding invitation"><WeddingMark /></a><a href="/">View invitation →</a></header>
    <section className="entry-card" aria-labelledby="entry-title" aria-busy={busy}>
      <p className="entry-eyebrow">Family RSVP{step === 'pin' ? ' · Welcome' : step === 'find' ? ' · Find your invitation' : step === 'new' ? ' · Your family' : ' · Host access'}</p>
      <h1 id="entry-title" ref={heading} tabIndex={-1}>{title}</h1>
      {step === 'pin' && <>
        <p className="entry-description">Enter the 6-digit wedding PIN from your invitation message.</p>
        <form className="entry-form" onSubmit={e => { e.preventDefault(); void checkPin(); }}>
          <div className="field"><label htmlFor="pin">Wedding PIN</label><input id="pin" className="input entry-pin" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} value={pin} disabled={busy} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="6-digit PIN" /></div>
          <button className="btn btn-primary btn-block" disabled={busy || pin.length !== 6}>{busy ? 'Checking…' : 'Open the wedding'}</button>
          <button type="button" className="linkbtn" disabled={busy} onClick={() => move('ask')}>No PIN? Ask the hosts</button>
        </form>
      </>}
      {step === 'find' && <>
        <p className="entry-description">Search the guest list using your name or WhatsApp number.</p>
        <form className="entry-form" onSubmit={e => { e.preventDefault(); void search(); }}>
          <div className="field"><label htmlFor="q">Your name</label><input id="q" className="input" value={query} disabled={busy} onChange={e => { setQuery(e.target.value); setMatches(null); }} autoComplete="name" /></div>
          <div className="field"><label htmlFor="ph">WhatsApp number (optional)</label><input id="ph" className="input" type="tel" value={phone} disabled={busy} onChange={e => { setPhone(e.target.value); setMatches(null); }} autoComplete="tel" /></div>
          <button className="btn btn-primary btn-block" disabled={busy || (!query.trim() && !phone.trim())}>{busy ? 'Looking…' : 'Find me'}</button>
        </form>
        {matches && <div className="entry-results" aria-label="Matching guests">
          <p role="status">{matches.length ? 'Select your name to open your family invitation.' : 'We couldn’t find your family. You can add your names below.'}</p>
          {matches.map(m => <button key={m.personId} className="entry-match" onClick={() => void pick(m)} disabled={busy}><span><b>{m.name}</b><small>{m.household}</small></span><span aria-hidden="true">→</span></button>)}
          <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => move('new')}>I’m not on the list — join</button>
        </div>}
        <button className="linkbtn entry-back" disabled={busy} onClick={() => move('pin')}>← Back to PIN</button>
      </>}
      {step === 'new' && <>
        <p className="entry-description">Add everyone in your family, including elders and children. You’ll choose who is attending next.</p>
        <form className="entry-form" onSubmit={e => { e.preventDefault(); void join(); }}>
          <fieldset className="entry-count"><legend>Family members</legend><div><button type="button" className="chip" aria-label="Fewer" disabled={busy || count <= 1} onClick={() => setCountN(count - 1)}>−</button><output aria-live="polite">{count}</output><button type="button" className="chip" aria-label="More" disabled={busy || count >= 8} onClick={() => setCountN(count + 1)}>+</button><span>Up to 8 people</span></div></fieldset>
          {names.map((n, i) => <div className="field" key={i}><label htmlFor={`n${i}`}>{i === 0 ? 'Your name' : `Person ${i + 1}`}</label><input id={`n${i}`} className="input" required maxLength={200} autoComplete={i === 0 ? 'name' : 'off'} value={n} disabled={busy} onChange={e => setNames(a => a.map((x, j) => j === i ? e.target.value : x))} /></div>)}
          <div className="field"><label htmlFor="fam">Family name (optional)</label><input id="fam" className="input" maxLength={200} placeholder="e.g. Kulkarni family" value={family} disabled={busy} onChange={e => setFamily(e.target.value)} /></div>
          <div className="field"><label htmlFor="ph2">WhatsApp number (optional)</label><input id="ph2" className="input" type="tel" autoComplete="tel" value={phone} disabled={busy} onChange={e => setPhone(e.target.value)} /></div>
          <div className="entry-actions"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => move('find')}>Back</button><button className="btn btn-primary" disabled={busy || names.some(n => !n.trim())}>{busy ? 'Joining…' : 'Join the wedding'}</button></div>
        </form>
      </>}
      {step === 'ask' && <>
        {done ? <p className="entry-notice" role="status">The hosts have your request. They’ll share the wedding PIN with you.</p> : <>
          <p className="entry-description">Tell the hosts who you are so they can share your invitation.</p>
          <form className="entry-form" onSubmit={e => { e.preventDefault(); void ask(); }}>
            <div className="field"><label htmlFor="an">Your name</label><input id="an" className="input" required maxLength={200} autoComplete="name" value={names[0]} disabled={busy} onChange={e => setNames(a => [e.target.value, ...a.slice(1)])} /></div>
            <div className="field"><label htmlFor="ap">WhatsApp number</label><input id="ap" className="input" type="tel" autoComplete="tel" value={phone} disabled={busy} onChange={e => setPhone(e.target.value)} /></div>
            <div className="field"><label htmlFor="nt">How do you know the couple?</label><textarea id="nt" className="input" value={note} disabled={busy} onChange={e => setNote(e.target.value)} /></div>
            <button className="btn btn-primary btn-block" disabled={busy || !names[0].trim()}>{busy ? 'Sending…' : 'Send request'}</button>
          </form>
        </>}
        <button className="linkbtn entry-back" disabled={busy} onClick={() => move('pin')}>← Back to PIN</button>
      </>}
      {err && <p className="error" role="alert">{err}</p>}
    </section>
    <div className="entry-footer"><p>One invitation. A whole family. A day to remember.</p><WeddingTextile /></div>
  </main>;
}
