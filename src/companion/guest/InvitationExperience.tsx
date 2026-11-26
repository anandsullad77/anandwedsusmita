import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { normalizeGeneralSettings } from '../lib/generalInvitation';
import type { GeneralInviteBundle, PhotoContext } from '../lib/types';
import { Icon } from './Icon';
import CreatePost from './CreatePost';
import Scene from './Scene';
import InvitationPage from './InvitationPage';
import WeddingPlayground from './WeddingPlayground';
import NostalgiaPage from './NostalgiaPage';
import WeddingBrand from '../components/WeddingBrand';
import { GuestAccount, GuestContentGate } from '../components/GoogleSignIn';
import { restoreAuthPosition } from '../lib/guestAuth';
import { useGuestPreview } from '../lib/guestPreview';
import { GuestPreviewBanner } from './GuestPreview';
import './app.css';
import './general.css';

type Props = {
  bundle: GeneralInviteBundle;
  base: string;
  token: string;
  photoContext: PhotoContext;
  personalSection?: ReactNode;
  familyPage?: ReactNode;
};

// Both entry points use these routes, navigation and pages. Family features are optional additions.
export default function InvitationExperience({ bundle, base, token, photoContext, personalSection, familyPage }: Props) {
  const current = useLocation();
  const preview = useGuestPreview();
  const sections = normalizeGeneralSettings(bundle.settings).sections;
  const hasFeed = sections.photos || sections.guestbook;
  const canCreate = sections.uploads || sections.guestbook;
  const ctx: PhotoContext = { ...photoContext, scenePath: hasFeed ? `${base}/feed` : base, questsEnabled: sections.quests };
  const onScene = current.pathname === `${base}/feed`;
  const onCreate = current.pathname === `${base}/create`;
  const onNostalgia = current.pathname === `${base}/nostalgia`;
  const onPlayground = current.pathname === `${base}/playground` || current.pathname.startsWith(`${base}/playground/`);
  const onFamily = !!familyPage && current.pathname === `${base}/family`;
  const onInvitation = !onScene && !onFamily && !onCreate && !onNostalgia && !onPlayground;
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
          {preview && <GuestPreviewBanner />}
          <a className="general-skip" href="#general-content">Skip to content</a>
          <header className="general-header">
            <div className="general-header-inner">
              <WeddingBrand className="general-brand" tagline="Together," title="With Love" />
              <nav className="general-nav" aria-label="Wedding" lang="en" style={{ gridTemplateColumns: `repeat(${1 + Number(sections.nostalgia) + Number(canCreate) + Number(hasFeed) + Number(sections.playground)}, minmax(0, 1fr))` }}>
                <Link to={base} className={onInvitation ? 'active' : undefined} aria-current={onInvitation ? 'page' : undefined}><Icon d="M3 5h18v14H3zM3 5l9 7 9-7" /><span>Invitation</span></Link>
                {sections.nostalgia && <NavLink to={`${base}/nostalgia`}><Icon d="M4 4h6v16H4zM14 4h6v16h-6M7 8h0M17 8h0M7 12h0M17 12h0" /><span>Nostalgia</span></NavLink>}
                {canCreate && <NavLink to={`${base}/create`} className="general-upload-link"><span className="general-upload-circle"><Icon d="M12 5v14M5 12h14" /></span><span>Create Post</span></NavLink>}
                {hasFeed && <NavLink to={`${base}/feed`}><Icon d="M3 6h18v14H3zM7 10h10M7 15h6" /><span>Feed</span></NavLink>}
                {sections.playground && <Link to={`${base}/playground`} className={onPlayground ? 'active' : undefined} aria-current={onPlayground ? 'page' : undefined}><Icon d="M8 21h8M12 17v4M7 3h10v7a5 5 0 0 1-10 0V3M7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4" /><span>Playground</span></Link>}
              </nav>
              <GuestAccount base={base} />
            </div>
          </header>
          <main id="general-content" tabIndex={-1} className={`general-main${onScene || onCreate ? ' general-main-scene' : onFamily ? ' general-main-family' : ''}`}>
            <Routes>
              <Route index element={current.hash === '#wishes' ? <Navigate to={`${base}/feed${current.search}`} replace /> : <InvitationPage bundle={bundle} base={base} token={token}>{personalSection}</InvitationPage>} />
              <Route path="feed" element={hasFeed ? <GuestContentGate base={base} purpose="view the wedding Feed"><Scene ctx={ctx} canUpload={sections.uploads} canWish={sections.guestbook} showPhotos={sections.photos} /></GuestContentGate> : <Navigate to={base} replace />} />
              <Route path="create" element={<CreatePost ctx={ctx} base={base} token={token} canWish={sections.guestbook} canUpload={sections.uploads} />} />
              <Route path="nostalgia" element={sections.nostalgia ? <GuestContentGate base={base} purpose="see Anand and Susmita’s childhood photos"><NostalgiaPage base={base} /></GuestContentGate> : <Navigate to={base} replace />} />
              <Route path="playground" element={sections.playground ? <div className="invitation-page celebration-page"><WeddingPlayground event={bundle.event} base={base} /></div> : <Navigate to={base} replace />} />
              <Route path="playground/:activity" element={sections.playground ? <div className="invitation-page celebration-page"><WeddingPlayground event={bundle.event} base={base} /></div> : <Navigate to={base} replace />} />
              {familyPage && <Route path="family" element={familyPage} />}
              <Route path="*" element={<Navigate to={base} replace />} />
            </Routes>
          </main>
        </div>
      } />
    </Routes>
  );
}
