// Open link + new-phone recovery: event PIN → find yourself on the host's list → or join as a new family.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, setSession } from '../lib/backend';
import type { ListMatch } from '../lib/types';
import { WEDDING_SLUG } from '../lib/wedding';
import { WeddingMark, WeddingTextile } from '../components/WeddingBrand';

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

  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };

  const checkPin = () => run(async () => {
    await api.findOnList(slug, pin, '', undefined);   // validates the PIN (throws if wrong / locked)
    setStep('find');
  });
  const search = () => run(async () => setMatches(await api.findOnList(slug, pin, query, phone || undefined)));
  const pick = (m: ListMatch) => run(async () => {
    const pid = await api.claimPerson(m.householdToken, m.personId);
    const b = await api.inviteBundle(m.householdToken);
    setSession({ eventId: b!.event.id, slug, householdToken: m.householdToken, personId: pid });
    nav(`/i/${m.householdToken}?edit=1`);
  });
  const join = () => run(async () => {
    const people = names.slice(0, count).map(n => n.trim()).filter(Boolean).map(name => ({ name }));
    if (!people.length) throw new Error('Add at least one name');
    const r = await api.openJoin(slug, pin, family.trim() || `${people[0].name}'s family`, people, phone || undefined);
    const b = await api.inviteBundle(r.householdToken);
    setSession({ eventId: b!.event.id, slug, householdToken: r.householdToken, personId: r.personId });
    nav(`/i/${r.householdToken}?edit=1`);
  });
  const ask = () => run(async () => { await api.requestAccess(slug, names[0] || 'Guest', phone, note); setDone(true); });

  const setCountN = (n: number) => { const c = Math.max(1, Math.min(8, n)); setCount(c); setNames(a => Array.from({ length: c }, (_, i) => a[i] ?? '')); };

  return (
    <div className="phone" style={{ padding: '32px 22px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: '100dvh' }}>
      <div className="wedding-entry-masthead">
        <a href="/" aria-label="Anand and Susmita — wedding invitation"><WeddingMark /></a>
        <WeddingTextile />
      </div>

      {step === 'pin' && (<>
        <p className="eb" lang="en">Wedding invitation</p>
        <h1 className="kn-h" style={{ fontSize: 34, color: 'var(--deep)' }}>ಬನ್ನಿ! ಸ್ವಾಗತ</h1>
        <p lang="en" style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: 'var(--muted)' }}>Enter the 6-digit wedding PIN from your invitation message.</p>
        <div className="field" lang="en"><label htmlFor="pin">Wedding PIN</label>
          <input id="pin" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            style={{ fontSize: 24, letterSpacing: '.3em', textAlign: 'center' }} /></div>
        <button className="btn btn-primary btn-block" disabled={busy || pin.length !== 6} onClick={checkPin} lang="en">{busy ? 'Checking…' : 'Open the wedding'}</button>
        {err && <p className="error" role="alert">{err}</p>}
        <button className="linkbtn" onClick={() => setStep('ask')} lang="en">No PIN? Ask the hosts</button>
      </>)}

      {step === 'find' && (<>
        <h1 className="kn-h" style={{ fontSize: 32, color: 'var(--deep)' }}>ನೀವು ಯಾರು?</h1>
        <p lang="en" style={{ margin: 0, fontSize: 16, color: 'var(--muted)' }}>Let's find you on the family's guest list.</p>
        <div className="field" lang="en"><label htmlFor="q">Your name</label><input id="q" className="input" value={query} onChange={e => setQuery(e.target.value)} autoComplete="name" /></div>
        <div className="field" lang="en"><label htmlFor="ph">WhatsApp number (optional)</label><input id="ph" className="input" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel-national" /></div>
        <button className="btn btn-primary btn-block" disabled={busy || (!query.trim() && !phone.trim())} onClick={search} lang="en">{busy ? 'Looking…' : 'Find me'}</button>
        {matches && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} lang="en">
            {matches.length === 0 && <p style={{ margin: 0 }}>We couldn't find you — no problem.</p>}
            {matches.map(m => (
              <button key={m.personId} className="card" style={{ padding: '12px 14px', textAlign: 'left', minHeight: 56, cursor: 'pointer' }} onClick={() => pick(m)} disabled={busy}>
                <b>{m.name}</b> <span style={{ color: 'var(--muted)' }}>· {m.household}</span>
              </button>
            ))}
            <button className="btn btn-ghost" onClick={() => setStep('new')}>I'm not on the list — join</button>
          </div>
        )}
        {err && <p className="error" role="alert">{err}</p>}
      </>)}

      {step === 'new' && (<>
        <h1 className="kn-h" style={{ fontSize: 32, color: 'var(--deep)' }}>ಎಷ್ಟು ಜನ ಬರ್ತೀರಾ?</h1>
        <p lang="en" style={{ margin: 0, fontSize: 16, color: 'var(--muted)' }}>How many of you are coming? Add each name — elders and kids too.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} lang="en">
          <button className="chip" aria-label="Fewer" onClick={() => setCountN(count - 1)} style={{ width: 48, height: 48 }}>−</button>
          <span style={{ fontSize: 28, fontWeight: 700, minWidth: 32, textAlign: 'center' }} aria-live="polite">{count}</span>
          <button className="chip" aria-label="More" onClick={() => setCountN(count + 1)} style={{ width: 48, height: 48 }}>+</button>
        </div>
        {names.map((n, i) => (
          <div className="field" key={i} lang="en"><label htmlFor={`n${i}`}>{i === 0 ? 'Your name' : `Person ${i + 1}`}</label>
            <input id={`n${i}`} className="input" value={n} onChange={e => setNames(a => a.map((x, j) => j === i ? e.target.value : x))} /></div>
        ))}
        <div className="field" lang="en"><label htmlFor="fam">Family name (optional)</label><input id="fam" className="input" placeholder="e.g. Kulkarni family" value={family} onChange={e => setFamily(e.target.value)} /></div>
        <div className="field" lang="en"><label htmlFor="ph2">Your WhatsApp number (optional)</label><input id="ph2" className="input" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} /></div>
        <button className="btn btn-primary btn-block" disabled={busy} onClick={join} lang="en">{busy ? 'Joining…' : 'Join the wedding'}</button>
        {err && <p className="error" role="alert">{err}</p>}
      </>)}

      {step === 'ask' && (<>
        <h1 className="kn-h" style={{ fontSize: 30, color: 'var(--deep)' }}>ಆತಿಥೇಯರನ್ನು ಕೇಳಿ</h1>
        {done ? <p lang="en" style={{ margin: 0, fontSize: 16 }}>Sent! The family will let you in shortly.</p> : (<>
          <p lang="en" style={{ margin: 0, fontSize: 16, color: 'var(--muted)' }}>Tell the family who you are and they'll let you in.</p>
          <div className="field" lang="en"><label htmlFor="an">Your name</label><input id="an" className="input" value={names[0]} onChange={e => setNames(a => [e.target.value, ...a.slice(1)])} /></div>
          <div className="field" lang="en"><label htmlFor="ap">WhatsApp number</label><input id="ap" className="input" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} /></div>
          <div className="field" lang="en"><label htmlFor="nt">How do you know the couple?</label><input id="nt" className="input" value={note} onChange={e => setNote(e.target.value)} /></div>
          <button className="btn btn-primary btn-block" disabled={busy || !names[0]} onClick={ask} lang="en">Send request</button>
        </>)}
        {err && <p className="error" role="alert">{err}</p>}
        <button className="linkbtn" onClick={() => setStep('pin')} lang="en">← Back to PIN</button>
      </>)}
    </div>
  );
}
