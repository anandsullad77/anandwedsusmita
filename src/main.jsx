import { siteOrigin } from './siteOrigin';

// Canonicalize before loading Auth, so its PKCE verifier stays on this domain.
if (window.location.origin !== siteOrigin()) {
  window.location.replace(siteOrigin() + window.location.pathname + window.location.search + window.location.hash);
} else if (window.location.pathname === '/') {
  void import('./home-entry.jsx');
} else {
  void import('./companion/main.tsx');
}
