import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { normalizeGeneralSettings } from '../lib/generalInvitation';
import type { GeneralInviteBundle, PhotoContext } from '../lib/types';
import { Icon } from './Icon';
import CreatePost from './CreatePost';
import Scene from './Scene';
import InvitationPage from './InvitationPage';
import WeddingBrand from '../components/WeddingBrand';
import { GuestAccount, GuestContentGate } from '../components/GoogleSignIn';
import { restoreAuthPosition } from '../lib/guestAuth';
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
  const hasFeed = sections.photos || sections.guestbook;
  const canCreate = sections.uploads || sections.guestbook;
  const ctx: PhotoContext = { ...photoContext, scenePath: hasFeed ? `${base}/feed` : base, questsEnabled: sections.quests };
  const onScene = current.pathname === `${base}/feed`;
  const onCreate = current.pathname === `${base}/create`;
  const onFamily = !!familyPage && current.pathname === `${base}/family`;
  const onInvitation = !onScene && !onFamily && !onCreate;
  const photoSearch = new URLSearchParams(current.search);
  photoSearch.set('type', 'photos');

  useEffect(() => {
    if (!current.hash) window.scrollTo({ top: 0, behavior: 'instant' });
    restoreAuthPosition(current.pathname + current.search + current.hash);
  }, [bundle.event.id, current.pathname, current.search, current.hash]);

  return (
    <Routes>
      <Route path="haaku" element={<Navigate to={`${base}/create?${photoSearch}${current.hash}`} replace />} />
      <Route path="scene" element={<Navigate to={`${base}/feed${current.search}${current.hash}`} replace />} />
      <Route path="wishes" element={<Navigate to={`${base}/feed${current.search}`} replace />} />
      <Route path="*" element={
        <div className="gapp general-shell">
          <a className="general-skip" href="#general-content">Skip to content</a>
          <header className="general-header">
            <div className="general-header-inner">
              <WeddingBrand className="general-brand" tagline="Together with our families" />
              <nav className="general-nav" aria-label="Wedding" lang="en" style={{ gridTemplateColumns: `repeat(${1 + Number(hasFeed) + Number(canCreate) + Number(!!familyPage)}, minmax(0, 1fr))` }}>
                <Link to={base} className={onInvitation ? 'active' : undefined} aria-current={onInvitation ? 'page' : undefined}><Icon d="M3 5h18v14H3zM3 5l9 7 9-7" /><span>Invitation</span></Link>
                {canCreate && <NavLink to={`${base}/create`} className="general-upload-link"><Icon d="M12 5v14M5 12h14" /><span>Create Post</span></NavLink>}
                {hasFeed && <NavLink to={`${base}/feed`}><Icon d="M3 6h18v14H3zM7 10h10M7 15h6" /><span>Feed</span></NavLink>}
                {familyPage && <NavLink to={`${base}/family`}><Icon d="M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c.6-3 2.6-4.5 5-4.5s4.4 1.5 5 4.5M13 15.6c.9-.1 1.9-.1 3-.1 2.4 0 4.4 1.5 5 4.5" /><span>Family</span></NavLink>}
              </nav>
              <GuestAccount base={base} />
            </div>
          </header>
          <main id="general-content" tabIndex={-1} className={`general-main${onScene || onCreate ? ' general-main-scene' : onFamily ? ' general-main-family' : ''}`}>
            <Routes>
              <Route index element={current.hash === '#wishes' ? <Navigate to={`${base}/feed${current.search}`} replace /> : <InvitationPage bundle={bundle} base={base} token={token} invitationPath={invitationPath}>{personalSection}</InvitationPage>} />
              <Route path="feed" element={hasFeed ? <GuestContentGate base={base} purpose="view the wedding Feed"><Scene ctx={ctx} canUpload={sections.uploads} canWish={sections.guestbook} showPhotos={sections.photos} /></GuestContentGate> : <Navigate to={base} replace />} />
              <Route path="create" element={<CreatePost ctx={ctx} base={base} token={token} canWish={sections.guestbook} canUpload={sections.uploads} />} />
              {familyPage && <Route path="family" element={familyPage} />}
              <Route path="*" element={<Navigate to={base} replace />} />
            </Routes>
          </main>
        </div>
      } />
    </Routes>
  );
}
