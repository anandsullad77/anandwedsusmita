import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useRef } from 'react';
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
  const [added, setAdded] = useState<{ id: string; name: string; isChild: boolean }[]>([]);
  const saveLock = useRef(false);
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
  if (!b) return <main className="rsvp-shell" lang="en"><WeddingBrand tagline="Your invitation" /><div className="rsvp-card">{loading ? <p role="status">Opening your invitation…</p> : <><h1>Invitation unavailable</h1><p role="alert">{error}</p><Link className="btn btn-primary" to="/rsvp">Find my family</Link></>}</div></main>;
  const individual = b.household.invitationType === 'individual';
  const names = [...b.people.filter(p => selected.includes(p.id)), ...(coming === 'yes' ? added : [])];
  const spaces = Math.max(0, b.household.cap - b.people.length);
  const stay: Stay | null = stayChoice === 'own' ? { manage: true, nights: [] } : stayChoice === 'hosts' ? { manage: false, nights } : null;
  const move = (n: number) => { setError(''); setStep(n); window.scrollTo({ top: 0, behavior: 'instant' }); };
  const next = () => {
    if (step === 0) {
      if (!person || !coming) return setError(individual ? 'Please tell us whether you can attend.' : 'Please choose your name and tell us whether your family can attend.');
      if (coming === 'yes' && ((!selected.length && !added.length) || !functions.length)) return setError('Please select at least one guest and one event.');
      if (coming === 'yes' && added.some(p => !p.name.trim() || p.name.trim().length > 80)) return setError('Enter a name of 1–80 characters for each new family member, or remove the empty row.');
      if (coming === 'yes' && added.length > spaces) return setError('Your family has reached the host’s limit. Please ask the hosts for more places.');
      move(coming === 'yes' ? 1 : 2);
    } else if (step === 1) {
      if (travel && travel.mode !== 'near' && !travel.window) return setError('Please choose an arrival time.');
      if (!stayChoice || (stayChoice === 'hosts' && !nights.length)) return setError('Please choose an accommodation option and the nights you need.');
      move(2);
    }
  };
  const save = async () => {
    if (saveLock.current) return;
    saveLock.current = true;
    setBusy(true); setError('');
    try {
      await api.claimPerson(token, person);
      setSession({ eventId: b.event.id, slug: b.event.slug, householdToken: token, personId: person, invitationType: b.household.invitationType });
      await api.saveRsvp(b.event.id, { requestId, add: coming === 'yes' ? added.map(p => ({ name: p.name.trim(), isChild: p.isChild, functionIds: functions })) : [], coming: coming as 'yes' | 'no', attendance: b.people.map(p => ({ personId: p.id, functionIds: coming === 'yes' && selected.includes(p.id) ? functions : [] })), travel: coming === 'yes' ? travel : null, stay: coming === 'yes' ? stay : null, blessing: blessing.trim(), summary: coming === 'yes' ? `RSVP: ${names.length} coming (${names.map(p => p.name).join(', ')}) · ${travel?.mode ?? 'travel to be confirmed'} · ${stayChoice === 'hosts' ? `stay ${nights.join(', ')}` : stayChoice === 'own' ? 'own stay' : 'stay to be confirmed'}` : 'RSVP: unable to attend' });
      move(3);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); saveLock.current = false; }
  };
  return <div className="rsvp-shell" lang="en"><header className="rsvp-top"><WeddingBrand tagline={individual ? "Your RSVP" : "Family RSVP"} /><a href="/">View invitation →</a></header><main className="rsvp-layout"><aside className="rsvp-invite"><p>WITH LOVE, YOU’RE INVITED</p><h1>{b.event.coupleA} <i>&amp;</i> {b.event.coupleB}</h1><p>{fmtDate(b.event.startsAt)}<br />{fmtTime(b.event.startsAt)} IST</p><p>{b.event.venue}</p></aside><section className="rsvp-card">
    {step < 3 && <div className="rsvp-progress">{coming === 'no' ? `Step ${step === 0 ? 1 : 2} of 2` : `Step ${step + 1} of 3`} · {step === 0 ? 'Your reply' : step === 1 ? 'Arrival & stay' : 'Review'}</div>}
    <p className="rsvp-eyebrow">{b.household.name}</p><h2>{step === 0 ? 'Will you join us?' : step === 1 ? 'Let’s plan your visit.' : step === 2 ? 'Everything look right?' : coming === 'yes' ? 'We can’t wait to see you.' : 'Thank you for letting us know.'}</h2>
    <p>{step === 0 ? individual ? 'We would love to celebrate with you.' : 'One reply is all we need for your family.' : step === 1 ? 'Tell us about your arrival and accommodation. You can update your plans later.' : step === 2 ? 'Review your details before sending them to the hosts.' : 'Your reply has been saved. You can update it whenever your plans change.'}</p>
    {step === 0 && <div className="rsvp-fields">{!individual && <label>Who is replying?<select className="input" value={person} onChange={e => setPerson(e.target.value)}><option value="">Choose your name</option>{b.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}<fieldset><legend>{individual ? "Will you attend?" : "Can your family attend?"}</legend>{[['yes', individual ? 'Yes, I will be there' : 'Yes, we\u2019ll be there'], ['no', individual ? 'Sorry, I cannot attend' : 'Sorry, we can\u2019t attend']].map(([v, label]) => <label className="rsvp-option" key={v}><input type="radio" name="coming" checked={coming === v} onChange={() => setComing(v as 'yes' | 'no')} />{label}</label>)}</fieldset>{coming === 'yes' && <>{!individual && <fieldset><legend>Who is coming?</legend><p>Select everyone attending, including children.</p>{b.people.map(p => <label className="rsvp-option" key={p.id}><input type="checkbox" checked={selected.includes(p.id)} onChange={() => setSelected(toggle(selected, p.id))} />{p.name}{p.isChild ? ' · Child' : ''}</label>)}</fieldset>}{b.functions.length > 1 && <fieldset><legend>Which events will you attend?</legend>{b.functions.map(f => <label className="rsvp-option" key={f.id}><input type="checkbox" checked={functions.includes(f.id)} onChange={() => setFunctions(toggle(functions, f.id))} />{f.nameEn}</label>)}</fieldset>}{!individual && <fieldset className="rsvp-add-members"><legend>Add family members</legend><p>Your invitation allows up to {b.household.cap} people. {b.people.length + added.length} places are listed, including children.</p>{added.map((member, index) => <div className="rsvp-added-member" key={member.id}><label htmlFor={member.id}>New family member {index + 1}<input id={member.id} className="input" maxLength={80} value={member.name} onChange={e => { setError(''); setAdded(rows => rows.map(row => row.id === member.id ? { ...row, name: e.target.value } : row)); }} /></label><label className="rsvp-option"><input type="checkbox" checked={member.isChild} onChange={e => setAdded(rows => rows.map(row => row.id === member.id ? { ...row, isChild: e.target.checked } : row))} />Child</label><button className="btn btn-ghost" type="button" onClick={() => { setError(''); setAdded(rows => rows.filter(row => row.id !== member.id)); }}>Remove member {index + 1}</button></div>)}<button className="btn btn-ghost" type="button" disabled={added.length >= spaces} onClick={() => setAdded(rows => [...rows, { id: crypto.randomUUID(), name: '', isChild: false }])}>+ Add family member</button>{added.length >= spaces && <p role="status">You have reached the {b.household.cap}-person limit. Please contact the hosts only if you need more places.</p>}</fieldset>}</>}{coming === 'no' && <label>Message to the hosts (optional)<textarea className="input" value={blessing} onChange={e => setBlessing(e.target.value)} /></label>}</div>}
    {step === 1 && <div className="rsvp-fields"><fieldset><legend>How will you get here?</legend>{(['near', 'car', 'train', 'bus', 'flight'] as const).map(mode => <label className="rsvp-option" key={mode}><input type="radio" name="travel" checked={travel?.mode === mode} onChange={() => setTravel({ mode, ...(mode !== 'near' ? { point: b.event.theme.travelPoints?.[mode] } : {}) })} />{mode === 'near' ? individual ? 'I live nearby' : 'We live nearby' : mode[0].toUpperCase() + mode.slice(1)}</label>)}<label className="rsvp-option"><input type="radio" name="travel" checked={!travel} onChange={() => setTravel(null)} />Not decided yet</label></fieldset>{travel && travel.mode !== 'near' && <><label>When will you arrive?<select className="input" value={travel.window ?? ''} onChange={e => setTravel({ ...travel, window: e.target.value })}><option value="">Choose an arrival time</option>{travel.window && !windows.includes(travel.window) && <option>{travel.window}</option>}{windows.map(w => <option key={w}>{w}</option>)}</select></label><label>Arrival location (optional)<input className="input" value={travel.point ?? ''} onChange={e => setTravel({ ...travel, point: e.target.value })} /></label></>}<fieldset><legend>Do you need accommodation?</legend>{([['own', individual ? 'No, I will arrange my own stay' : 'No, we\u2019ll arrange our own stay'], ['hosts', individual ? 'Yes, please help me with a stay' : 'Yes, please help us with a stay'], ['later', individual ? 'I will confirm this later' : 'We\u2019ll confirm this later']] as const).map(([value, label]) => <label className="rsvp-option" key={value}><input type="radio" name="stay" checked={stayChoice === value} onChange={() => setStayChoice(value)} />{label}</label>)}</fieldset>{stayChoice === 'hosts' && <fieldset><legend>Which nights?</legend>{[...new Set(['Night before', 'Wedding night', ...nights])].map(n => <label className="rsvp-option" key={n}><input type="checkbox" checked={nights.includes(n)} onChange={() => setNights(toggle(nights, n))} />{n}</label>)}</fieldset>}</div>}
    {step >= 2 && <dl className="rsvp-review"><dt>Your reply</dt><dd>{coming === 'yes' ? individual ? 'Attending' : `${names.length} coming: ${names.map(p => p.name).join(', ')}` : 'Unable to attend'}</dd>{coming === 'yes' && <><dt>Arrival</dt><dd>{travel ? `${travel.mode}${travel.window ? ` · ${travel.window}` : ''}${travel.point ? ` · ${travel.point}` : ''}` : 'To be confirmed'}</dd><dt>Accommodation</dt><dd>{stayChoice === 'own' ? individual ? 'Arranging my own stay' : 'Arranging our own stay' : stayChoice === 'hosts' ? nights.join(', ') : 'To be confirmed'}</dd></>}{blessing && <><dt>Message</dt><dd>{blessing}</dd></>}</dl>}
    {error && <p className="error" role="alert">{error}</p>}<div className="rsvp-actions">{step > 0 && step < 3 && <button className="btn btn-ghost" disabled={busy} onClick={() => move(step === 2 && coming === 'no' ? 0 : step - 1)}>Back</button>}{step < 2 && <button className="btn btn-primary" onClick={next}>Continue →</button>}{step === 2 && <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Sending…' : individual ? 'Send my reply' : 'Send our reply'}</button>}{step === 3 && <><Link className="btn btn-deep" to="/app">{individual ? "View invitation" : "View our invitation"}</Link><button className="btn btn-ghost" disabled={busy} onClick={() => { setBusy(true); void api.inviteBundle(token).then(fresh => { if (!fresh) throw new Error('Could not reload your invitation. Please try again.'); setB(fresh); setAdded([]); setSelected(fresh.people.filter(p => p.attending.length).map(p => p.id)); setRequestId(crypto.randomUUID()); move(0); }).catch(e => setError(e.message)).finally(() => setBusy(false)); }}>{individual ? "Update my reply" : "Update our reply"}</button></>}</div><p className="rsvp-privacy">Your reply is shared with the hosts to help plan the wedding.</p>
  </section></main></div>;
}
