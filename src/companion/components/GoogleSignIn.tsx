import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { signInWithGoogle, signOutGuest, type GuestIdentity } from '../lib/guestAuth';
import { useGuestAuth } from '../lib/useGuestAuth';
import WeddingBrand from './WeddingBrand';
import { Icon } from '../guest/Icon';
import './google-sign-in.css';
import { getSession } from '../lib/familySession';
import { WEDDING_SLUG } from '../lib/wedding';

export function GoogleSignIn({ returnTo, purpose = 'share in the celebration' }: { returnTo: string; purpose?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <div className="google-sign-in">
    <p>Sign in with Google to {purpose}.</p>
    <button className="google-sign-in-button" disabled={busy} onClick={async () => {
      setBusy(true); setError(null);
      try { await signInWithGoogle(returnTo); }
      catch (error) { setError((error as Error).message); setBusy(false); }
    }}><img src="/images/google-sign-in.png" width={20} height={20} alt="" aria-hidden="true" />{busy ? 'Opening Google…' : 'Continue with Google'}</button>
    <small>Your invitation stays public. Photos and wishes are shared with signed-in wedding guests.</small>
    <small>Your Google name and email are visible only to the wedding hosts. They may use your email to send you wedding memories, including your posts.</small>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}

export function GuestContentGate({ children, base, purpose, standalone = false }: { children: ReactNode; base: string; purpose: string; standalone?: boolean }) {
  const auth = useGuestAuth();
  const current = useLocation();
  if (!auth.ready) return <div className={standalone ? 'guest-sign-in-screen' : 'guest-content-lock'}>{standalone && <WeddingBrand />}<p role="status">Checking your sign-in…</p></div>;
  if (auth.canAccess) return <>{children}</>;
  return <div className={standalone ? 'guest-sign-in-screen' : 'guest-content-lock'}>{standalone && <WeddingBrand />}<h1>A little closer to the celebration</h1>
    <GoogleSignIn returnTo={current.pathname + current.search + current.hash} purpose={purpose} />
    <Link className="btn btn-ghost" to={base}>Back to the invitation</Link>
  </div>;
}

function GuestAvatar({ user }: { user: GuestIdentity }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const names = user.name.trim().split(/\s+/).filter(Boolean);
  const initials = [names[0]?.[0], names.length > 1 ? names.at(-1)?.[0] : ''].join('').toLocaleUpperCase() || 'G';
  return <span className="guest-avatar" aria-hidden="true">
    {user.avatarUrl && failedUrl !== user.avatarUrl
      ? <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(user.avatarUrl!)} />
      : initials}
  </span>;
}

export function GuestAccount({ base = '/invitation' }: { base?: string }) {
  const { user } = useGuestAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const current = useLocation();
  const family = getSession();
  const hasFamily = family?.slug === WEDDING_SLUG;

  useEffect(() => { setOpen(false); }, [current.pathname, current.search, current.hash, user?.id]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: Event) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
    };
  }, [open]);

  if (!user) return null;
  return <div className="guest-account" ref={container} onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
    }
  }}>
    <button ref={trigger} type="button" className="guest-account-trigger" aria-label={`Account menu for ${user.name}`} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
      <GuestAvatar key={user.id} user={user} />
    </button>
    {open && <div className="guest-account-panel" id={panelId}>
      <div className="guest-account-details"><GuestAvatar user={user} /><div><b>{user.name}</b>{user.email && <span>{user.email}</span>}</div></div>
      <div className="guest-account-actions">
        <Link to={base} onClick={() => setOpen(false)}><Icon size={18} d="M3 5h18v14H3zM3 5l9 7 9-7" />Wedding invitation</Link>
        {hasFamily && <Link to="/app/family" onClick={() => setOpen(false)}><Icon size={18} d="M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6M16 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3 20a5 5 0 0 1 10 0M13 16a5 5 0 0 1 8 4" />Family RSVP</Link>}
        <button type="button" disabled={busy} onClick={async () => {
          setBusy(true); setError(null);
          try { await signOutGuest(); } catch (error) { setError((error as Error).message); setBusy(false); }
        }}><Icon size={18} d="M9 4H4v16h5M14 8l4 4-4 4M8 12h13" />{busy ? 'Signing out…' : 'Sign out'}</button>
      </div>
      {error && <p className="error guest-account-error" role="alert">{error}</p>}
    </div>}
  </div>;
}
