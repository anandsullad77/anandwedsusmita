import { localBackend } from './localBackend';
import { supabaseBackend } from './supabaseBackend';
import type { Backend, Session } from './types';
import { WEDDING_SLUG } from './wedding';

// Supabase when configured (.env), otherwise the in-browser demo backend.
const backend = import.meta.env.VITE_SUPABASE_URL ? supabaseBackend : localBackend;
export const api: Backend = {
  ...backend,
  async inviteBundle(token) {
    const bundle = await backend.inviteBundle(token);
    return bundle?.event.slug === WEDDING_SLUG ? bundle : null;
  },
  async generalInvite(token, name) {
    const bundle = await backend.generalInvite(token, name);
    return bundle?.event.slug === WEDDING_SLUG ? bundle : null;
  },
  async hostEvents() {
    return (await backend.hostEvents()).filter(event => event.slug === WEDDING_SLUG);
  },
};

const SESSION_KEY = 'as-wedding-session';
export function getSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
export function setSession(s: Session) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
export function clearSession() { localStorage.removeItem(SESSION_KEY); }
