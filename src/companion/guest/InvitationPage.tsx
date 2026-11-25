import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/backend';
import { ago, fmtDate, fmtTime } from '../lib/format';
import { normalizeGeneralSettings } from '../lib/generalInvitation';
import type { Announcement, GeneralInviteBundle, Photo, Wish } from '../lib/types';
import { Icon } from './Icon';
import InvitationHero from './InvitationHero';
import InvitationDownloads from './InvitationDownloads';
import InviteGallery from './InviteGallery';
import { siteOrigin } from '../../siteOrigin';
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
  const [wishes, setWishes] = useState<Wish[]>([]);
  const previewPhotos = canAccess
    ? photos.filter(photo => !photo.hidden).slice(0, 4).map(photo => ({ id: photo.id, url: photo.url, alt: photo.caption ?? `Photo by ${photo.uploaderName}` }))
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
    setWishes([]);
    if (sections.guestbook && canAccess) api.listWishes(event.id).then(w => { if (alive) setWishes(w.filter(wish => wish.status === 'approved').slice(0, 2)); }).catch(() => {});
    return () => { alive = false; };
  }, [event.id, sections.photos, sections.updates, sections.guestbook, canAccess, user?.id]);

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

    {hasMoments && <InviteGallery base={base} photos={previewPhotos} wishes={wishes} canUpload={sections.uploads} canWish={sections.guestbook} locked={!canAccess} />}
    {sections.download && <InvitationDownloads bundle={bundle} settings={settings} link={`${location.origin}${invitationPath}`} publicLink={`${siteOrigin()}/?from=status`} />}
    <div className="general-closing" lang="en"><p className="general-eyebrow">The best part of our day?</p><p>Having you in it.</p><span>With love, {event.coupleA} &amp; {event.coupleB}</span></div>
    <WeddingSignoff />
  </div>);
}
