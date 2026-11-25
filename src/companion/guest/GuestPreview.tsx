import { useNavigate } from 'react-router-dom';
import { exitGuestPreview } from '../lib/guestPreview';
import { Icon } from './Icon';
import './guest-preview.css';

export const PREVIEW_COPY = 'You’re seeing the live wedding as a guest. Posting photos, wishes and reactions is turned off.';

/** Pinned banner for hosts previewing the guest experience. */
export function GuestPreviewBanner() {
  const nav = useNavigate();
  return <div className="guest-preview-banner" role="region" aria-label="Guest preview" lang="en">
    <Icon size={18} d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    <p><b>Guest preview</b> <span>{PREVIEW_COPY}</span></p>
    <div className="guest-preview-actions">
      <a href="/">Website</a>
      <button type="button" onClick={() => { exitGuestPreview(); nav('/admin'); }}>Back to admin</button>
    </div>
  </div>;
}

/** Shown in place of Create Post while previewing. */
export function GuestPreviewNotice({ feedPath }: { feedPath: string }) {
  const nav = useNavigate();
  return <div className="create-sheet-backdrop" onClick={event => { if (event.target === event.currentTarget) nav(feedPath); }}>
    <section className="create-sheet create-sheet-center" role="dialog" aria-modal="true" aria-labelledby="preview-notice-title" lang="en">
      <span className="create-sheet-handle" aria-hidden="true" />
      <span className="guest-preview-notice-icon" aria-hidden="true"><Icon size={26} d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /></span>
      <h1 id="preview-notice-title">This is where guests share</h1>
      <p className="create-sheet-intro">Guests add photos and wishes from here. It’s turned off while you preview, so nothing is posted under your name.</p>
      <button type="button" className="btn btn-deep btn-block" onClick={() => nav(feedPath)}>Back to the gallery</button>
    </section>
  </div>;
}
