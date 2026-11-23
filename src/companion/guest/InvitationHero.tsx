import { fmtDate, fmtTime } from '../lib/format';
import type { EventInfo, GeneralInvitationSettings } from '../lib/types';
import { Icon } from './Icon';

export default function InvitationHero({ event, settings }: { event: EventInfo; settings: GeneralInvitationSettings }) {
  const cover = settings.coverUrl ?? '/images/invitation-couple.webp';
  const originalPortrait = !settings.coverUrl;
  const hasCover = settings.sections.cover && !!cover;
  return <div className="general-hero-frame">
    <section className={`general-invitation ${hasCover ? 'has-cover' : 'without-cover'}`} aria-label="Wedding invitation">
      <div className="general-hero-copy">
        <p className="general-eyebrow">With love and our elders’ blessings</p>
        <p className="kn-h general-banni" lang="kn">ಬನ್ನಿ! <span lang="en">You’re invited</span></p>
        <h1 className="general-couple" lang="en"><span>{event.coupleA}</span><i>&amp;</i><span>{event.coupleB}</span></h1>
        <p className="general-welcome">{settings.welcomeMessage}</p>
        <span className="general-hero-flourish" aria-hidden="true">✦</span>
      </div>
      {hasCover && <div className={`general-portrait${originalPortrait ? ' general-portrait-photo' : ''}`}><img src={cover} alt={`${event.coupleA} and ${event.coupleB}`} width={originalPortrait ? 941 : undefined} height={originalPortrait ? 1672 : undefined} fetchPriority="high" decoding="async" /></div>}
      <div className="general-event-details" lang="en">
        <div className="general-event-detail">
          <span className="general-detail-icon"><Icon d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2" size={22} /></span>
          <div><span className="general-detail-label">The day</span><time dateTime={event.startsAt} className="general-date"><b>{fmtDate(event.startsAt)}</b><span>{fmtTime(event.startsAt)} IST</span></time></div>
        </div>
        <div className="general-event-detail">
          <span className="general-detail-icon"><Icon d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6" size={22} /></span>
          <div><span className="general-detail-label">The place</span><p className="general-venue">{event.venue}</p>
            {event.mapUrl && <a className="general-directions" href={event.mapUrl} target="_blank" rel="noreferrer" aria-label="View venue on map">Get directions <Icon size={16} d="M7 17L17 7M7 7h10v10" /></a>}
          </div>
        </div>
      </div>
    </section>
  </div>;
}
