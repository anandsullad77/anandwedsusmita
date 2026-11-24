type TeamConfig = { supabaseUrl: string; serviceRoleKey: string; anonKey: string };
type Target = { id: string; email: string; confirmed: boolean; role: string | null };
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
const emailAddress = (value: unknown): value is string => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const allowedOrigin = (value: string) => {
  try { const url = new URL(value); return url.origin === value && (value === 'https://anandwedsusmita.in' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))); }
  catch { return false; }
};

export async function handleHostTeam(request: Request, config: TeamConfig, send: typeof fetch = fetch): Promise<Response> {
  const origin = request.headers.get('origin');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin && allowedOrigin(origin)) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version', 'Access-Control-Allow-Methods': 'POST, OPTIONS' });
  const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowedOrigin(origin)) return json({ message: 'Origin is not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ message: 'Use POST.' }, 405);
  if (!config.supabaseUrl || !config.serviceRoleKey || !config.anonKey) return json({ message: 'Host email setup is unavailable.' }, 503);
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ message: 'Sign in as an owner to manage hosts.' }, 401);
  let body: Record<string, unknown>, redirect: URL;
  try {
    const text = await request.text(); if (text.length > 8192) throw new Error();
    body = JSON.parse(text);
    if (!body || typeof body !== 'object' || !uuid(body.eventId) || !['invite', 'reset'].includes(String(body.action))) throw new Error();
    if (body.action === 'invite' && (!emailAddress(body.email) || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100 || !['owner', 'cohost'].includes(String(body.role)))) throw new Error();
    if (body.action === 'reset' && !uuid(body.userId)) throw new Error();
    redirect = new URL(String(body.redirectTo));
    if (!allowedOrigin(redirect.origin) || (origin && redirect.origin !== origin) || redirect.pathname !== '/admin/reset-password' || redirect.search || redirect.hash || redirect.username || redirect.password) throw new Error();
  } catch { return json({ message: 'Check the host name, email, role and return address.' }, 400); }
  const serverHeaders = { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, 'Content-Type': 'application/json' };
  const rpc = (name: string, args: object) => send(`${config.supabaseUrl}/rest/v1/rpc/${name}`, { method: 'POST', headers: serverHeaders, body: JSON.stringify(args) });
  let accessAdded = false;
  try {
    // Verify the caller with Auth. Never trust a user ID supplied in the body.
    const identity = await send(`${config.supabaseUrl}/auth/v1/user`, { headers: { apikey: config.anonKey, Authorization: authorization } });
    if (!identity.ok) return json({ message: 'Your sign-in expired. Sign in again.' }, 401);
    const actor = await identity.json();
    if (!uuid(actor.id) || actor.is_anonymous) return json({ message: 'Sign in as an owner to manage hosts.' }, 403);
    const lookup = await rpc('host_team_target', { p_actor: actor.id, p_event: body.eventId, p_email: body.action === 'invite' ? (body.email as string).trim().toLowerCase() : null, p_user: body.action === 'reset' ? body.userId : null });
    if (!lookup.ok) {
      const problem = await lookup.json().catch(() => ({}));
      return json({ message: problem.code === 'PGRST202' ? 'Apply the 0017_host_team_management.sql migration before managing hosts.' : 'Only owners can manage the host team.' }, problem.code === 'PGRST202' ? 503 : 403);
    }
    let target = await lookup.json() as Target | null;
    if (body.action === 'reset' && (!target || !target.role)) return json({ message: 'This account is no longer a host of this wedding.' }, 404);
    if (body.action === 'invite') {
      if (target?.role) return json({ message: 'This email already has host access. Use Send password link in the team list.' }, 409);
      if (!target) {
        // Create an unconfirmed email account without setting or exposing a
        // password. Grant membership before requesting the invitation email.
        const created = await send(`${config.supabaseUrl}/auth/v1/admin/users`, { method: 'POST', headers: serverHeaders, body: JSON.stringify({ email: (body.email as string).trim().toLowerCase(), email_confirm: false, user_metadata: { full_name: (body.name as string).trim() } }) });
        if (!created.ok) return json({ message: 'Could not create the host account. Refresh the team list and try again.' }, 503);
        const user = await created.json();
        if (!uuid(user.id) || !emailAddress(user.email)) throw new Error('Invalid account response');
        target = { id: user.id, email: user.email, confirmed: !!user.email_confirmed_at, role: null };
      }
      const grant = await rpc('host_team_add', { p_actor: actor.id, p_event: body.eventId, p_user: target.id, p_role: body.role, p_name: (body.name as string).trim() });
      if (!grant.ok) return json({ message: 'Could not add host access. Your owner access may have changed; refresh and try again.' }, 403);
      accessAdded = await grant.json() === true;
      if (!accessAdded) return json({ message: 'This account already has host access. Its role was left unchanged; refresh the team list.' }, 409);
    }
    if (!target || !emailAddress(target.email)) throw new Error('Missing host account');
    const url = `${config.supabaseUrl}/auth/v1/${target.confirmed ? 'recover' : 'invite'}?redirect_to=${encodeURIComponent(redirect.href)}`;
    const mail = await send(url, { method: 'POST', headers: target.confirmed ? { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}`, 'Content-Type': 'application/json' } : serverHeaders,
      body: JSON.stringify({ email: target.email }) });
    if (!mail.ok) return json({ accessAdded, emailSent: false, message: `${accessAdded ? 'Host access was added, but the email could not be sent.' : 'The email could not be sent.'} Use Send password link to retry. Check email delivery settings if this continues.` });
    return json({ accessAdded, emailSent: true, message: `${accessAdded ? 'Host access added. ' : ''}A one-time password ${target.confirmed ? 'reset' : 'setup'} link was sent to ${target.email}.` });
  } catch {
    // Never log addresses, passwords, session tokens or email-link secrets.
    return json({ accessAdded, emailSent: false, message: accessAdded ? 'Host access was added, but email delivery could not be confirmed. Refresh the team list and use Send password link to retry.' : 'Host management is temporarily unavailable. Refresh the team list and try again.' }, accessAdded ? 200 : 503);
  }
}
