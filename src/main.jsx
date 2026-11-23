// Each experience loads its own styles so the original invitation stays intact.
if (window.location.pathname === '/') {
  void import('./home-entry.jsx');
} else {
  void import('./companion/main.tsx');
}