import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { clearSession, getSession } from './familySession';
import type { Session } from './types';
import { WEDDING_SLUG } from './wedding';

export type GuestIdentity = { id: string; name: string; host: boolean };
type AuthState = { ready: boolean; user: GuestIdentity | null };
type AuthReturn = { path: string; family: Session | null };
const RETURN_KEY = 'as-wedding-google-return';
const listeners = new Set<() => void>();
let state: AuthState = { ready: false, user: null };
let initialized = false;
let revision = 0;
const configured = () => !!import.meta.env.VITE_SUPABASE_URL;

export const getAuthState = () => state;
export function subscribeAuth(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function publish(next: AuthState) { state = next; listeners.forEach(listener => listener()); }

export function safeGuestPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/invitation';
  const url = new URL(value, window.location.origin);
  if (url.origin !== window.location.origin || !/^\/(invitation|app|g\/[^/]+)(\/|$)/.test(url.pathname)) return '/invitation';
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
  const name = (user: User) => String(user.user_metadata.full_name || user.user_metadata.name || 'Guest');
  if (google) return { id: user.id, name: name(user), host: false };
  // Email/password is retained for the wedding's existing host accounts only.
  const { data: hosts, error: hostError } = await supabase().from('hosts').select('event_id, events!inner(slug)')
    .eq('user_id', user.id).eq('events.slug', WEDDING_SLUG).limit(1);
  if (hostError) throw hostError;
  return hosts?.length ? { id: user.id, name: name(user), host: true } : null;
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
  const pending: AuthReturn = { path: safeGuestPath(returnTo), family: getSession() };
  sessionStorage.setItem(RETURN_KEY, JSON.stringify(pending));
  const { data, error } = await supabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback`, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Could not open Google sign-in. Please try again.');
  window.location.assign(data.url);
}

export function pendingAuthReturn(): AuthReturn {
  try {
    const pending = JSON.parse(sessionStorage.getItem(RETURN_KEY) || 'null') as AuthReturn | null;
    return { path: safeGuestPath(pending?.path), family: pending?.family ?? null };
  } catch { return { path: '/invitation', family: null }; }
}
export function clearAuthReturn() { sessionStorage.removeItem(RETURN_KEY); }

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
