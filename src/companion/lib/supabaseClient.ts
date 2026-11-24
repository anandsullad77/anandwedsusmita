import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Keep the SDK's PKCE verifier and recovery events, but send recovery requests
// through the server-side host check before Supabase sends an email.
const authFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const project = new URL(import.meta.env.VITE_SUPABASE_URL);
  if (request.method === 'POST' && url.origin === project.origin && url.pathname === '/auth/v1/recover') {
    url.pathname = '/functions/v1/host-password-reset';
    return fetch(url, { method: request.method, headers: request.headers, body: await request.text(), signal: request.signal });
  }
  return fetch(request);
};

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, flowType: 'pkce', detectSessionInUrl: false },
    global: { fetch: authFetch },
  });
  return client;
}
