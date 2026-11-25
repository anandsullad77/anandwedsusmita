import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/backend';
import { useGuestAuth } from '../lib/useGuestAuth';

export default function WishComposer({ eventId, token, guestName, feedPath, createPath }: { eventId: string; token: string; guestName: string | null; feedPath: string; createPath?: string }) {
  const { user } = useGuestAuth();
  const key = `as-wedding-wish-draft:${eventId}:${user?.id}`;
  const [draft, setDraft] = useState(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(key) || 'null'); if (saved) return saved as { name: string; message: string; requestId: string }; } catch { /* Start a new wish. */ }
    return { name: guestName || user?.name || '', message: '', requestId: crypto.randomUUID() };
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  useEffect(() => { if (!sent) sessionStorage.setItem(key, JSON.stringify(draft)); }, [key, draft, sent]);
  async function send() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      await api.submitWish(token, draft.name, draft.message, draft.requestId);
      sessionStorage.removeItem(key); setSent(true);
    } catch (error) { setError((error as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  if (sent) return <section className="create-done" lang="en" aria-labelledby="wish-sent-title">
    <figure className="create-wish-card"><blockquote>“{draft.message.trim()}”</blockquote><figcaption>{draft.name.trim()}</figcaption></figure>
    <h1 id="wish-sent-title">Your wish is on its way</h1>
    <p>Anand and Susmita read every wish before it appears in the gallery.</p>
    <div className="create-done-actions">
      <Link className="btn btn-deep btn-block" to={feedPath}>Back to the gallery</Link>
      {createPath && <Link className="btn btn-ghost btn-block" to={createPath}>Add photos too</Link>}
    </div>
  </section>;
  return <section className="post-composer" aria-labelledby="wish-compose-title" lang="en">
    <p className="guest-eyebrow">Create Post</p><h1 id="wish-compose-title">Send a Wish</h1>
    {sent ? <div className="card composer-receipt" role="status"><p>Thank you! Your wish has been sent to the hosts for approval.</p><Link className="btn btn-deep" to={feedPath}>Back to Feed</Link></div>
      : <form className="general-wish-form" onSubmit={event => { event.preventDefault(); void send(); }}>
        <div className="field"><label htmlFor="wish-name">Your name</label><input id="wish-name" className="input" autoComplete="name" maxLength={80} required disabled={busy} value={draft.name} onChange={event => setDraft(d => ({ ...d, name: event.target.value, requestId: crypto.randomUUID() }))} /></div>
        <div className="field"><label htmlFor="wish-message">Your wish or blessing</label><textarea id="wish-message" className="input" rows={5} maxLength={1000} required disabled={busy} aria-describedby="wish-privacy" placeholder="A happy memory, a little advice, or your warmest wishes…" value={draft.message} onChange={event => setDraft(d => ({ ...d, message: event.target.value, requestId: crypto.randomUUID() }))} /></div>
        <div className="general-wish-form-footer"><p id="wish-privacy">Your message appears in the Feed after the hosts approve it.</p><span>{draft.message.length} / 1,000</span></div>
        <div className="general-actions"><button className="btn btn-primary" disabled={busy || !draft.name.trim() || !draft.message.trim()}>{busy ? 'Sending…' : 'Send for approval'}</button><Link className="btn btn-ghost" to={feedPath}>Cancel</Link></div>
        {error && <p className="error" role="alert">{error}</p>}
      </form>}
  </section>;
}
