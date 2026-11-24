import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/backend';
import { ago, fmtDate, fmtTime } from '../lib/format';
import { normalizeGeneralSettings } from '../lib/generalInvitation';
import type { Announcement, GeneralInviteBundle, Photo } from '../lib/types';
import { Icon } from './Icon';
import InvitationHero from './InvitationHero';
import InvitationPhotoPreview from './InvitationPhotoPreview';
import InvitationDownloads from './InvitationDownloads';
import PhotoQuests from './PhotoQuests';
import { WeddingSignoff } from '../components/WeddingBrand';
import { useGuestAuth } from '../lib/useGuestAuth';
import './invitation-page.css';

export default function InvitationPage({ bundle, base, token, invitationPath, children }: { bundle: GeneralInviteBundle; base: string; token: string; invitationPath: string; children?: ReactNode }) {
  const { hash } = useLocation();
  const { canAccess, user } = useGuestAuth();
  const { event, functions } = bundle;
  const settings = normalizeGeneralSettings(bundle.settings);
  const { sections } = settings;
  const hasMoments = sections.photos || sections.uploads || sections.guestbook;
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const previewPhotos = canAccess
    ? photos.slice(0, 3).map(photo => ({ id: photo.id, url: photo.url, alt: photo.caption ?? `Photo by ${photo.uploaderName}` }))
    : settings.previewPhotos.filter(photo => photo.url).map((photo, index) => ({ id: photo.path ?? String(index), url: photo.url!, alt: `Wedding preview photo ${index + 1}` }));

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
    setPhotos([]);
    if (sections.photos && canAccess) api.listPhotos(event.id, { preview: true }).then(p => { if (alive) setPhotos(p); }).catch(() => {});
    return () => { alive = false; };
  }, [event.id, sections.photos, sections.updates, canAccess, user?.id]);

  return (<div className="invitation-page">
    <InvitationHero event={event} settings={settings} momentsPath={hasMoments ? `${base}#moments` : undefined} />
    {children}

    {sections.updates && announcements.length > 0 && <section className="general-host-updates" aria-labelledby="host-updates-title" lang="en">
      <div className="general-update-icon"><Icon d="M3 10v4h4l10 5V5L7 10H3zM7 14l2 7h3M21 8v8" size={22} /></div>
      <div className="general-update-content"><h2 id="host-updates-title">From the hosts <span>{ago(announcements[0].at)}</span></h2><p>{announcements[0].body}</p>
        {announcements.length > 1 && <details><summary>Earlier updates ({announcements.length - 1})</summary>{announcements.slice(1).map(a => <div className="general-earlier-update" key={a.id}><p>{a.body}</p><time dateTime={a.at}>{ago(a.at)}</time></div>)}</details>}
      </div>
    </section>}

    {sections.schedule && functions.length > 1 && <section id="celebration" tabIndex={-1} className="general-section general-schedule" lang="en" aria-labelledby="celebration-title">
      <div className="general-section-heading"><p className="general-eyebrow">The order of the day</p><h2 id="celebration-title">Let’s celebrate.</h2><p>A little guide to the moments we can’t wait to share with you.</p></div>
      <div className="general-schedule-list">{functions.map((f, i) => <article key={f.id}><span className="general-schedule-number">{String(i + 1).padStart(2, '0')}</span><div><h3>{f.nameEn}</h3><time dateTime={f.startsAt}>{fmtDate(f.startsAt)} · {fmtTime(f.startsAt)} IST</time>{f.venue && <p>{f.venue}</p>}</div></article>)}</div>
    </section>}

    {hasMoments && <section id="moments" tabIndex={-1} className="general-section general-moments" lang="en" aria-labelledby="moments-title">
      <div className="general-section-heading"><p className="general-eyebrow">Through your eyes</p><h2 id="moments-title">Our day. <i>Your memories.</i></h2>
        <p>The happy tears. The spontaneous dancing. The people we love. Help us hold on to every little moment.</p>
        <div className="general-actions">
          {(sections.photos || sections.guestbook) && <Link to={`${base}/feed`} className="btn btn-deep">Explore the feed <Icon size={17} d="M5 12h14m-6-6l6 6-6 6" /></Link>}
        </div>
        <p className="general-moments-note"><Icon size={15} d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3" />{canAccess ? 'A shared space for our wedding guests.' : 'Sign in with Google to view and share memories.'}</p>
      </div>
      {sections.photos && previewPhotos.length > 0 ? <InvitationPhotoPreview photos={previewPhotos} to={`${base}/feed`} publicPreview={!canAccess} /> : <div className="general-photo-empty" aria-label={sections.photos || sections.uploads ? 'Shared wedding album' : 'Wedding wishes'}>
        <div className="general-empty-frames" aria-hidden="true"><span /><span><Icon d={sections.photos || sections.uploads ? 'M3 6h18v14H3zM7 6l2-3h6l2 3M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8' : 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z'} size={34} /></span><span /></div>
        <p>{sections.photos || sections.uploads ? <>The best moments<br /><i>are made together.</i></> : <>A little love.<br /><i>A lifetime of happiness.</i></>}</p><span>{sections.uploads ? 'Your photos will help tell the story.' : sections.photos ? 'Wedding photos will appear here.' : 'Your wishes mean the world to us.'}</span>
      </div>}
      {(sections.uploads || sections.guestbook) && <div className="general-participate" aria-label="Be part of the celebration">
        {sections.uploads && <Link className="general-participate-card" to={`${base}/create?type=photos`}><span className="general-participate-icon"><Icon size={23} d="M3 7h4l2-3h6l2 3h4v13H3zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6" /></span><span><b>Share your photos</b><small>Big moments. Little details. Your perspective.</small></span><Icon size={19} d="M7 17L17 7M7 7h10v10" /></Link>}
        {sections.guestbook && <Link className="general-participate-card" to={`${base}/create?type=wish`}><span className="general-participate-icon"><Icon size={23} d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" /></span><span><b>Leave a little love</b><small>A wish for the beautiful journey ahead.</small></span><Icon size={19} d="M7 17L17 7M7 7h10v10" /></Link>}
      </div>}
    </section>}
    {sections.quests && sections.uploads && <PhotoQuests eventId={event.id} base={base} showCollections={sections.photos} />}
    {sections.download && <InvitationDownloads bundle={bundle} settings={settings} link={`${location.origin}${invitationPath}`} />}
    <div className="general-closing" lang="en"><p className="general-eyebrow">The best part of our day?</p><p>Having you in it.</p><span>With love, {event.coupleA} &amp; {event.coupleB}</span></div>
    <WeddingSignoff />
  </div>);
}
