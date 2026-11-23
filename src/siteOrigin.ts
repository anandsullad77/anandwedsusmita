export const PUBLIC_SITE_ORIGIN = import.meta.env.VITE_SITE_URL || 'https://anandwedsusmita.in';

// PKCE verifiers and return state belong to an origin. Move to the canonical
// domain before starting OAuth, never halfway through a sign-in attempt.
export function siteOrigin(location: Location = window.location): string {
  return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    ? location.origin : PUBLIC_SITE_ORIGIN;
}
