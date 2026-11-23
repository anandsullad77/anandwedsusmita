import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '';
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY
    || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '';
  if (Boolean(url) !== Boolean(key)) {
    throw new Error('Set both the Supabase project URL and public publishable/anon key, or leave both empty for the local demo.');
  }
  if (key.startsWith('sb_secret_')) throw new Error('Use a public Supabase publishable key, never a secret key.');
  return {
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(key),
  },
  plugins: [VitePWA({
    registerType: 'autoUpdate',
    injectRegister: false,
    includeAssets: ['favicon.svg', 'icon.svg', 'images/google-sign-in.png'],
    manifest: {
      name: 'Anand & Susmita — Wedding',
      short_name: 'Anand & Susmita',
      description: 'Celebrate Anand and Susmita’s wedding, 29 November 2026.',
      theme_color: '#a53051',
      background_color: '#FFF7EB',
      display: 'standalone',
      start_url: '/',
      icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
    },
    workbox: {
      navigateFallback: '/index.html',
      // Invitation assets + application bundles; unused large artwork stays on demand.
      globPatterns: ['**/*.{js,css,html,woff2}', 'images/*.svg', 'images/wedding-couple-pink-green.png'],
      globIgnores: ['**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese,devanagari}-*'],
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      skipWaiting: true,
      clientsClaim: true,
      cleanupOutdatedCaches: true,
    },
  })],
  server: {
    watch: {
      ignored: ['**/artifacts/**'],
      // Windows can lock a new image while it is being copied into the project.
      usePolling: process.platform === 'win32',
      interval: 250,
      binaryInterval: 500,
    },
  },
  };
});
