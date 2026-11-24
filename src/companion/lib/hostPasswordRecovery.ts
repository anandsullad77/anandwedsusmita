import { supabase } from './supabaseClient';
import { WEDDING_SLUG } from './wedding';
import { siteOrigin } from '../../siteOrigin';

export const HOST_RESET_PATH = '/admin/reset-password';
export const MIN_HOST_PASSWORD_LENGTH = 12;
const expiredMessage = 'This reset link is invalid, expired, or already used. Request a new link and open it in the same browser where you requested it.';
const exchanges = new Map<string, Promise<void>>();

export async function requestHostPasswordReset(email: string) {
  const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: siteOrigin() + HOST_RESET_PATH,
  });
  if (error) throw new Error('Could not request a reset email. Please try again shortly or contact the wedding owner.');
}

async function requireWeddingHost() {
  const { data, error } = await supabase().auth.getUser();
  if (error || !data.user || data.user.is_anonymous) throw new Error(expiredMessage);
  const { data: hosts, error: hostError } = await supabase().from('hosts')
    .select('user_id, events!inner(slug)').eq('user_id', data.user.id)
    .eq('events.slug', WEDDING_SLUG).limit(1);
  if (hostError) throw new Error('Could not verify host access. Please try again.');
  if (!hosts?.length) throw new Error('Password recovery is only available to this wedding\'s owners and hosts.');
}

// React StrictMode mounts effects twice; a one-time code must be exchanged once.
export function finishHostPasswordRecovery(code: string, flowId: string | null): Promise<void> {
  const key = `${flowId || ''}:${code}`;
  const existing = exchanges.get(key);
  if (existing) return existing;
  const pending = (async () => {
    let recoveryUserId: string | null = null;
    const { data: { subscription } } = supabase().auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') recoveryUserId = session?.user.id || null;
    });
    try {
      const { data, error } = await supabase().auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
      if (error || !data.session || recoveryUserId !== data.session.user.id) throw new Error(expiredMessage);
      await requireWeddingHost();
    } finally { subscription.unsubscribe(); }
  })();
  exchanges.set(key, pending);
  return pending;
}

export async function updateHostPassword(password: string) {
  if (password.length < MIN_HOST_PASSWORD_LENGTH) throw new Error(`Use at least ${MIN_HOST_PASSWORD_LENGTH} characters for your password.`);
  // Recheck membership when saving in case access was removed after opening.
  await requireWeddingHost();
  const { error } = await supabase().auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

// Admin-sent links use Auth's verified implicit callback, which can be opened
// on the recipient's device without the sending owner's PKCE verifier.
export function finishHostEmailLink(fragment: string): Promise<void> {
  const existing = exchanges.get(fragment);
  if (existing) return existing;
  const pending = (async () => {
    const params = new URLSearchParams(fragment.replace(/^#/, ''));
    if (!['invite', 'recovery'].includes(params.get('type') || '')) throw new Error(expiredMessage);
    const access_token = params.get('access_token'), refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) throw new Error(expiredMessage);
    const { error } = await supabase().auth.setSession({ access_token, refresh_token });
    if (error) throw new Error(expiredMessage);
    await requireWeddingHost();
  })();
  exchanges.set(fragment, pending);
  return pending;
}
