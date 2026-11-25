import { fmtDate, fmtTime } from '../lib/format';
import { Link } from 'react-router-dom';
import type { EventInfo, GeneralInvitationSettings } from '../lib/types';
import { Icon } from './Icon';
import PortraitSprig from '../../PortraitSprig';

export default function InvitationHero({ event, settings, momentsPath }: { event: EventInfo; settings: GeneralInvitationSettings; momentsPath?: string }) {
  const cover = settings.coverUrl ?? '/images/anand-susmita-invitation.jpg';
  const originalPortrait = !settings.coverUrl;
  const hasCover = settings.sections.cover && !!cover;
  const day = new Date(event.startsAt).toLocaleDateString('en-IN', { day: '2-digit', timeZone: 'Asia/Kolkata' });
  const month = new Date(event.startsAt).toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' });
  const year = new Date(event.startsAt).toLocaleDateString('en-IN', { year: 'numeric', timeZone: 'Asia/Kolkata' });
  return <div className="general-hero-frame">
    <section className={`general-invitation ${hasCover ? 'has-cover' : 'without-cover'}`} aria-label="Wedding invitation">
      <div className="general-invitation-topline" lang="en"><span>A celebration of love</span><span aria-hidden="true">✦</span><time dateTime={event.startsAt}>{day} {month} {year}</time></div>
      <div className="general-hero-layout">
        <div className="general-hero-copy">
          <div className="general-hero-intro">
            <p className="general-eyebrow">With love and our elders’ blessings</p>
            <p className="kn-h general-banni" lang="en">You’re invited</p>
          </div>
          <h1 className="general-couple" lang="en"><span>{event.coupleA}</span><i>&amp;</i><span>{event.coupleB}</span></h1>
          <div className="general-hero-message">
            {momentsPath && <Link className="btn btn-deep general-hero-cta" to={momentsPath}>Be part of our day <Icon size={17} d="M5 12h14m-6-6l6 6-6 6" /></Link>}
            <p className="general-hero-note">Two hearts. Two families. One beautiful beginning.</p>
          </div>
        </div>
        {hasCover && <div className={`general-portrait${originalPortrait ? ' general-portrait-photo' : ''}`}>
          <div className="general-portrait-window"><img src={cover} alt={originalPortrait ? `${event.coupleA} and ${event.coupleB} smiling at each other beneath green leaves` : `${event.coupleA} and ${event.coupleB}`} width={originalPortrait ? 1810 : undefined} height={originalPortrait ? 2673 : undefined} fetchPriority="high" decoding="async" /></div>
          {originalPortrait && <><PortraitSprig className="general-portrait-sprig-left" /><PortraitSprig className="general-portrait-sprig-right" /></>}
        </div>}
      </div>
      <div className="general-event-details" lang="en">
        <div className="general-event-detail">
          <span className="general-date-stamp" aria-hidden="true"><b>{day}</b><span>{month}<br />{year}</span></span>
          <div><span className="general-detail-label">The wedding day</span><time dateTime={event.startsAt} className="general-date"><b>{fmtDate(event.startsAt)}</b><span>Muhurta · {fmtTime(event.startsAt)} IST</span></time></div>
        </div>
        <div className="general-event-detail">
          <span className="general-detail-icon"><Icon d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6" size={22} /></span>
          <div><span className="general-detail-label">Meet us here</span><p className="general-venue">{event.venue}</p>
            {event.mapUrl && <a className="general-directions" href={event.mapUrl} target="_blank" rel="noreferrer" aria-label="View venue on map">Get directions <Icon size={16} d="M7 17L17 7M7 7h10v10" /></a>}
          </div>
        </div>
      </div>
    </section>
  </div>;
}
