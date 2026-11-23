import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, getSession, setSession } from '../lib/backend';
import { applyTheme } from '../lib/theme';
import { fmtDate, fmtTime, waLink } from '../lib/format';
import { canPrompt, isIOS, isStandalone, promptInstall } from '../lib/install';
import type { Change, InviteBundle, Stay, Travel } from '../lib/types';
import { BlessArt, CoupleArt, GateArt, HallArt, JourneyArt, KeepArt, LiveArt, MandapArt, OpenArt, StayArt, WhoArt, WishArt } from './scenes';
import './banni.css';
import { WeddingMark } from '../components/WeddingBrand';

type Chapter = 'open' | 'bless' | 'couple' | 'who' | 'ask' | 'family' | 'journey' | 'stay' | 'peak' | 'keep' | 'wish' | 'live';

const ART: Record<Chapter, { el: (b: InviteBundle) => ReactNode; origin: string; dark?: boolean; label?: string }> = {
  open: { el: () => <OpenArt />, origin: '50% 40%' },
  bless: { el: () => <BlessArt />, origin: '50% 30%', label: 'ಆಶೀರ್ವಾದ' },
  couple: { el: b => <CoupleArt portrait={b.event.theme.portrait} />, origin: '50% 32%', label: 'ಜೊತೆ' },
  who: { el: () => <WhoArt />, origin: '50% 10%', label: 'ನೀವು' },
  ask: { el: () => <GateArt sign="ಮಂಗಲ ಕಾರ್ಯಾಲಯ" />, origin: '50% 26%', label: 'ಆಮಂತ್ರಣ' },
  family: { el: () => <HallArt />, origin: '50% 30%', dark: true, label: 'ಕುಟುಂಬ' },
  journey: { el: () => <JourneyArt />, origin: '50% 25%', label: 'ಪಯಣ' },
  stay: { el: () => <StayArt />, origin: '50% 40%', dark: true, label: 'ವಸತಿ' },
  peak: { el: () => <MandapArt />, origin: '50% 35%', dark: true, label: 'ಮುಹೂರ್ತ' },
  keep: { el: () => <KeepArt />, origin: '50% 20%', label: 'ನೆನಪು' },
  wish: { el: () => <WishArt />, origin: '50% 30%', label: 'ಆಶೀರ್ವಾದ' },
  live: { el: () => <LiveArt />, origin: '50% 35%', dark: true, label: 'ನೇರ' }
};

const MODES: { id: Travel['mode']; kn: string; en: string }[] = [
  { id: 'train', kn: 'ರೈಲು', en: 'Train' }, { id: 'bus', kn: 'ಬಸ್', en: 'Bus' }, { id: 'car', kn: 'ಕಾರು', en: 'Car' }, { id: 'flight', kn: 'ವಿಮಾನ', en: 'Flight' }
];
const WINDOWS = ['Day before · morning', 'Day before · evening', 'Wedding day · early', 'Wedding day · morning'];
const RELATIONS = ['Mava (ಮಾವ)', 'Atte (ಅತ್ತೆ)', 'Chikkappa (ಚಿಕ್ಕಪ್ಪ)', 'Doddappa (ದೊಡ್ಡಪ್ಪ)', 'Ajji (ಅಜ್ಜಿ)', 'cousin', 'friend', 'colleague'];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function Banni() {
  const { token = '' } = useParams();
  const [search] = useSearchParams();
  const nav = useNavigate();
  const [b, setB] = useState<InviteBundle | null>(null);
  const [missing, setMissing] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [pickedWho, setPickedWho] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [relation, setRelation] = useState<string | null>(null);
  const [coming, setComing] = useState<'yes' | 'no' | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [fnSel, setFnSel] = useState<string[]>([]);
  const [addName, setAddName] = useState('');
  const [travel, setTravel] = useState<Travel | null>(null);
  const [stay, setStay] = useState<Stay>({ nights: [], manage: false });
  const [blessing, setBlessing] = useState('ನೂರು ವರ್ಷ ಸುಖವಾಗಿ ಬಾಳಿ!');
  const [thrown, setThrown] = useState(0);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastChange, setLastChange] = useState<Change | null>(null);
  const [top, setTop] = useState(0);
  const [H, setH] = useState(window.innerHeight);
  const scroller = useRef<HTMLDivElement>(null);

  // load the invite
  useEffect(() => {
    let alive = true;
    api.inviteBundle(token).then(bundle => {
      if (!alive) return;
      if (!bundle) { setMissing(true); return; }
      applyTheme(bundle.event);
      setB(bundle);
      const s = getSession();
      if (s && s.householdToken === token) {
        setMe(s.personId);
        if (bundle.household.coming && !search.get('edit')) { nav('/app', { replace: true }); return; }
      }
      setComing(bundle.household.coming);
      setSelected(bundle.people.filter(p => p.attending.length).map(p => p.id));
      setFnSel(bundle.functions.map(f => f.id));
      if (bundle.household.travel) setTravel(bundle.household.travel);
      if (bundle.household.stay) setStay(bundle.household.stay);
    }).catch(e => setErr(String(e.message ?? e)));
    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    if (b && me) api.changes(b.household.id).then(c => setLastChange(c[0] ?? null)).catch(() => {});
  }, [b, me]);

  useLayoutEffect(() => {
    const onR = () => setH(scroller.current?.clientHeight || window.innerHeight);
    onR(); window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, [b]);

  // chapters unlock as questions are answered
  const travelDone = !!travel && (travel.mode === 'near' || !!travel.window);
  const order = useMemo<Chapter[]>(() => {
    const o: Chapter[] = ['open', 'bless', 'couple'];
    if (!me) { o.push('who'); return o; }
    o.push('ask');
    if (coming === 'yes') {
      o.push('family');
      if (selected.length) o.push('journey');
      if (selected.length && travelDone) o.push('stay');
      if (selected.length && travelDone && (stay.nights.length || stay.manage)) { o.push('peak'); if (thrown) o.push('keep'); }
    } else if (coming === 'no') { o.push('wish'); if (sent) o.push('live'); }
    return o;
  }, [me, coming, selected.length, travelDone, stay, thrown, sent]);

  if (missing) return <Missing />;
  if (!b) return <div className="banni" style={{ display: 'grid', placeItems: 'center' }}>{err ? <p className="error">{err}</p> : <p className="eb">Opening your invitation…</p>}</div>;

  const f = top / H;
  const active = Math.min(order.length - 1, Math.round(f));
  const cur = order[active];
  const p = Math.min(1, top / (H * 0.62));
  const on = (c: Chapter) => { const i = order.indexOf(c); return i > -1 && i <= active ? 'scene on' : 'scene'; };
  const couple = `${b.event.coupleA} & ${b.event.coupleB}`;
  const place = b.event.theme.place ?? b.event.venue.split(',').pop()?.trim() ?? '';
  const myName = b.people.find(x => x.id === me)?.name;
  const answered = [coming === 'yes', selected.length > 0, travelDone, stay.nights.length > 0 || stay.manage];
  const others = lastChange && lastChange.byName !== myName ? lastChange : null;

  const layer = (c: Chapter) => {
    const i = order.indexOf(c);
    if (i < 0) return null;
    const t = f - i;
    if (t <= -1 || t >= 0.92) return null;
    const op = t <= 0 ? 1 + t : Math.max(0, 1 - t * 1.1);
    const sc = reduceMotion ? 1 : t <= 0 ? 0.92 + 0.08 * (1 + t) : 1 + t * 1.6;
    return (
      <div key={c} className="st" style={{ zIndex: 100 - i, opacity: op, transform: `scale(${sc})`, transformOrigin: ART[c].origin }}>
        {ART[c].el(b)}
      </div>
    );
  };

  async function claim(personId: string | null) {
    setBusy(true); setErr(null);
    try {
      const pid = await api.claimPerson(token, personId, personId ? undefined : newName.trim(), relation ?? undefined);
      setSession({ eventId: b!.event.id, slug: b!.event.slug, householdToken: token, personId: pid });
      if (!personId) { const fresh = await api.inviteBundle(token); if (fresh) setB(fresh); }
      setMe(pid);
      if (!selected.length) setSelected([pid]);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function addPerson() {
    const name = addName.trim(); if (!name) return;
    setBusy(true); setErr(null);
    try {
      await api.saveRsvp(b!.event.id, { add: [{ name }], summary: `added ${name}` });
      const fresh = await api.inviteBundle(token);
      if (fresh) { setB(fresh); const added = fresh.people.find(x => x.name === name && !selected.includes(x.id)); if (added) setSelected(s => [...s, added.id]); }
      setAddName('');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function throwAkshate() {
    try { navigator.vibrate?.(30); } catch { /* not supported */ }
    if (thrown) { setThrown(t => t + 1); return; }
    setBusy(true); setErr(null);
    const names = b!.people.filter(x => selected.includes(x.id)).map(x => x.name);
    const travelTxt = travel?.mode === 'near' ? 'coming from nearby' : `${travel?.mode}, ${travel?.window}`;
    const stayTxt = stay.manage ? 'own stay' : `stay ${stay.nights.join(', ')}`;
    try {
      await api.saveRsvp(b!.event.id, {
        coming: 'yes',
        attendance: b!.people.map(x => ({ personId: x.id, functionIds: selected.includes(x.id) ? fnSel : [] })),
        travel: travel!, stay,
        summary: `RSVP: ${names.length} coming (${names.join(', ')}) · ${travelTxt} · ${stayTxt}`
      });
      setThrown(1);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function sendBlessing() {
    setBusy(true); setErr(null);
    try {
      await api.saveRsvp(b!.event.id, { coming: 'no', blessing, attendance: b!.people.map(x => ({ personId: x.id, functionIds: [] })), summary: "can't come — sent a blessing" });
      setSent(true);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const grains = thrown ? Array.from({ length: 28 }, (_, i) => ({ l: (i * 37) % 100, d: (i % 7) * 0.09, du: 1.5 + (i % 5) * 0.25, k: i % 2 ? 'k2' : '' })) : [];
  const travelPoint = travel && travel.mode !== 'near' ? b.event.theme.travelPoints?.[travel.mode] : undefined;

  return (
    <div className="banni" style={{ ['--h' as string]: `${H}px` } as CSSProperties}>
      <div className="banni-frame">
        <a className="banni-home" href="/" aria-label="Anand and Susmita — wedding invitation"><WeddingMark size={44} /></a>
        <div className="world" aria-hidden="true">{order.map(layer)}</div>

        <div className="scroller" ref={scroller} onScroll={e => setTop(e.currentTarget.scrollTop)}>
          <section className={on('open')} aria-label="Opening">
            {p > 0.3 && active <= 2 && Array.from({ length: 10 }, (_, i) => (
              <span key={i} className={`petal ${i % 3 ? '' : 'k2'}`} style={{ left: `${(i * 23 + 5) % 95}%`, animationDelay: `${i * 0.7}s` }} aria-hidden="true" />
            ))}
          </section>

          <section className={`${on('bless')} center`} aria-label="Blessing">
            <p className="rv kn-h" style={{ color: 'var(--primary)', fontSize: 18 }}>॥ ಶ್ರೀ ಗಜಾನನ ಪ್ರಸನ್ನ ॥</p>
            <h2 className="rv d1 kn-h" style={{ fontSize: 34 }}>ಸಪ್ರೇಮ ವಂದನೆಗಳು</h2>
            <p className="rv d2 sub-serif" lang="en" style={{ color: 'var(--deep)' }}>With love, and <i>our elders' blessings.</i></p>
            <p className="rv d3" style={{ margin: 0, fontSize: 15, color: 'var(--muted)' }} lang="en">To the {b.household.name}.</p>
          </section>

          <section className={`${on('couple')} center`} aria-label="The couple" style={{ gap: 6 }}>
            <h1 lang="en" style={{ margin: 0, fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 'clamp(40px, 12vw, 52px)', lineHeight: 1, color: 'var(--primary)', display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <span className="rv">{b.event.coupleA}</span>
              <span className="rv d1" style={{ fontFamily: 'var(--kn-serif)', fontSize: 22, color: 'var(--deep)' }}>ಜೊತೆ</span>
              <span className="rv d2">{b.event.coupleB}</span>
            </h1>
            <p className="rv d3 sub-serif" lang="en" style={{ marginTop: 12 }}>Two families. <i>One beginning.</i></p>
            <p className="rv d4" lang="en" style={{ margin: '6px 0 0', fontSize: 16, fontWeight: 600 }}>{fmtDate(b.event.startsAt)} · {fmtTime(b.event.startsAt)}</p>
            <p className="rv d5" lang="en" style={{ margin: 0, fontSize: 15, color: 'var(--muted)' }}>{b.event.venue}</p>
          </section>

          {order.includes('who') && (
            <section className={on('who')} aria-label="Who are you">
              <p className="eb rv" lang="en">Before we go in</p>
              <h2 className="rv d1 kn-h" style={{ color: 'var(--deep)' }}>ನೀವು ಯಾರು?</h2>
              <p className="rv d2 sub-serif" lang="en">Which one of you <i>is opening this?</i></p>
              <div className="rv d3 grid2">
                {b.people.map(x => (
                  <button key={x.id} className="answer small" aria-pressed={pickedWho === x.id} onClick={() => setPickedWho(x.id)}>
                    <span className="kn" lang="en">{x.name}</span>
                    {x.linked && <span className="en" lang="en">already joined</span>}
                  </button>
                ))}
                {b.people.length < b.household.cap && (
                  <button className="answer small" aria-pressed={pickedWho === 'new'} onClick={() => setPickedWho('new')}>
                    <span className="kn" lang="en">+ Someone else</span>
                  </button>
                )}
              </div>
              {pickedWho === 'new' && (
                <div className="field bloom" lang="en"><label htmlFor="nn">Your name</label><input id="nn" className="input" value={newName} onChange={e => setNewName(e.target.value)} autoComplete="name" /></div>
              )}
              {pickedWho && (
                <div className="bloom" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label htmlFor="rel" style={{ fontSize: 14, fontWeight: 600 }} lang="en">How are you related to the couple? (optional)</label>
                  <select id="rel" className="input" value={relation ?? ''} onChange={e => setRelation(e.target.value || null)}>
                    <option value="">Choose…</option>
                    {RELATIONS.flatMap(r => [`${b.event.coupleA}'s ${r}`, `${b.event.coupleB}'s ${r}`]).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button className="btn btn-primary btn-block" disabled={busy || (pickedWho === 'new' && !newName.trim())} onClick={() => claim(pickedWho === 'new' ? null : pickedWho)} lang="en">
                    {busy ? 'One moment…' : 'That’s me — continue'}
                  </button>
                </div>
              )}
              {err && <p className="error" role="alert">{err}</p>}
            </section>
          )}

          {order.includes('ask') && (
            <section className={on('ask')} aria-label="Will you come">
              <p className="eb rv" lang="en">At the gate</p>
              <h2 className="rv d1 kn-h" style={{ color: 'var(--deep)' }}>ಬರ್ತೀರಾ{myName ? `, ${myName}` : ''}?</h2>
              <p className="rv d2 sub-serif" lang="en">Will the {b.household.name.replace(/ family$/i, 's')} <i>be there?</i></p>
              {others && <p className="note rv d2" lang="en"><b>{others.byName}</b> already answered: {others.summary}. Change anything below — everyone in the family will see the update.</p>}
              <div className="rv d3" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button className="answer" aria-pressed={coming === 'yes'} onClick={() => setComing('yes')}><span className="kn">ಬರ್ತೀವಿ!</span><span className="en" lang="en">Yes, we're coming</span></button>
                <button className="answer" aria-pressed={coming === 'no'} onClick={() => setComing('no')}><span className="kn">ಬರೋಕಾಗಲ್ಲ</span><span className="en" lang="en">Can't make it — we'll send blessings</span></button>
              </div>
            </section>
          )}

          {order.includes('family') && (
            <section className={`${on('family')} dark`} aria-label="Who is coming">
              <p className="eb rv" lang="en">Inside, the hall is ready</p>
              <h2 className="rv d1 kn-h">ಯಾರ್ಯಾರು ಬರ್ತೀರಾ?</h2>
              <p className="rv d2" lang="en" style={{ margin: 0, fontSize: 16, color: '#D6E0D8' }}>Tap everyone who's coming. You can answer for elders too.</p>
              <div className="rv d3 grid2">
                {b.people.map(x => {
                  const sel = selected.includes(x.id);
                  return (
                    <button key={x.id} className="answer small" aria-pressed={sel} onClick={() => setSelected(s => sel ? s.filter(y => y !== x.id) : [...s, x.id])}>
                      <span className="kn" lang="en">{x.name}</span>
                      <span className="en" lang="en">{x.id === me ? 'You' : x.isChild ? 'Child' : x.relation ?? ' '}</span>
                    </button>
                  );
                })}
              </div>
              {b.people.length < b.household.cap && (
                <div className="rv d4" style={{ display: 'flex', gap: 8 }}>
                  <label htmlFor="add" className="sr-only">Add someone</label>
                  <input id="add" className="input" placeholder="Add someone the hosts missed" value={addName} onChange={e => setAddName(e.target.value)} lang="en" />
                  <button className="btn btn-gold" disabled={busy || !addName.trim()} onClick={addPerson} lang="en">Add</button>
                </div>
              )}
              {b.functions.length > 1 && (
                <div className="rv d4" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="group" aria-label="Functions">
                  {b.functions.map(fn => <button key={fn.id} className="chip" aria-pressed={fnSel.includes(fn.id)} onClick={() => setFnSel(s => s.includes(fn.id) ? s.filter(y => y !== fn.id) : [...s, fn.id])}>{fn.nameKn ?? fn.nameEn}</button>)}
                </div>
              )}
              <p className="rv d5" lang="en" style={{ margin: 0, fontWeight: 600 }}>{selected.length ? `${selected.length} coming` : 'Nobody picked yet'}</p>
              {err && <p className="error" role="alert" style={{ color: '#FFD7D7' }}>{err}</p>}
            </section>
          )}

          {order.includes('journey') && (
            <section className={on('journey')} aria-label="Travel" style={{ paddingLeft: 20, paddingRight: 20 }}>
              <p className="eb rv" lang="en">Every road leads to {place}</p>
              <h2 className="rv d1 kn-h" style={{ color: 'var(--deep)' }}>ಹೇಗೆ ಬರ್ತೀರಾ?</h2>
              <div className="rv d2 road" aria-hidden="true">
                <svg viewBox="0 0 350 120"><path d="M 20 92 C 110 8, 220 160, 350 48" fill="none" stroke="#C9B596" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" /><circle cx="20" cy="92" r="7" className="f-deep" /><circle cx="342" cy="50" r="9" className="f-primary" /></svg>
                <span className="car" style={{ offsetDistance: travel ? '100%' : '0%' } as CSSProperties}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2B1A12" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 16l1.5-5h11l1.5 5M4 16h16v3H4z" /></svg>
                </span>
              </div>
              <div className="rv d3 grid4">
                {MODES.map(m => (
                  <button key={m.id} className="answer small gold" aria-pressed={travel?.mode === m.id} onClick={() => setTravel({ mode: m.id, point: b.event.theme.travelPoints?.[m.id as 'train'], window: travel?.mode === m.id ? travel.window : undefined })}>
                    <span className="kn">{m.kn}</span><span className="en" lang="en">{m.en}</span>
                  </button>
                ))}
              </div>
              <button className="linkbtn" aria-pressed={travel?.mode === 'near'} onClick={() => setTravel({ mode: 'near' })} lang="en">We live nearby — no travel needed</button>
              {travel && travel.mode !== 'near' && (
                <div className="bloom" style={{ display: 'flex', flexDirection: 'column', gap: 8 }} lang="en">
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{travelPoint ? `${travelPoint} — around when?` : 'Around when?'}</span>
                  <div className="grid2">
                    {WINDOWS.map(w => <button key={w} className="chip" aria-pressed={travel.window === w} onClick={() => setTravel({ ...travel, window: w })}>{w}</button>)}
                  </div>
                </div>
              )}
            </section>
          )}

          {order.includes('stay') && (
            <section className={`${on('stay')} dark`} aria-label="Stay">
              <p className="eb rv" lang="en">The lamps stay lit for you</p>
              <h2 className="rv d1 kn-h">ಉಳಿಯೋಕೆ ಜಾಗ ಬೇಕಾ?</h2>
              <p className="rv d2" lang="en" style={{ margin: 0, fontSize: 16, color: '#D6E0D8' }}>Pick the nights — the hosts arrange rooms nearby.</p>
              <div className="rv d3 grid2">
                {['Night before', 'Wedding night'].map(n => {
                  const sel = stay.nights.includes(n);
                  return <button key={n} className="answer small" aria-pressed={sel} onClick={() => setStay({ manage: false, nights: sel ? stay.nights.filter(x => x !== n) : [...stay.nights, n] })}><span className="kn" lang="en">{n}</span></button>;
                })}
              </div>
              <button className="btn btn-ghost rv d4" style={{ background: '#fff' }} aria-pressed={stay.manage} onClick={() => setStay({ nights: [], manage: true })} lang="en">
                {stay.manage ? '✓ ' : ''}We'll manage our own stay
              </button>
            </section>
          )}

          {order.includes('peak') && (
            <section className={`${on('peak')} dark center`} aria-label="See you there" style={{ justifyContent: 'center' }}>
              <div className="portrait-round">{b.event.theme.portrait && <img src={b.event.theme.portrait} alt={couple} />}</div>
              <p className="eb rv" lang="en" style={{ marginTop: 6 }}>{fmtTime(b.event.startsAt)} · the muhurta</p>
              <h2 className="rv d1 kn-h" style={{ fontSize: 28 }}>{b.event.coupleA} &amp; {b.event.coupleB} ನಿಮಗಾಗಿ ಕಾಯ್ತಿದ್ದಾರೆ</h2>
              <p className="rv d2 sub-serif" lang="en">Our forever. <i>Your presence.</i></p>
              <button className="btn btn-gold rv d3" style={{ flexDirection: 'column', gap: 0, minHeight: 60 }} disabled={busy} onClick={throwAkshate}>
                <span style={{ fontFamily: 'var(--kn-sans)', fontSize: 19 }}>ಅಕ್ಷತೆ ಹಾಕಿ</span>
                <span style={{ fontSize: 13 }} lang="en">{busy ? 'Saving…' : 'Shower your akshate'}</span>
              </button>
              {thrown > 0 && <p className="bloom" lang="en" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Your RSVP is in. Scroll for one last thing.</p>}
              {err && <p className="error" role="alert" style={{ color: '#FFD7D7' }}>{err}</p>}
              {grains.map((g, i) => <span key={`${thrown}-${i}`} className={`grain ${g.k}`} style={{ left: `${g.l}%`, animationDelay: `${g.d}s`, animationDuration: `${g.du}s` }} aria-hidden="true" />)}
            </section>
          )}

          {order.includes('keep') && <Keep on={on('keep')} b={b} selectedCount={selected.length} travel={travel} stay={stay} />}

          {order.includes('wish') && (
            <section className={on('wish')} aria-label="Send blessings">
              <p className="eb rv" lang="en">From wherever you are</p>
              <h2 className="rv d1 kn-h" style={{ color: 'var(--deep)' }}>ಆಶೀರ್ವಾದ ಕಳಿಸಿ</h2>
              <p className="rv d2 sub-serif" lang="en">We'll miss you. <i>Send them a few words.</i></p>
              <div className="field rv d3"><label htmlFor="wish" lang="en">Your blessing</label>
                <textarea id="wish" className="input" rows={3} value={blessing} onChange={e => setBlessing(e.target.value)} /></div>
              <button className="btn btn-primary btn-block rv d4" disabled={busy || sent} onClick={sendBlessing} lang="en">{sent ? 'Sent — thank you' : busy ? 'Sending…' : 'Send ashirvada'}</button>
              {err && <p className="error" role="alert">{err}</p>}
            </section>
          )}

          {order.includes('live') && (
            <section className={`${on('live')} dark center`} aria-label="Watch from afar" style={{ justifyContent: 'center' }}>
              <p className="eb rv" lang="en">{fmtTime(b.event.startsAt)} · {new Date(b.event.startsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
              <h2 className="rv d1" lang="en" style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 40, lineHeight: 1.05 }}>Be there, <i>from afar.</i></h2>
              <p className="rv d2" lang="en" style={{ margin: 0, fontSize: 16, color: '#D6E0D8' }}>Watch the photos come in live on Scene and shower akshate from wherever you are.</p>
              <button className="btn btn-gold rv d3" onClick={() => nav('/app/scene')} lang="en">Open Scene</button>
            </section>
          )}
        </div>

        {p < 1 && (
          <>
            <div className="cover" aria-hidden="true">
              <div style={{ transform: `translateX(-${Math.round(p * 102)}%)` }} />
              <div style={{ transform: `translateX(${Math.round(p * 102)}%)` }} />
            </div>
            <div className="cover-text" style={{ opacity: Math.max(0, 1 - p * 1.6) }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="kn-h" style={{ fontSize: 26 }}>{b.household.name.replace(/ family$/i, '')} ಕುಟುಂಬಕ್ಕೆ</span>
                <span lang="en" style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 20, color: '#E6D9C2' }}>For the {b.household.name}</span>
              </div>
              <div className="seal" style={{ transform: `scale(${1 - p * 0.5})` }}><WeddingMark /></div>
              <div className="cue" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontFamily: 'var(--kn-sans)', fontSize: 16, fontWeight: 600 }}>ತೆರೆಯಲು ಮೇಲಕ್ಕೆ ಸರಿಸಿ</span>
                <span lang="en" style={{ fontSize: 14, color: '#E6D9C2' }}>Swipe up to open</span>
              </div>
            </div>
          </>
        )}

        {coming === 'yes' && ['ask', 'family', 'journey', 'stay'].includes(cur) && (
          <div className="garland" role="img" aria-label={`${answered.filter(Boolean).length} of 4 answered`}>
            {answered.map((a, i) => <span key={i} style={{ background: a ? 'var(--akshate)' : 'transparent' }} />)}
          </div>
        )}

        {active > 0 && ART[cur].label && (
          <div className="chapter-bar" style={{ color: ART[cur].dark ? 'var(--paper)' : 'var(--ink)' }}>
            <span>{String(active).padStart(2, '0')} · {ART[cur].label}</span>
            {active < order.length - 1 && <span className="cue" lang="en">SCROLL TO UNFOLD ↓</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function Keep({ on, b, selectedCount, travel, stay }: { on: string; b: InviteBundle; selectedCount: number; travel: Travel | null; stay: Stay }) {
  const nav = useNavigate();
  const [installed, setInstalled] = useState(isStandalone());
  const travelTxt = travel?.mode === 'near' ? 'Coming from nearby' : travel ? `${travel.mode[0].toUpperCase()}${travel.mode.slice(1)} · ${travel.window ?? ''}` : '—';
  return (
    <section className={on} aria-label="Keep the wedding on your phone">
      <p className="eb rv" lang="en">Until we meet</p>
      <h2 className="rv d1" lang="en" style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 36, lineHeight: 1.05 }}>Keep the wedding <i>close.</i></h2>
      <div className="card rv d2" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 15 }} lang="en">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Coming</span><b>{selectedCount}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Arriving</span><b>{travelTxt}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Stay</span><b>{stay.manage ? 'Own arrangements' : stay.nights.join(', ') || '—'}</b></div>
      </div>
      {!installed && canPrompt() && (
        <button className="btn btn-primary btn-block rv d3" onClick={async () => setInstalled(await promptInstall())} lang="en">Add to home screen</button>
      )}
      {!installed && !canPrompt() && isIOS() && (
        <p className="note rv d3" lang="en">To keep it on your iPhone: tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>.</p>
      )}
      <p className="rv d3" lang="en" style={{ margin: 0, fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>Live photos and updates from the hosts on the day.</p>
      <button className="btn btn-deep btn-block rv d4" onClick={() => nav('/app')} lang="en">Take me in →</button>
      <p className="rv d5" lang="en" style={{ margin: 0, fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>Celebrating <b>Anand &amp; Susmita</b></p>
      <p lang="en" style={{ margin: 0, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>Your answers go only to {b.event.coupleA} &amp; {b.event.coupleB}'s family to plan the wedding. Contact the hosts if you want your information removed.</p>
    </section>
  );
}

function Missing() {
  return (
    <div className="phone" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center', minHeight: '100dvh' }}>
      <h1 className="kn-h" style={{ fontSize: 30, color: 'var(--deep)' }}>ಈ ಲಿಂಕ್ ಸಿಗಲಿಲ್ಲ</h1>
      <p lang="en" style={{ margin: 0 }}>We couldn't find this invitation. Please check the link, or ask the family who sent it.</p>
      <a className="btn btn-ghost" href={waLink('', 'Hi, my wedding invitation link is not opening. Can you resend it?')} lang="en">Ask on WhatsApp</a>
    </div>
  );
}
