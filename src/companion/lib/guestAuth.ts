import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { clearSession, getSession } from './familySession';
import type { Session } from './types';
import { WEDDING_SLUG } from './wedding';
import { siteOrigin } from '../../siteOrigin';

export type GuestIdentity = { id: string; name: string; email?: string; avatarUrl?: string; host: boolean };
type AuthState = { ready: boolean; user: GuestIdentity | null };
type AuthReturn = { path: string; family: Session | null; scrollY: number };
const RETURN_KEY = 'as-wedding-google-return';
const RESUME_KEY = 'as-wedding-google-resume';
const listeners = new Set<() => void>();
let state: AuthState = { ready: false, user: null };
let initialized = false;
let revision = 0;
const configured = () => !!import.meta.env.VITE_SUPABASE_URL;

export const getAuthState = () => state;
export function subscribeAuth(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function publish(next: AuthState) { state = next; listeners.forEach(listener => listener()); }

export function safeGuestPath(value: string | null | undefined): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20\x7f]/.test(value)) return '/invitation';
  const url = new URL(value, window.location.origin);
  if (url.origin !== window.location.origin || !(url.pathname === '/' || /^\/(invitation|celebrate|app|rsvp|i\/[^/]+|e\/[^/]+|g\/[^/]+)(\/|$)/.test(url.pathname))) return '/invitation';
  return url.pathname + url.search + url.hash;
}

export async function readGuestIdentity(): Promise<GuestIdentity | null> {
  if (!configured()) return sessionStorage.getItem('as-wedding-host') ? { id: 'demo-host', name: 'Host', host: true } : null;
  const { data, error } = await supabase().auth.getSession();
  if (error) throw error;
  const user = data.session?.user;
  if (!user || user.is_anonymous) return null;
  const google = user.identities?.some(identity => identity.provider === 'google')
    || user.app_metadata.provider === 'google' || user.app_metadata.providers?.includes('google');
  const identity = (user: User, host: boolean): GuestIdentity => {
    let avatarUrl: string | undefined;
    try {
      const url = new URL(user.user_metadata.avatar_url || user.user_metadata.picture);
      if (url.protocol === 'https:') avatarUrl = url.href;
    } catch { /* Guests without a profile photo use their initials. */ }
    return { id: user.id, name: String(user.user_metadata.full_name || user.user_metadata.name || 'Guest'), email: user.email, avatarUrl, host };
  };
  if (google) return identity(user, false);
  // Email/password is retained for the wedding's existing host accounts only.
  const { data: hosts, error: hostError } = await supabase().from('hosts').select('event_id, events!inner(slug)')
    .eq('user_id', user.id).eq('events.slug', WEDDING_SLUG).limit(1);
  if (hostError) throw hostError;
  return hosts?.length ? identity(user, true) : null;
}

export async function refreshGuestAuth() {
  const request = ++revision;
  try {
    const user = await readGuestIdentity();
    if (request === revision) publish({ ready: true, user });
  } catch { if (request === revision) publish({ ready: true, user: null }); }
}

export function initializeGuestAuth() {
  if (initialized) return;
  initialized = true;
  if (configured()) supabase().auth.onAuthStateChange(() => {
    // Do not await another Supabase call inside its auth callback (the auth lock is held).
    setTimeout(() => void refreshGuestAuth(), 0);
  });
  window.addEventListener('focus', () => void refreshGuestAuth());
  void refreshGuestAuth();
}

export async function requireGuestSignIn(): Promise<GuestIdentity> {
  const user = await readGuestIdentity();
  if (!user) throw new Error('Sign in with Google to view photos, share memories, or leave a wish.');
  return user;
}

export async function signInWithGoogle(returnTo: string) {
  if (!configured()) throw new Error('Google sign-in is unavailable in this preview.');
  const pending: AuthReturn = { path: safeGuestPath(returnTo), family: getSession(), scrollY: window.scrollY };
  sessionStorage.setItem(RETURN_KEY, JSON.stringify(pending));
  const { data, error } = await supabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${siteOrigin()}/auth/callback`, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Could not open Google sign-in. Please try again.');
  window.location.assign(data.url);
}

export function pendingAuthReturn(): AuthReturn {
  try {
    const pending = JSON.parse(sessionStorage.getItem(RETURN_KEY) || 'null') as AuthReturn | null;
    return { path: safeGuestPath(pending?.path), family: pending?.family ?? null, scrollY: Number.isFinite(pending?.scrollY) ? Math.max(0, pending!.scrollY) : 0 };
  } catch { return { path: '/invitation', family: null, scrollY: 0 }; }
}
export function clearAuthReturn() { sessionStorage.removeItem(RETURN_KEY); }

export function saveAuthResume(saved: AuthReturn) {
  sessionStorage.setItem(RESUME_KEY, JSON.stringify({ path: saved.path, scrollY: saved.scrollY }));
}

// Called after the invitation bundle and destination UI have mounted.
export function restoreAuthPosition(path: string) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(RESUME_KEY) || 'null');
    if (!saved || saved.path !== path) return;
    sessionStorage.removeItem(RESUME_KEY);
    requestAnimationFrame(() => {
      let target: HTMLElement | null = null;
      try { target = window.location.hash ? document.getElementById(decodeURIComponent(window.location.hash.slice(1))) : null; } catch { /* An invalid fragment should not interrupt sign-in. */ }
      if (target) { target.scrollIntoView({ block: 'start', behavior: 'instant' }); target.focus({ preventScroll: true }); }
      else window.scrollTo({ top: saved.scrollY || 0, behavior: 'instant' });
    });
  } catch { sessionStorage.removeItem(RESUME_KEY); }
}

export async function signOutGuest() {
  if (configured()) {
    const { error } = await supabase().auth.signOut({ scope: 'local' });
    if (error) throw error;
  } else sessionStorage.removeItem('as-wedding-host');
  clearSession();
  publish({ ready: true, user: null });
  // Drop protected component state and signed URLs; the public invitation opens afresh.
  window.location.assign('/invitation');
}
