import { useEffect, useState } from 'react';
import { useGuestAuth } from './useGuestAuth';

// Hosts can walk through the live guest experience without posting anything.
// The flag lives in this tab only; closing the tab or "Back to admin" ends it.
const KEY = 'as-wedding-guest-preview';
const EVENT = 'as-wedding-guest-preview';

export const GUEST_PREVIEW_PATH = '/invitation?preview=guest';

export function guestPreviewRequested(): boolean {
  try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}
export function enterGuestPreview() {
  try { sessionStorage.setItem(KEY, '1'); } catch { /* Private mode: the banner simply won't persist. */ }
  window.dispatchEvent(new Event(EVENT));
}
export function exitGuestPreview() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVENT));
}

/** True only for a signed-in host who asked to preview; guests are never affected. */
export function useGuestPreview(): boolean {
  const { user } = useGuestAuth();
  const [requested, setRequested] = useState(() => {
    if (new URLSearchParams(window.location.search).get('preview') === 'guest') {
      try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ }
      return true;
    }
    return guestPreviewRequested();
  });
  useEffect(() => {
    const sync = () => setRequested(guestPreviewRequested());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return requested && !!user?.host;
}
