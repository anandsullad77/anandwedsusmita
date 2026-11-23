import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/backend';
import { daysUntil } from '../lib/format';
import type { Change } from '../lib/types';
import type { Ctx } from './context';
import { Icon } from './Icon';

const SEEN = 'as-wedding-changes-seen';
export default function FamilyPlan({ ctx }: { ctx: Ctx }) {
  const { b, me } = ctx;
  const [changes, setChanges] = useState<Change[]>([]);
  const [seen, setSeen] = useState(localStorage.getItem(SEEN) ?? '');
  const [arrived, setArrived] = useState(!!me?.arrivedAt);
  const [arriving, setArriving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    api.changes(b.household.id).then(setChanges).catch(() => {});
  }, [b]);
  useEffect(() => { setArrived(!!me?.arrivedAt); }, [me?.arrivedAt]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); } }, [toast]);
  const days = daysUntil(b.event.startsAt);
  const hoursToStart = (new Date(b.event.startsAt).getTime() - Date.now()) / 3_600_000;
  const showArrive = hoursToStart < 30 && hoursToStart > -12;
  const isToday = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) === new Date(b.event.startsAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
  const unseen = changes.filter(c => c.at > seen && c.byName !== me?.name);
  const coming = b.people.filter(p => p.attending.length);
  const travel = b.household.travel;
  async function arrive() {
    if (arriving) return;
    setArriving(true);
    try { await api.markArrived(b.event.id); setArrived(true); setToast('Welcome! The family knows you’re here.'); }
    catch (e) { setToast((e as Error).message); }
    finally { setArriving(false); }
  }
  return <section className="general-section general-family-plan" aria-labelledby="personal-plan-title">
    <header className="general-section-heading"><p className="general-eyebrow" lang="kn">ನಮಸ್ಕಾರ</p><h2 id="personal-plan-title">Welcome, {me?.name ?? b.household.name}.</h2><p>{days > 0 ? `${days} days to go.` : isToday ? 'Today’s the day.' : 'A day to remember.'} Your family’s plans, all in one place.</p></header>
    <div className="guest-personal-plan">
    {unseen.length > 0 && <div className="banner gold guest-plan-notice" role="status"><p><b>{unseen[0].byName}</b> changed your family’s plan: {unseen[0].summary}{unseen.length > 1 && ` (+${unseen.length - 1} more)`}</p><button className="chip" onClick={() => { localStorage.setItem(SEEN, changes[0].at); setSeen(changes[0].at); }}>OK</button></div>}
      <section className="guest-plan-card card" aria-labelledby="family-plan-title">
        <div className="guest-section-heading"><h2 id="family-plan-title">Your family’s plan</h2><span className={`guest-status ${b.household.coming ? 'answered' : ''}`}>{b.household.coming === 'no' ? 'Not coming' : b.household.coming === 'yes' ? 'Confirmed' : 'RSVP pending'}</span></div>
        <p className="guest-plan-family">{b.household.name}</p>
        <div className="guest-plan-summary">
          {b.household.coming === 'no' ? <p>We’ll miss you. Your blessing is with the family.</p> : <>
            <p><Icon size={18} d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6m-3-3h6" /><span>{coming.length ? <><b>{coming.length} coming</b><small>{coming.map(p => p.name).join(', ')}</small></> : 'Let the hosts know who’s coming.'}</span></p>
            {travel && <p><Icon size={18} d="M5 17h14l-1-7H6l-1 7v0zM7 17v3m10-3v3M7 6h10" /><span>{travel.mode === 'near' ? 'Coming from nearby' : `${travel.mode[0].toUpperCase()}${travel.mode.slice(1)}${travel.window ? ` · ${travel.window}` : ''}`}{travel.point && <small>{travel.point}</small>}</span></p>}
            {b.household.stay && <p><Icon size={18} d="M3 18V9m18 9V9M3 14h18M7 14v-4h10v4" /><span>{b.household.stay.manage ? 'Arranging your own stay' : b.household.stay.nights.length ? `Stay: ${b.household.stay.nights.join(', ')}` : 'No stay requested'}</span></p>}
          </>}
        </div>
        <Link to={`/i/${ctx.s.householdToken}?edit=1`} className={`btn ${b.household.coming ? 'btn-ghost' : 'btn-primary'} btn-block`}>{b.household.coming ? 'Update family RSVP' : 'Complete your RSVP'}<Icon size={16} d="M5 12h14m-6-6l6 6-6 6" /></Link>
      </section>
    {showArrive && b.household.coming === 'yes' && (arrived ? <div className="banner gold" role="status">You’ve arrived. Enjoy the celebration!</div> : <button className="btn btn-gold btn-block" disabled={arriving} onClick={arrive}>{arriving ? 'Checking in…' : 'We’ve arrived'}</button>)}
    </div>
    {toast && <div className="toast" role="status">{toast}</div>}
  </section>;
}
