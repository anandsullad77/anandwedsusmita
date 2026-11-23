import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/backend';
import { ago, fmtDate, fmtTime } from '../lib/format';
import { normalizeGeneralSettings } from '../lib/generalInvitation';
import type { Announcement, GeneralInviteBundle, Photo } from '../lib/types';
import { Icon } from './Icon';
import InvitationHero from './InvitationHero';
import InvitationDownloads from './InvitationDownloads';
import Wishes from './Wishes';
import PhotoQuests from './PhotoQuests';
import { WeddingSignoff } from '../components/WeddingBrand';

export default function InvitationPage({ bundle, base, token, invitationPath, children }: { bundle: GeneralInviteBundle; base: string; token: string; invitationPath: string; children?: ReactNode }) {
  const { hash } = useLocation();
  const { event, functions } = bundle;
  const settings = normalizeGeneralSettings(bundle.settings);
  const { sections } = settings;
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);

  // Run after this route commits, so returning from Photos can find the section.
  useEffect(() => {
    if (!hash) return;
    const target = document.getElementById(hash.slice(1));
    target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    target?.focus({ preventScroll: true });
  }, [hash, event.id]);

  useEffect(() => {
    let alive = true;
    if (sections.updates) api.announcements(event.id).then(a => { if (alive) setAnnouncements(a); }).catch(() => {});
    if (sections.photos) api.listPhotos(event.id).then(p => { if (alive) setPhotos(p); }).catch(() => {});
    return () => { alive = false; };
  }, [event.id, sections.photos, sections.updates]);

  return (<>
    <InvitationHero event={event} settings={settings} />
    {children}

    {sections.updates && announcements.length > 0 && <section className="general-host-updates" aria-labelledby="host-updates-title" lang="en">
      <div className="general-update-icon"><Icon d="M3 10v4h4l10 5V5L7 10H3zM7 14l2 7h3M21 8v8" size={22} /></div>
      <div className="general-update-content"><h2 id="host-updates-title">From the hosts <span>{ago(announcements[0].at)}</span></h2><p>{announcements[0].body}</p>
        {announcements.length > 1 && <details><summary>Earlier updates ({announcements.length - 1})</summary>{announcements.slice(1).map(a => <div className="general-earlier-update" key={a.id}><p>{a.body}</p><time dateTime={a.at}>{ago(a.at)}</time></div>)}</details>}
      </div>
    </section>}

    {sections.schedule && functions.length > 1 && <section className="general-section general-schedule" lang="en" aria-labelledby="celebration-title">
      <div className="general-section-heading"><p className="general-eyebrow">A day to remember</p><h2 id="celebration-title">The celebration</h2></div>
      <div className="general-schedule-list">{functions.map((f, i) => <article key={f.id}><span className="general-schedule-number">{String(i + 1).padStart(2, '0')}</span><div><h3>{f.nameEn}</h3><time dateTime={f.startsAt}>{fmtDate(f.startsAt)} · {fmtTime(f.startsAt)} IST</time>{f.venue && <p>{f.venue}</p>}</div></article>)}</div>
    </section>}

    {(sections.photos || sections.uploads) && <section id="moments" className="general-section general-moments" lang="en" aria-labelledby="moments-title">
      <div className="general-section-heading"><p className="general-eyebrow">Our shared album</p><h2 id="moments-title">Every moment,<br /> together.</h2>
        <p>{sections.photos && sections.uploads ? 'The little moments. The happy tears. See the day through everyone’s eyes, and share a few memories of your own.' : sections.photos ? 'See the celebration through the eyes of the people who made it special.' : 'Your favourite moments belong here. Share your photos with the couple.'}</p>
        <div className="general-actions">
          {sections.photos && <Link to={`${base}/scene`} className="btn btn-deep" aria-label="View photos on Scene">View photos <Icon size={18} d="M5 12h14m-6-6l6 6-6 6" /></Link>}
          {sections.uploads && <Link to={`${base}/haaku`} className="btn btn-ghost">Share your photos</Link>}
        </div>
      </div>
      {sections.photos && photos.length > 0 ? <Link to={`${base}/scene`} aria-label="View latest wedding photos" className="general-photo-preview">
        {photos.slice(0, 3).map((p, i) => <img key={p.id} src={p.url} alt={p.caption ?? `Photo by ${p.uploaderName}`} loading="lazy" className={`general-photo-${i + 1}`} />)}
        <span className="general-photo-caption">{photos.length} {photos.length === 1 ? 'memory' : 'memories'} shared <Icon size={16} d="M5 12h14m-6-6l6 6-6 6" /></span>
      </Link> : <div className="general-photo-empty" aria-label="Shared wedding album">
        <div className="general-empty-frames" aria-hidden="true"><span /><span><Icon d="M3 6h18v14H3zM7 6l2-3h6l2 3M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8" size={34} /></span><span /></div>
        <p>The best moments<br /><i>are made together.</i></p><span>{sections.uploads ? 'Your photos will help tell the story.' : 'Wedding photos will appear here.'}</span>
      </div>}
    </section>}
    {sections.quests && sections.uploads && <PhotoQuests eventId={event.id} base={base} showCollections={sections.photos} />}
    {sections.guestbook && <Wishes eventId={event.id} token={token} guestName={bundle.guestName} />}
    {sections.download && <InvitationDownloads bundle={bundle} settings={settings} link={`${location.origin}${invitationPath}`} />}
    <WeddingSignoff />
  </>);
}
