import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { normalizeGeneralSettings } from '../lib/generalInvitation';
import type { GeneralInviteBundle, PhotoContext } from '../lib/types';
import { Icon } from './Icon';
import Haaku from './Haaku';
import Scene from './Scene';
import InvitationPage from './InvitationPage';
import WeddingBrand from '../components/WeddingBrand';
import { GuestAccount, GuestContentGate } from '../components/GoogleSignIn';
import './app.css';
import './general.css';

type Props = {
  bundle: GeneralInviteBundle;
  base: string;
  token: string;
  photoContext: PhotoContext;
  invitationPath?: string;
  personalSection?: ReactNode;
  familyPage?: ReactNode;
};

// Both entry points use these routes, navigation and pages. Family features are optional additions.
export default function InvitationExperience({ bundle, base, token, photoContext, invitationPath = base, personalSection, familyPage }: Props) {
  const current = useLocation();
  const sections = normalizeGeneralSettings(bundle.settings).sections;
  const ctx: PhotoContext = { ...photoContext, scenePath: sections.photos ? `${base}/scene` : base, questsEnabled: sections.quests };
  const onScene = current.pathname === `${base}/scene`;
  const onFamily = !!familyPage && current.pathname === `${base}/family`;
  const onInvitation = !onScene && !onFamily && current.hash !== '#wishes';

  useEffect(() => {
    if (!current.hash) window.scrollTo({ top: 0, behavior: 'instant' });
  }, [bundle.event.id, current.pathname, current.hash]);

  return (
    <Routes>
      <Route path="haaku" element={sections.uploads ? <GuestContentGate standalone base={base} purpose="share your wedding photos"><Haaku key={current.search} ctx={ctx} /></GuestContentGate> : <Navigate to={base} replace />} />
      <Route path="*" element={
        <div className="gapp general-shell">
          <a className="general-skip" href="#general-content">Skip to content</a>
          <header className="general-header">
            <div className="general-header-inner">
              <WeddingBrand className="general-brand" tagline="Together with our families" />
              <nav className="general-nav" aria-label="Wedding" lang="en" style={{ gridTemplateColumns: `repeat(${1 + Number(sections.photos) + Number(sections.guestbook) + Number(sections.uploads) + Number(!!familyPage)}, minmax(0, 1fr))` }}>
                <Link to={base} className={onInvitation ? 'active' : undefined} aria-current={onInvitation ? 'page' : undefined}><Icon d="M3 5h18v14H3zM3 5l9 7 9-7" /><span>Invitation</span></Link>
                {sections.photos && <NavLink to={`${base}/scene`}><Icon d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM21 16l-5-5-9 9" /><span>Photos</span></NavLink>}
                {sections.guestbook && <Link to={`${base}#wishes`} className={current.hash === '#wishes' ? 'active' : undefined} aria-current={current.hash === '#wishes' ? 'location' : undefined}><Icon d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" /><span>Wishes</span></Link>}
                {sections.uploads && <NavLink to={`${base}/haaku`} className="general-upload-link"><Icon d="M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" /><span>Upload</span></NavLink>}
                {familyPage && <NavLink to={`${base}/family`}><Icon d="M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c.6-3 2.6-4.5 5-4.5s4.4 1.5 5 4.5M13 15.6c.9-.1 1.9-.1 3-.1 2.4 0 4.4 1.5 5 4.5" /><span>Family</span></NavLink>}
              </nav>
            </div>
          </header>
          <GuestAccount />
          <main id="general-content" tabIndex={-1} className={`general-main${onScene ? ' general-main-scene' : onFamily ? ' general-main-family' : ''}`}>
            <Routes>
              <Route index element={<InvitationPage bundle={bundle} base={base} token={token} invitationPath={invitationPath}>{personalSection}</InvitationPage>} />
              <Route path="scene" element={sections.photos ? <GuestContentGate base={base} purpose="view the wedding photos"><Scene ctx={ctx} canUpload={sections.uploads} /></GuestContentGate> : <Navigate to={base} replace />} />
              {familyPage && <Route path="family" element={familyPage} />}
              <Route path="*" element={<Navigate to={base} replace />} />
            </Routes>
          </main>
        </div>
      } />
    </Routes>
  );
}
