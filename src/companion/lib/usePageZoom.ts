import { useSyncExternalStore } from 'react';

// Pinch zoom changes the visual viewport, without changing the CSS layout width.
export const isPageZoomed = () => (window.visualViewport?.scale ?? 1) > 1.01;

function subscribe(onChange: () => void) {
  const viewport = window.visualViewport;
  viewport?.addEventListener('resize', onChange);
  return () => viewport?.removeEventListener('resize', onChange);
}

export function usePageZoom() {
  return useSyncExternalStore(subscribe, isPageZoomed, () => false);
}
