import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import WeddingBrand, { WeddingTextile } from '../components/WeddingBrand';
import { api } from '../lib/backend';
import { finishHostEmailLink, finishHostPasswordRecovery, MIN_HOST_PASSWORD_LENGTH, requestHostPasswordReset, updateHostPassword } from '../lib/hostPasswordRecovery';
import './admin.css';

function HostAuthPanel({ children }: { children: ReactNode }) {
  return <main className="platform host-auth-screen" lang="en"><div className="panel host-auth-panel">
    <WeddingBrand tagline="Host workspace" />
    {children}
    <WeddingTextile />
  </div></main>;
}

export function ForgotHostPassword() {
  const { state } = useLocation();
  const [email, setEmail] = useState(typeof state?.email === 'string' ? state.email : '');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <HostAuthPanel>
    <h1 className="h1 host-auth-title">Forgot password?</h1>
    {api.kind === 'local' ? <p>Password recovery is available for live owner and host accounts. In this demo, sign in with any email and password.</p>
      : <><p>Enter the email address you use as an owner or host. We&apos;ll send you a link to choose a new password.</p>
        <form className="host-auth-form" onSubmit={event => {
          event.preventDefault();
          if (busy || sent) return;
          setBusy(true); setError(null);
          void requestHostPasswordReset(email).then(() => setSent(true))
            .catch(error => setError((error as Error).message)).finally(() => setBusy(false));
        }}>
          <div className="field"><label htmlFor="recovery-email">Owner or host email</label>
            <input id="recovery-email" className="input" type="email" autoComplete="email" required value={email}
              onChange={event => { setEmail(event.target.value); setSent(false); setError(null); }} disabled={busy} />
          </div>
          <button className="btn btn-primary" disabled={busy || sent || !email.trim()}>{busy ? 'Sending…' : sent ? 'Reset link requested' : 'Send reset link'}</button>
        </form>
        {sent && <p role="status">If this email belongs to an owner or host, you&apos;ll receive a reset link. Check your inbox and spam folder, and open the link in this same browser.</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </>}
    <Link className="linkbtn" to="/admin">Back to sign in</Link>
  </HostAuthPanel>;
}

export function ResetHostPassword() {
  const [search] = useSearchParams();
  const [emailFragment] = useState(() => window.location.hash);
  const code = search.get('code'), flowId = search.get('sb_flow_id');
  const invalid = search.has('error') || new URLSearchParams(window.location.hash.slice(1)).has('error');
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const emailLink = new URLSearchParams(emailFragment.slice(1)).has('access_token');
    if (emailLink) window.history.replaceState(window.history.state, '', '/admin/reset-password');
    if (api.kind === 'local' || invalid || (!code && !emailLink)) {
      setLinkError('This reset link is invalid, expired, or already used. Please request a new link.');
      return;
    }
    (emailLink ? finishHostEmailLink(emailFragment) : finishHostPasswordRecovery(code!, flowId)).then(() => {
      if (!active) return;
      window.history.replaceState(window.history.state, '', '/admin/reset-password');
      setReady(true);
    }).catch(error => { if (active) setLinkError((error as Error).message); });
    return () => { active = false; };
  }, [code, flowId, invalid, emailFragment]);
  return <HostAuthPanel>
    <h1 className="h1 host-auth-title">{saved ? 'Password updated' : 'Choose a new password'}</h1>
    {linkError ? <><p className="error" role="alert">{linkError}</p><Link className="btn btn-primary" to="/admin/forgot-password">Request a new reset link</Link></>
      : saved ? <><p role="status">Your new password is saved. You can return to the host workspace.</p><Link className="btn btn-primary" to="/admin">Continue to admin</Link></>
        : !ready ? <p role="status">Checking your reset link…</p>
          : <form className="host-auth-form" onSubmit={event => {
            event.preventDefault();
            if (busy) return;
            setSaveError(null);
            if (password !== confirmation) { setSaveError('Your passwords do not match. Please try again.'); return; }
            setBusy(true);
            void updateHostPassword(password).then(() => { setPassword(''); setConfirmation(''); setSaved(true); })
              .catch(error => setSaveError((error as Error).message)).finally(() => setBusy(false));
          }}>
            <p id="password-hint">Use at least {MIN_HOST_PASSWORD_LENGTH} characters for your new password.</p>
            <div className="field"><label htmlFor="new-password">New password</label>
              <input id="new-password" className="input" type="password" autoComplete="new-password" required minLength={MIN_HOST_PASSWORD_LENGTH}
                aria-describedby="password-hint" value={password} onChange={event => { setPassword(event.target.value); setSaveError(null); }} disabled={busy} />
            </div>
            <div className="field"><label htmlFor="confirm-password">Confirm new password</label>
              <input id="confirm-password" className="input" type="password" autoComplete="new-password" required minLength={MIN_HOST_PASSWORD_LENGTH}
                value={confirmation} onChange={event => { setConfirmation(event.target.value); setSaveError(null); }} disabled={busy} />
            </div>
            {saveError && <p className="error" role="alert">{saveError}</p>}
            <button className="btn btn-primary" disabled={busy || !password || !confirmation}>{busy ? 'Saving…' : 'Save new password'}</button>
          </form>}
    {!saved && <Link className="linkbtn" to="/admin">Back to sign in</Link>}
  </HostAuthPanel>;
}
