import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { EventInfo } from '../lib/types';
import { Icon } from '../guest/Icon';
import WeddingBrand, { WeddingTextile } from '../components/WeddingBrand';
import { GUEST_PREVIEW_PATH } from '../lib/guestPreview';

const EYE = 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z';

const links = [
  { to: '/admin', label: 'Overview', short: 'Overview', icon: 'M3 11l9-8 9 8v10h-6v-7H9v7H3z' },
  { to: '/admin/families', label: 'Families & invites', short: 'Families', icon: 'M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21v-2a6 6 0 0 1 12 0v2M17 4a4 4 0 0 1 0 8m-1 3a6 6 0 0 1 6 6' },
  { to: '/admin/general', label: 'General invitation', short: 'Invite', icon: 'M3 5h18v14H3zM3 5l9 7 9-7' },
  { to: '/admin/photos', label: 'Review posts', short: 'Review', icon: 'M3 6h18v14H3zM21 16l-5-5-9 9' },
  { to: '/admin/analytics', label: 'Analytics', short: 'Analytics', icon: 'M4 20h16M7 16v-5m5 5V5m5 11V9' },
  { to: '/admin/polls', label: 'Wedding Playground', short: 'Playground', icon: 'M4 20h16M7 16V9m5 7V4m5 12v-5' },
  { to: '/admin/updates', label: 'Gamanisi! updates', short: 'Updates', icon: 'M3 10v4h4l10 5V5L7 10H3zM7 14l2 7h3' },
  { to: '/admin/settings', label: 'PIN & links', short: 'Settings', icon: 'M9 15l6-6M8 5l2-2a5 5 0 0 1 7 7l-2 2M9 12l-2 2a5 5 0 0 0 7 7l2-2' },
  { to: '/admin/hosts', label: 'Hosts & co-owners', short: 'Hosts', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6m-3-3h6' },
];

export default function AdminNavigation({ event, flagged }: { event: EventInfo; flagged: number }) {
  const menu = useRef<HTMLDialogElement>(null);
  const current = useLocation();
  useEffect(() => { menu.current?.close(); window.scrollTo({ top: 0, behavior: 'instant' }); }, [current.pathname]);
  const items = () => links.map(link => <NavLink key={link.to} to={link.to} end={link.to === '/admin'}><Icon size={20} d={link.icon} /><span>{link.label}</span>{link.to === '/admin/photos' && flagged > 0 && <span className="admin-nav-count">{flagged}</span>}</NavLink>);
  return <>
    <a className="admin-skip" href="#admin-content">Skip to content</a>
    <aside className="admin-sidebar">
      <WeddingBrand className="admin-wedding-brand" />
      <div className="admin-event"><span className="admin-eyebrow">Host workspace</span><b>{event.coupleA} &amp; {event.coupleB}</b><span>{new Date(event.startsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })}</span></div>
      <a className="admin-view-as-guest" href={GUEST_PREVIEW_PATH}><Icon size={18} d={EYE} />View as guest</a>
      <nav className="anav" aria-label="Admin">{items()}</nav>
      <p className="admin-sidebar-note">A little planning.<br />A day to remember.</p>
      <WeddingTextile />
    </aside>
    <header className="admin-mobile-header"><WeddingBrand className="admin-mobile-brand" tagline="Host workspace" /><a className="admin-view-as-guest admin-view-as-guest-compact" href={GUEST_PREVIEW_PATH}><Icon size={18} d={EYE} /><span>View as guest</span></a><button className="admin-icon-button" aria-label="Open admin menu" aria-haspopup="dialog" aria-controls="admin-mobile-menu" onClick={() => menu.current?.showModal()}><Icon d="M4 6h16M4 12h16M4 18h16" /></button></header>
    <nav className="admin-bottom-nav" aria-label="Admin quick navigation">{links.slice(0, 4).map(link => <NavLink key={link.to} to={link.to} end={link.to === '/admin'} aria-label={link.label}><Icon size={20} d={link.icon} /><span>{link.short}</span>{link.to === '/admin/photos' && flagged > 0 && <i className="admin-nav-dot" />}</NavLink>)}<button aria-label="More admin pages" aria-haspopup="dialog" aria-controls="admin-mobile-menu" className={links.slice(4).some(link => link.to === current.pathname) ? 'active' : ''} onClick={() => menu.current?.showModal()}><Icon size={20} d="M5 12h.01M12 12h.01M19 12h.01" /><span>More</span></button></nav>
    <dialog id="admin-mobile-menu" ref={menu} className="admin-menu-dialog" aria-labelledby="admin-menu-title" onClick={e => { if (e.target === e.currentTarget) menu.current?.close(); }}><div className="admin-menu-heading"><div><p className="admin-eyebrow">Your wedding workspace</p><h2 id="admin-menu-title">Manage the celebration</h2></div><button className="admin-icon-button" aria-label="Close admin menu" onClick={() => menu.current?.close()}><Icon d="M6 6l12 12M18 6L6 18" /></button></div><nav className="anav" aria-label="All admin pages">{items()}</nav></dialog>
  </>;
}
