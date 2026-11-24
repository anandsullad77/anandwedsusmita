type RecoveryConfig = { supabaseUrl: string; serviceRoleKey: string; anonKey: string };

function allowedOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return url.origin === origin && (origin === 'https://anandwedsusmita.in'
      || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
  } catch { return false; }
}

export async function handleHostPasswordReset(request: Request, config: RecoveryConfig, send: typeof fetch = fetch): Promise<Response> {
  const origin = request.headers.get('origin');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin && allowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type, x-supabase-api-version';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  }
  const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowedOrigin(origin)) return json({ message: 'Origin is not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ message: 'Use POST.' }, 405);
  if (!config.supabaseUrl || !config.serviceRoleKey || !config.anonKey) return json({ message: 'Password recovery is not configured.' }, 503);

  let body: Record<string, unknown>, redirect: URL;
  try {
    const text = await request.text();
    if (text.length > 8192) throw new Error();
    body = JSON.parse(text);
    if (!body || typeof body !== 'object' || typeof body.email !== 'string' || body.email.length > 254
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
      || typeof body.code_challenge !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(body.code_challenge)
      || body.code_challenge_method !== 's256') throw new Error();
    redirect = new URL(new URL(request.url).searchParams.get('redirect_to') || '');
    if (!allowedOrigin(redirect.origin) || (origin && redirect.origin !== origin)
      || redirect.username || redirect.password || redirect.pathname !== '/admin/reset-password' || redirect.hash
      || [...redirect.searchParams.keys()].some(key => key !== 'sb_flow_id')) throw new Error();
  } catch { return json({ message: 'Invalid recovery request.' }, 400); }

  try {
    const membership = await send(`${config.supabaseUrl}/rest/v1/rpc/host_password_reset_email`, {
      method: 'POST',
      headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email: (body.email as string).trim() }),
    });
    if (!membership.ok) throw new Error('Host lookup failed');
    const email: unknown = await membership.json();
    // An unknown/guest email and an eligible email receive the same public reply.
    if (typeof email !== 'string' || !email) return json({});
    try {
      const response = await send(`${config.supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(redirect.href)}`, {
        method: 'POST',
        headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code_challenge: body.code_challenge, code_challenge_method: body.code_challenge_method,
          gotrue_meta_security: body.gotrue_meta_security }),
      });
      // Preserve Auth's email throttling, but never reveal membership through its
      // response. Log status only; addresses, keys and reset links stay private.
      if (!response.ok) console.error('Host recovery email request returned status', response.status);
    } catch { console.error('Host recovery email service is unavailable.'); }
    return json({});
  } catch {
    return json({ message: 'Password recovery is temporarily unavailable.' }, 503);
  }
}
