import { localBackend } from './localBackend';
import { supabaseBackend } from './supabaseBackend';
import type { Backend } from './types';
import { WEDDING_SLUG } from './wedding';
import { requireGuestSignIn } from './guestAuth';
export { getSession, setSession, clearSession } from './familySession';

// Supabase when configured (.env), otherwise the in-browser demo backend.
const backend = import.meta.env.VITE_SUPABASE_URL ? supabaseBackend : localBackend;
export const api: Backend = {
  ...backend,
  async listPhotos(...args) { await requireGuestSignIn(); return backend.listPhotos(...args); },
  async photoQuestSummary(...args) { await requireGuestSignIn(); return backend.photoQuestSummary(...args); },
  async listWishes(...args) { await requireGuestSignIn(); return backend.listWishes(...args); },
  async submitWish(...args) { await requireGuestSignIn(); return backend.submitWish(...args); },
  async uploadPhoto(...args) { await requireGuestSignIn(); return backend.uploadPhoto(...args); },
  async toggleAkshate(...args) { await requireGuestSignIn(); return backend.toggleAkshate(...args); },
  async flagPhoto(...args) { await requireGuestSignIn(); return backend.flagPhoto(...args); },
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
