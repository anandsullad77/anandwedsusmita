import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/backend';
import { ago, waLink } from '../lib/format';
import type { Change } from '../lib/types';
import type { Ctx } from './context';
import { Icon } from './Icon';

export default function Family({ ctx }: { ctx: Ctx }) {
  const { b, me } = ctx;
  const [changes, setChanges] = useState<Change[]>([]);
  useEffect(() => { api.changes(b.household.id).then(setChanges).catch(() => {}); }, [b]);
  return <>
    <header className="guest-page-heading"><p className="guest-eyebrow" lang="kn">ನಮ್ಮ ಕುಟುಂಬ</p><h1>Your family</h1><p>{b.household.name} · {b.people.length} of {b.household.cap} places</p></header>
    <section className="card family-people" aria-label="Family members">
      {b.people.map(p => <div className="family-person" key={p.id}><span className={`family-person-avatar ${p.attending.length ? 'is-coming' : ''}`} aria-hidden="true">{Array.from(p.name)[0]}</span><div><b>{p.name}{p.id === me?.id && <span className="family-you">You</span>}</b><p>{[p.relation, p.isChild ? 'Child' : null].filter(Boolean).join(' · ') || (p.isChild ? 'Child' : 'Family member')}</p></div><span className={`guest-status ${p.attending.length ? 'answered' : ''}`}>{p.attending.length ? 'Coming' : b.household.coming ? 'Not coming' : 'No reply yet'}</span></div>)}
    </section>
    <Link className="btn btn-primary btn-block" to={`/i/${ctx.s.householdToken}?edit=1`}>Change our RSVP <Icon size={18} d="M5 12h14m-6-6l6 6-6 6" /></Link>
    <section className="guest-family-activity"><div className="guest-section-heading"><h2>Recent changes</h2><span className="guest-meta">Shared with your family</span></div>{changes.length ? <div className="family-activity-list">{changes.slice(0, 5).map((c, i) => <article key={i}><span aria-hidden="true" /><div><p><b>{c.byName}</b> {c.summary}</p><time dateTime={c.at}>{ago(c.at)}</time></div></article>)}{changes.length > 5 && <details><summary>Earlier changes ({changes.length - 5})</summary>{changes.slice(5).map((c, i) => <p key={i}><b>{c.byName}</b> {c.summary} · {ago(c.at)}</p>)}</details>}</div> : <p className="guest-empty-copy">Changes to your family’s plans will appear here.</p>}</section>
    <details className="card family-privacy"><summary><Icon size={20} d="M12 3l8 4v5c0 5-8 9-8 9s-8-4-8-9V7l8-4zM9 12l2 2 4-4" /><span>Your information</span><Icon size={16} d="M6 9l6 6 6-6" /></summary><p>We keep your family’s names, who’s coming, travel and stay plans, and the photos you post so {b.event.coupleA} &amp; {b.event.coupleB}’s family can plan the wedding. Phone numbers are never shown to other guests. You can contact the hosts to request removal of your information or photos.</p><a className="btn btn-ghost" href={waLink(b.event.hostWhatsapp, `Hi, please delete my details from the wedding app (${me?.name ?? ''}, ${b.household.name}).`)} target="_blank" rel="noreferrer">Ask to delete my data</a></details>
  </>;
}
