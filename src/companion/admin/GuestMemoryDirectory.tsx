import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/backend';
import type { GuestContact, GuestDirectory, GuestMemoryPosts } from '../lib/types';
import { useVisibleViewport } from '../lib/useVisibleViewport';
import { Icon } from '../guest/Icon';
import { exportGuestContacts, exportGuestMemories, memoryWhen } from './guestMemoryExport';

const PAGE_SIZE = 25;
const statusLabel: Record<string, string> = { pending: 'Awaiting approval', rejected: 'Rejected', hidden: 'Hidden', partly_hidden: 'Some photos hidden', approved: 'Approved', shared: 'Shared' };

export default function GuestMemoryDirectory({ eventId, refreshKey }: { eventId: string; refreshKey: number }) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<GuestDirectory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState<'contacts' | 'posts' | null>(null);
  const exportLock = useRef(false);
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<GuestContact | null>(null);
  useEffect(() => {
    let alive = true; setBusy(true); setError(''); setData(null);
    api.adminGuests(eventId, { query: search, offset, limit: PAGE_SIZE }).then(result => {
      if (!alive) return;
      if (offset && offset >= result.total) { setOffset(Math.max(0, Math.ceil(result.total / PAGE_SIZE) - 1) * PAGE_SIZE); return; }
      setData(result);
    })
      .catch(err => { if (alive) setError(err.message); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [eventId, search, offset, version, refreshKey]);

  const download = async (kind: NonNullable<typeof exporting>) => {
    if (exportLock.current) return;
    exportLock.current = true; setExporting(kind); setError(''); setNotice('');
    try {
      const count = await (kind === 'contacts' ? exportGuestContacts(eventId) : exportGuestMemories(eventId));
      setNotice(`Downloaded ${count} ${kind === 'contacts' ? 'guest contacts' : 'posts and wishes'} as CSV.`);
    } catch (err) { setError((err as Error).message); }
    finally { exportLock.current = false; setExporting(null); }
  };

  return <section className="panel guest-directory" aria-labelledby="guest-directory-title" aria-busy={busy}>
    <div className="analytics-header"><div><h2 id="guest-directory-title">Guest contacts &amp; memories</h2><p className="analytics-note">Names, Google emails and shared memories, for the wedding hosts.</p></div>
      <div className="import-actions"><button className="abtn" disabled={busy || !!exporting || !data || api.kind === 'local'} onClick={() => void download('contacts')}>{exporting === 'contacts' ? 'Exporting…' : 'Export all guests (CSV)'}</button><button className="abtn solid" disabled={busy || !!exporting || !data || api.kind === 'local'} onClick={() => void download('posts')}>{exporting === 'posts' ? 'Exporting…' : 'Export all posts & wishes (CSV)'}</button></div>
    </div>
    <p className="analytics-note">Keep the guest export for email addresses and activity totals. The posts export includes every photo reference and wish, beyond the latest 20 posts. View a guest’s memories to open their photos. No emails are sent by these exports.</p>
    <form className="guest-directory-search" onSubmit={e => { e.preventDefault(); setOffset(0); setSearch(query.trim()); setVersion(v => v + 1); }}>
      <div className="field"><label htmlFor="guest-directory-query">Find a guest by name or Google email</label><input id="guest-directory-query" className="input" type="search" maxLength={200} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search guest contacts" /></div>
      <button className="abtn" disabled={busy}>Search</button>
      {search && <button className="abtn" type="button" disabled={busy} onClick={() => { setQuery(''); setSearch(''); setOffset(0); }}>Clear</button>}
    </form>
    {error && <div className="guest-directory-error"><p className="error" role="alert">{error}</p><button className="abtn" disabled={busy} onClick={() => setVersion(v => v + 1)}>Retry guest list</button></div>}
    {notice && <p className="import-success" role="status">{notice}</p>}
    {busy && <p className="analytics-note" role="status">Loading guest contacts…</p>}
    {api.kind === 'local' && <p className="analytics-note">Google names and emails are available on the connected website. The browser demo has no Google guest accounts.</p>}
    {data && <>
      <p className="analytics-note" role="status">{data.total ? `Showing ${offset + 1}–${Math.min(offset + PAGE_SIZE, data.total)} of ${data.total} ${search ? 'matching ' : ''}guests` : search ? 'No guests match this search.' : 'No Google guest accounts have been recorded yet.'}</p>
      {!!data.guests.length && <div className="guest-directory-list">{data.guests.map(guest => <article className="guest-contact" key={guest.id}>
        <div className="guest-contact-identity"><h3>{guest.name}</h3>{guest.email ? <a href={`mailto:${guest.email}`}>{guest.email}</a> : <span className="analytics-note">Email unavailable</span>}</div>
        <dl className="guest-contact-totals"><div><dt>Photo posts</dt><dd>{guest.photoPosts} <small>· {guest.photos} photos</small></dd></div><div><dt>Wishes</dt><dd>{guest.wishes}</dd></div><div><dt>Reactions given</dt><dd>{guest.reactions}</dd></div></dl>
        <div className="guest-contact-footer"><div><p className="analytics-note">First recorded: {memoryWhen(guest.firstSeenAt) || 'Not recorded'}</p><p className="analytics-note">Last activity: {memoryWhen(guest.lastActiveAt) || 'Not recorded'}</p></div><button className="abtn" onClick={() => setSelected(guest)} aria-label={`View memories for ${guest.name} (${guest.email ?? 'email unavailable'})`}>View memories</button></div>
      </article>)}</div>}
      {data.total > PAGE_SIZE && <nav className="guest-directory-pages" aria-label="Guest list pages"><button className="abtn" disabled={busy || !offset} onClick={() => setOffset(n => Math.max(0, n - PAGE_SIZE))}>Previous guests</button><button className="abtn" disabled={busy || offset + PAGE_SIZE >= data.total} onClick={() => setOffset(n => n + PAGE_SIZE)}>Next guests</button></nav>}
      <p className="analytics-note">Times are in IST. Last activity reflects recorded wedding sign-ins or posts. Historical sign-in times may be unavailable. Reactions count current photo reactions; guests’ email addresses stay out of the guest feed.</p>
    </>}
    {selected && <GuestMemories key={selected.id} eventId={eventId} guest={selected} onClose={() => setSelected(null)} />}
  </section>;
}

function GuestMemories({ eventId, guest, onClose }: { eventId: string; guest: GuestContact; onClose: () => void }) {
  const sheet = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [data, setData] = useState<GuestMemoryPosts | null>(null);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const exportLock = useRef(false);
  const [notice, setNotice] = useState('');
  const request = useRef(0);
  useVisibleViewport(sheet);
  useEffect(() => {
    returnFocus.current ??= document.activeElement as HTMLElement | null;
    const dialog = sheet.current; dialog?.showModal();
    return () => { dialog?.close(); returnFocus.current?.focus({ preventScroll: true }); };
  }, []);
  const load = useCallback(async () => {
    const current = ++request.current; setBusy(true); setError(''); setData(null);
    try {
      const result = await api.adminGuestPosts(eventId, { guestId: guest.id, offset, limit: PAGE_SIZE });
      if (current === request.current) {
        if (offset && offset >= result.total) { setOffset(Math.max(0, Math.ceil(result.total / PAGE_SIZE) - 1) * PAGE_SIZE); return; }
        setData(result);
      }
    }
    catch (err) { if (current === request.current) setError((err as Error).message); }
    finally { if (current === request.current) setBusy(false); }
  }, [eventId, guest.id, offset]);
  useEffect(() => { void load(); return () => { request.current++; }; }, [load]);
  const download = async () => {
    if (exportLock.current) return;
    exportLock.current = true; setExporting(true); setError(''); setNotice('');
    try { const count = await exportGuestMemories(eventId, guest.id); setNotice(`Downloaded ${count} posts and wishes for ${guest.name}.`); }
    catch (err) { setError((err as Error).message); }
    finally { exportLock.current = false; setExporting(false); }
  };
  return <dialog ref={sheet} className="family-dialog guest-memory-dialog" aria-labelledby="guest-memory-title" onCancel={e => { e.preventDefault(); if (!exportLock.current) onClose(); }}>
    <div className="family-edit-form">
      <header className="family-edit-header"><div><p className="admin-eyebrow">Guest memories</p><h2 id="guest-memory-title">{guest.name}</h2>{guest.email && <a className="guest-memory-email" href={`mailto:${guest.email}`}>{guest.email}</a>}</div><button type="button" autoFocus className="admin-icon-button" disabled={exporting} aria-label="Close guest memories" onClick={onClose}><Icon d="M6 6l12 12M18 6L6 18" /></button></header>
      <div className="family-edit-scroll"><div className="family-edit-body">
        <dl className="guest-signin-dates"><dt>First recorded sign-in</dt><dd>{memoryWhen(guest.firstSignedInAt) || 'Not recorded'}</dd><dt>Latest recorded sign-in</dt><dd>{memoryWhen(guest.lastSignedInAt) || 'Not recorded'}</dd><dt>Reactions given</dt><dd>{guest.reactions}</dd></dl>
        {busy && <p role="status">Loading memories…</p>}
        {data && <><p className="analytics-note" role="status">{data.total ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, data.total)} of ${data.total} posts and wishes · times in IST` : 'This guest has not shared photos or wishes yet.'}</p>
          <div className="guest-memory-posts">{data.posts.map(post => <article className="guest-memory-post" key={`${post.kind}:${post.id}`}><div className="analytics-header"><b>{post.kind === 'photo' ? `Photo post · ${post.photos.length} photos` : 'Wedding wish'}</b><span className="pill off">{statusLabel[post.status] ?? post.status}</span></div><p className="analytics-note">Posted as {post.author} · <time dateTime={post.createdAt}>{memoryWhen(post.createdAt)}</time></p>{post.text && <p className="guest-memory-text">{post.text}</p>}
            {!!post.photos.length && <div className="guest-memory-photos">{post.photos.map((photo, i) => <figure key={photo.id}>{photo.url ? <a href={photo.url} target="_blank" rel="noreferrer" aria-label={`Open photo ${i + 1} by ${guest.name}`}><img src={photo.url} alt={photo.caption || `Wedding photo ${i + 1} by ${guest.name}`} loading="lazy" /></a> : <p className="analytics-note">Photo preview unavailable. Refresh memories to try again.</p>}<figcaption>{photo.caption || `Photo ${i + 1}`}{photo.hidden && ' · Hidden'}</figcaption></figure>)}</div>}
          </article>)}</div>
          {data.total > PAGE_SIZE && <nav className="guest-directory-pages" aria-label="Guest memories pages"><button className="abtn" disabled={busy || !offset} onClick={() => setOffset(n => Math.max(0, n - PAGE_SIZE))}>Previous memories</button><button className="abtn" disabled={busy || offset + PAGE_SIZE >= data.total} onClick={() => setOffset(n => n + PAGE_SIZE)}>Next memories</button></nav>}
        </>}
        <button className="abtn" disabled={busy} onClick={() => void load()}>Refresh memories</button>
        {notice && <p className="import-success" role="status">{notice}</p>}
      </div></div>
      {error && <p className="error contact-import-error" role="alert">{error}</p>}
      <footer className="family-edit-actions"><button className="abtn" disabled={exporting} onClick={onClose}>Close</button><button className="abtn red" disabled={busy || exporting || !data?.total} onClick={() => void download()}>{exporting ? 'Exporting…' : 'Export guest memories (CSV)'}</button></footer>
    </div>
  </dialog>;
}
