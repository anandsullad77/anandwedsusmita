import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { signInWithGoogle, signOutGuest } from '../lib/guestAuth';
import { useGuestAuth } from '../lib/useGuestAuth';
import WeddingBrand from './WeddingBrand';
import './google-sign-in.css';

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

export function GuestAccount() {
  const { user } = useGuestAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  return <div className="guest-account"><span>Signed in as <b>{user.name}</b></span><button disabled={busy} onClick={async () => {
    setBusy(true); setError(null);
    try { await signOutGuest(); } catch (error) { setError((error as Error).message); setBusy(false); }
  }}>{busy ? 'Signing out…' : 'Sign out'}</button>{error && <span className="error" role="alert">{error}</span>}</div>;
}
