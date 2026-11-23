import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, clearSession, setSession } from '../lib/backend';
import { supabase } from '../lib/supabaseClient';
import { clearAuthReturn, pendingAuthReturn, refreshGuestAuth, requireGuestSignIn, saveAuthResume } from '../lib/guestAuth';
import WeddingBrand from '../components/WeddingBrand';
import { GoogleSignIn } from '../components/GoogleSignIn';

// StrictMode can mount the callback twice. Exchange each one-time OAuth code once.
const exchanges = new Map<string, Promise<string>>();
function finish(code: string, flowId: string | null): Promise<string> {
  const key = `${flowId || ''}:${code}`;
  const existing = exchanges.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const { error } = await supabase().auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (error) throw new Error('Your sign-in link expired or was already used. Please try signing in again.');
    await requireGuestSignIn();
    const saved = pendingAuthReturn();
    if (saved.family) {
      try {
        await api.claimPerson(saved.family.householdToken, saved.family.personId);
        setSession(saved.family);
      } catch { clearSession(); }
    }
    saveAuthResume(saved);
    clearAuthReturn();
    await refreshGuestAuth();
    return saved.path;
  })();
  exchanges.set(key, pending);
  return pending;
}

export default function AuthCallback() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const code = search.get('code');
  const flowId = search.get('sb_flow_id');
  const cancelled = search.has('error');
  useEffect(() => {
    let active = true;
    if (cancelled || !code) { setError(cancelled ? 'Google sign-in was cancelled. Your invitation is still available.' : 'This sign-in link is incomplete. Please try again.'); return; }
    finish(code, flowId).then(path => { if (active) navigate(path, { replace: true }); }).catch(error => { if (active) setError((error as Error).message); });
    return () => { active = false; };
  }, [code, flowId, cancelled, navigate]);
  return <div className="guest-sign-in-screen"><WeddingBrand /><h1>{error ? 'Let’s try that again' : 'Welcome to the celebration'}</h1>
    {error ? <><p role="alert">{error}</p><GoogleSignIn returnTo={pendingAuthReturn().path} /><Link to={pendingAuthReturn().path}>Back to where you left off</Link></>
      : <p role="status">Finishing your Google sign-in…</p>}
  </div>;
}
