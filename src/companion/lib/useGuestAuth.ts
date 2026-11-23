import { useEffect, useSyncExternalStore } from 'react';
import { getAuthState, initializeGuestAuth, subscribeAuth } from './guestAuth';

export function useGuestAuth() {
  const state = useSyncExternalStore(subscribeAuth, getAuthState);
  useEffect(initializeGuestAuth, []);
  return { ...state, canAccess: state.ready && !!state.user };
}
