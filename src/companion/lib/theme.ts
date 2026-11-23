import type { EventInfo } from './types';

// This single wedding shares src/theme.css with the original invitation.
// Older Supabase/demo records must not bring back the pilot's alternate branding.
export function applyTheme(e: EventInfo | null | undefined) {
  if (!e) return;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#a53051');
}
