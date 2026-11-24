const VISITOR_KEY = 'as-wedding-analytics-visitor';
const COUNTED_KEY = 'as-wedding-analytics-counted';
const DEMO_KEY = 'as-wedding-demo-analytics-visitors';
const signedIn = new Set<string>();
let pendingVisit: Promise<void> | null = null;

function visitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

export function demoVisitorCount(): number {
  try { return new Set<string>(JSON.parse(localStorage.getItem(DEMO_KEY) || '[]')).size; } catch { return 0; }
}

export function trackWeddingVisit(): void {
  // Count guest entry points only. Never send personal invite URLs or tokens.
  if (!/^\/(?:$|(?:invitation|celebrate|rsvp|app)(?:\/|$)|[ige]\/)/.test(location.pathname) || pendingVisit) return;
  pendingVisit = (async () => {
    try {
      const id = visitorId();
      if (localStorage.getItem(COUNTED_KEY) === id) return;
      if (import.meta.env.VITE_SUPABASE_URL) {
        // Keep the main invitation lightweight and avoid anonymous Auth creation.
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/record_wedding_visit`, {
          method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json', ...(key.startsWith('sb_publishable_') ? {} : { Authorization: `Bearer ${key}` }) },
          body: JSON.stringify({ p_visitor: id }), keepalive: true,
        });
        if (!response.ok) return;
      } else {
        const visits: string[] = JSON.parse(localStorage.getItem(DEMO_KEY) || '[]');
        localStorage.setItem(DEMO_KEY, JSON.stringify([...new Set([...visits, id])]));
      }
      localStorage.setItem(COUNTED_KEY, id);
    } catch { /* Analytics must never block an invitation or sign-in. */ }
  })().finally(() => { pendingVisit = null; });
}

export async function trackGuestSignIn(userId: string): Promise<void> {
  if (!import.meta.env.VITE_SUPABASE_URL || signedIn.has(userId)) return;
  signedIn.add(userId);
  try {
    const { supabase } = await import('./supabaseClient');
    const { error } = await supabase().rpc('record_wedding_signin', { p_visitor: visitorId() });
    if (error) signedIn.delete(userId);
  } catch { signedIn.delete(userId); }
}
