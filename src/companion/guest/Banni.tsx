import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getSession, setSession } from '../lib/backend';
import { fmtDate, fmtTime } from '../lib/format';
import type { InviteBundle, Stay, Travel } from '../lib/types';
import WeddingBrand from '../components/WeddingBrand';
import './rsvp.css';

const windows = ['Day before · morning', 'Day before · evening', 'Wedding day · early', 'Wedding day · morning', 'Not sure yet'];
export default function Banni() {
  const { token = '' } = useParams();
  const [b, setB] = useState<InviteBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [person, setPerson] = useState('');
  const [coming, setComing] = useState<'yes' | 'no' | ''>('');
  const [selected, setSelected] = useState<string[]>([]);
  const [functions, setFunctions] = useState<string[]>([]);
  const [travel, setTravel] = useState<Travel | null>(null);
  const [stayChoice, setStayChoice] = useState<'own' | 'hosts' | 'later' | ''>('');
  const [nights, setNights] = useState<string[]>([]);
  const [blessing, setBlessing] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const toggle = (xs: string[], x: string) => xs.includes(x) ? xs.filter(y => y !== x) : [...xs, x];
  useEffect(() => {
    let alive = true;
    api.inviteBundle(token).then(data => {
      if (!alive) return;
      if (!data) { setError('We could not find this invitation. Please ask the hosts to send your link again.'); return; }
      setB(data);
      const session = getSession();
      setPerson(session?.householdToken === token && data.people.some(p => p.id === session.personId) ? session.personId : data.people.length === 1 ? data.people[0].id : '');
      setComing(data.household.coming ?? '');
      setSelected(data.household.coming ? data.people.filter(p => p.attending.length).map(p => p.id) : data.people.map(p => p.id));
      setFunctions(data.household.coming === 'yes' ? [...new Set(data.people.flatMap(p => p.attending))] : data.functions.map(f => f.id));
      setTravel(data.household.travel);
      setStayChoice(data.household.stay?.manage ? 'own' : data.household.stay?.nights.length ? 'hosts' : '');
      setNights(data.household.stay?.nights ?? []);
      setBlessing(data.household.blessing ?? '');
    }).catch(e => alive && setError(e.message)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [token]);
  if (!b) return <main className="rsvp-shell" lang="en"><WeddingBrand tagline="Family RSVP" /><div className="rsvp-card">{loading ? <p role="status">Opening your invitation…</p> : <><h1>Invitation unavailable</h1><p role="alert">{error}</p><Link className="btn btn-primary" to="/rsvp">Find my family</Link></>}</div></main>;
  const names = b.people.filter(p => selected.includes(p.id));
  const stay: Stay | null = stayChoice === 'own' ? { manage: true, nights: [] } : stayChoice === 'hosts' ? { manage: false, nights } : null;
  const move = (n: number) => { setError(''); setStep(n); window.scrollTo({ top: 0, behavior: 'instant' }); };
  const next = () => {
    if (step === 0) {
      if (!person || !coming) return setError('Please choose your name and tell us whether your family can attend.');
      if (coming === 'yes' && (!selected.length || !functions.length)) return setError('Please select at least one guest and one event.');
      move(coming === 'yes' ? 1 : 2);
    } else if (step === 1) {
      if (travel && travel.mode !== 'near' && !travel.window) return setError('Please choose an arrival time.');
      if (!stayChoice || (stayChoice === 'hosts' && !nights.length)) return setError('Please choose an accommodation option and the nights you need.');
      move(2);
    }
  };
  const save = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await api.claimPerson(token, person);
      setSession({ eventId: b.event.id, slug: b.event.slug, householdToken: token, personId: person });
      await api.saveRsvp(b.event.id, { requestId, coming: coming as 'yes' | 'no', attendance: b.people.map(p => ({ personId: p.id, functionIds: coming === 'yes' && selected.includes(p.id) ? functions : [] })), travel: coming === 'yes' ? travel : null, stay: coming === 'yes' ? stay : null, blessing: blessing.trim(), summary: coming === 'yes' ? `RSVP: ${names.length} coming (${names.map(p => p.name).join(', ')}) · ${travel?.mode ?? 'travel to be confirmed'} · ${stayChoice === 'hosts' ? `stay ${nights.join(', ')}` : stayChoice === 'own' ? 'own stay' : 'stay to be confirmed'}` : 'RSVP: unable to attend' });
      move(3);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="rsvp-shell" lang="en"><header className="rsvp-top"><WeddingBrand tagline="Family RSVP" /><a href="/">View invitation →</a></header><main className="rsvp-layout"><aside className="rsvp-invite"><p>WITH LOVE, YOU’RE INVITED</p><h1>{b.event.coupleA} <i>&amp;</i> {b.event.coupleB}</h1><p>{fmtDate(b.event.startsAt)}<br />{fmtTime(b.event.startsAt)} IST</p><p>{b.event.venue}</p></aside><section className="rsvp-card">
    {step < 3 && <div className="rsvp-progress">{coming === 'no' ? `Step ${step === 0 ? 1 : 2} of 2` : `Step ${step + 1} of 3`} · {step === 0 ? 'Your reply' : step === 1 ? 'Arrival & stay' : 'Review'}</div>}
    <p className="rsvp-eyebrow">{b.household.name}</p><h2>{step === 0 ? 'Will you join us?' : step === 1 ? 'Let’s plan your visit.' : step === 2 ? 'Everything look right?' : coming === 'yes' ? 'We can’t wait to see you.' : 'Thank you for letting us know.'}</h2>
    <p>{step === 0 ? 'One reply is all we need for your family.' : step === 1 ? 'Tell us about your arrival and accommodation. You can update your plans later.' : step === 2 ? 'Review your details before sending them to the hosts.' : 'Your reply has been saved. You can update it whenever your plans change.'}</p>
    {step === 0 && <div className="rsvp-fields"><label>Who is replying?<select className="input" value={person} onChange={e => setPerson(e.target.value)}><option value="">Choose your name</option>{b.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><fieldset><legend>Can your family attend?</legend>{[['yes', 'Yes, we’ll be there'], ['no', 'Sorry, we can’t attend']].map(([v, label]) => <label className="rsvp-option" key={v}><input type="radio" name="coming" checked={coming === v} onChange={() => setComing(v as 'yes' | 'no')} />{label}</label>)}</fieldset>{coming === 'yes' && <><fieldset><legend>Who is coming?</legend><p>Select everyone attending, including children.</p>{b.people.map(p => <label className="rsvp-option" key={p.id}><input type="checkbox" checked={selected.includes(p.id)} onChange={() => setSelected(toggle(selected, p.id))} />{p.name}{p.isChild ? ' · Child' : ''}</label>)}</fieldset>{b.functions.length > 1 && <fieldset><legend>Which events will you attend?</legend>{b.functions.map(f => <label className="rsvp-option" key={f.id}><input type="checkbox" checked={functions.includes(f.id)} onChange={() => setFunctions(toggle(functions, f.id))} />{f.nameEn}</label>)}</fieldset>}<p>Need to add someone? Please ask the hosts to update your family list.</p></>}{coming === 'no' && <label>Message to the hosts (optional)<textarea className="input" value={blessing} onChange={e => setBlessing(e.target.value)} /></label>}</div>}
    {step === 1 && <div className="rsvp-fields"><fieldset><legend>How will you get here?</legend>{(['near', 'car', 'train', 'bus', 'flight'] as const).map(mode => <label className="rsvp-option" key={mode}><input type="radio" name="travel" checked={travel?.mode === mode} onChange={() => setTravel({ mode, ...(mode !== 'near' ? { point: b.event.theme.travelPoints?.[mode] } : {}) })} />{mode === 'near' ? 'We live nearby' : mode[0].toUpperCase() + mode.slice(1)}</label>)}<label className="rsvp-option"><input type="radio" name="travel" checked={!travel} onChange={() => setTravel(null)} />Not decided yet</label></fieldset>{travel && travel.mode !== 'near' && <><label>When will you arrive?<select className="input" value={travel.window ?? ''} onChange={e => setTravel({ ...travel, window: e.target.value })}><option value="">Choose an arrival time</option>{travel.window && !windows.includes(travel.window) && <option>{travel.window}</option>}{windows.map(w => <option key={w}>{w}</option>)}</select></label><label>Arrival location (optional)<input className="input" value={travel.point ?? ''} onChange={e => setTravel({ ...travel, point: e.target.value })} /></label></>}<fieldset><legend>Do you need accommodation?</legend>{([['own', 'No, we’ll arrange our own stay'], ['hosts', 'Yes, please help us with a stay'], ['later', 'We’ll confirm this later']] as const).map(([value, label]) => <label className="rsvp-option" key={value}><input type="radio" name="stay" checked={stayChoice === value} onChange={() => setStayChoice(value)} />{label}</label>)}</fieldset>{stayChoice === 'hosts' && <fieldset><legend>Which nights?</legend>{[...new Set(['Night before', 'Wedding night', ...nights])].map(n => <label className="rsvp-option" key={n}><input type="checkbox" checked={nights.includes(n)} onChange={() => setNights(toggle(nights, n))} />{n}</label>)}</fieldset>}</div>}
    {step >= 2 && <dl className="rsvp-review"><dt>Your reply</dt><dd>{coming === 'yes' ? `${names.length} coming: ${names.map(p => p.name).join(', ')}` : 'Unable to attend'}</dd>{coming === 'yes' && <><dt>Arrival</dt><dd>{travel ? `${travel.mode}${travel.window ? ` · ${travel.window}` : ''}${travel.point ? ` · ${travel.point}` : ''}` : 'To be confirmed'}</dd><dt>Accommodation</dt><dd>{stayChoice === 'own' ? 'Arranging our own stay' : stayChoice === 'hosts' ? nights.join(', ') : 'To be confirmed'}</dd></>}{blessing && <><dt>Message</dt><dd>{blessing}</dd></>}</dl>}
    {error && <p className="error" role="alert">{error}</p>}<div className="rsvp-actions">{step > 0 && step < 3 && <button className="btn btn-ghost" disabled={busy} onClick={() => move(step === 2 && coming === 'no' ? 0 : step - 1)}>Back</button>}{step < 2 && <button className="btn btn-primary" onClick={next}>Continue →</button>}{step === 2 && <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Sending…' : 'Send our reply'}</button>}{step === 3 && <><Link className="btn btn-deep" to="/app">View our invitation</Link><button className="btn btn-ghost" onClick={() => { setRequestId(crypto.randomUUID()); move(0); }}>Update our reply</button></>}</div><p className="rsvp-privacy">Your reply is shared with the hosts to help plan the wedding.</p>
  </section></main></div>;
}
