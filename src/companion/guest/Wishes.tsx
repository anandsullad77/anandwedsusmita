import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/backend';
import { ago } from '../lib/format';
import type { Wish } from '../lib/types';
import { Icon } from './Icon';

export default function Wishes({ eventId, token, guestName }: { eventId: string; token: string; guestName: string | null }) {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [name, setName] = useState(guestName ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [visible, setVisible] = useState(4);
  const nameInput = useRef<HTMLInputElement>(null);
  const toggleButton = useRef<HTMLButtonElement>(null);
  const request = useRef<{ content: string; id: string } | null>(null);
  const lock = useRef(false);
  const refresh = useCallback(() => {
    setLoadError(false); setLoading(true);
    api.listWishes(eventId).then(setWishes).catch(() => setLoadError(true)).finally(() => setLoading(false));
  }, [eventId]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (formOpen) nameInput.current?.focus(); }, [formOpen]);
  useEffect(() => { if (sent && !busy) toggleButton.current?.focus({ preventScroll: true }); }, [sent, busy]);
  const send = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setSent(false);
    const content = JSON.stringify([name.trim(), message.trim()]);
    if (request.current?.content !== content) request.current = { content, id: crypto.randomUUID() };
    try {
      await api.submitWish(token, name, message, request.current.id);
      setMessage(''); setSent(true); setFormOpen(false); request.current = null;
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <section id="wishes" tabIndex={-1} className="general-section guestbook" aria-labelledby="wishes-title" lang="en">
    <div className="general-wishes-heading">
      <div className="general-section-heading"><p className="general-eyebrow">Words to treasure</p><h2 id="wishes-title">Wishes &amp; blessings</h2><p>A little love for the couple, to carry into their next chapter.</p></div>
      <button ref={toggleButton} className="btn btn-deep" aria-expanded={formOpen} aria-controls="wish-form" disabled={busy} onClick={() => { setFormOpen(!formOpen); setSent(false); }}><Icon size={18} d="M12 20h9M16 3l5 5L8 21H3v-5L16 3z" />{formOpen ? 'Close message form' : 'Write a wish'}</button>
    </div>
    {sent && <p className="wish-receipt" role="status"><Icon size={20} d="M5 12l4 4L19 6" />Thank you! Your wish has been sent to the hosts for approval.</p>}
    <div id="wish-form" hidden={!formOpen}>
      <form className="general-wish-form" onSubmit={e => { e.preventDefault(); void send(); }}>
        <div className="field"><label htmlFor="wish-name">Your name</label><input ref={nameInput} id="wish-name" className="input" maxLength={80} required autoComplete="name" placeholder="How should we sign your wish?" value={name} disabled={busy} onChange={e => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="wish-message">Your wish or blessing</label><textarea id="wish-message" className="input" rows={3} maxLength={1000} required placeholder="A happy memory, a little advice, or your warmest wishes…" value={message} disabled={busy} aria-describedby="wish-privacy" onChange={e => { setMessage(e.target.value); setSent(false); }} /></div>
        <div className="general-wish-form-footer"><p id="wish-privacy">Your message appears after the hosts approve it.</p><span className="general-muted">{message.length} / 1,000</span></div>
        <div className="general-actions"><button className="btn btn-primary" disabled={busy || !name.trim() || !message.trim()}>{busy ? 'Sending…' : 'Send for approval'}</button><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => { setFormOpen(false); toggleButton.current?.focus({ preventScroll: true }); }}>Cancel</button></div>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </div>
    {loading ? <p className="general-wishes-loading" role="status">Gathering the good wishes…</p>
      : loadError ? <div className="general-wishes-empty"><p>Could not load wishes.</p><button className="btn btn-ghost" onClick={refresh}>Retry loading wishes</button></div>
      : wishes.length ? <>
        <div className="wish-list">{wishes.slice(0, visible).map(w => <article className="wish" key={w.id}>
          <span className="general-quote" aria-hidden="true">“</span><p>{w.message}</p><footer><span className="general-wish-avatar" aria-hidden="true">{Array.from(w.name.trim())[0]}</span><b>{w.name}</b><time dateTime={w.createdAt}>{ago(w.createdAt)}</time></footer>
        </article>)}</div>
        {visible < wishes.length && <button className="btn btn-ghost general-more-wishes" onClick={() => setVisible(n => n + 4)}>Read more wishes ({wishes.length - visible})</button>}
      </> : <div className="general-wishes-empty"><Icon size={24} d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" /><p>Be the first to leave a little love.</p><span>Your words will be a part of their story.</span></div>}
  </section>;
}
