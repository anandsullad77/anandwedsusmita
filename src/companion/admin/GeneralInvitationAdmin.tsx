import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/backend';
import { ago } from '../lib/format';
import { DEFAULT_WELCOME, prepareInvitationCover } from '../lib/generalInvitation';
import type { AdminData, GeneralInvitationSettings, GeneralSections, Wish, WishStatus } from '../lib/types';
import InvitationHero from '../guest/InvitationHero';
import { useVisibleViewport } from '../lib/useVisibleViewport';
import '../guest/general.css';

const sectionLabels: Record<keyof GeneralSections, string> = {
  cover: 'Cover photo', schedule: 'Celebration schedule', photos: 'Photo gallery (Scene)', uploads: 'Guest photo uploads',
  updates: 'Updates from the hosts', guestbook: 'Wishes & blessings', download: 'Invitation card download', quests: 'Photo quests'
};

export default function GeneralInvitationAdmin({ d }: { d: AdminData }) {
  const [saved, setSaved] = useState<GeneralInvitationSettings | null>(null);
  const [draft, setDraft] = useState<GeneralInvitationSettings | null>(null);
  const [cover, setCover] = useState<Blob | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [filter, setFilter] = useState<WishStatus>('pending');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [wishesError, setWishesError] = useState<string | null>(null);
  const [view, setView] = useState<'edit' | 'wishes'>('edit');
  const [compact, setCompact] = useState(() => matchMedia('(max-width: 1100px)').matches);
  const [previewOpen, setPreviewOpen] = useState(false);
  const coverInput = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLFormElement>(null);
  useVisibleViewport(editor, 76, !!draft);
  const lock = useRef(false);
  const link = `${location.origin}/invitation`;
  useEffect(() => {
    const media = matchMedia('(max-width: 1100px)');
    const change = () => setCompact(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

  const loadWishes = useCallback(() => {
    setWishesError(null);
    api.listWishes(d.event.id, true).then(setWishes).catch(e => setWishesError(e.message));
  }, [d.event.id]);
  useEffect(() => {
    let alive = true;
    api.generalSettings(d.event.id).then(settings => { if (alive) { setSaved(settings); setDraft(settings); } }).catch(e => { if (alive) setError(e.message); });
    loadWishes();
    return () => { alive = false; };
  }, [d.event.id, loadWishes]);
  useEffect(() => {
    if (!cover) { setCoverPreview(null); return; }
    const url = URL.createObjectURL(cover);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);
  const run = async (action: string, fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(action); setError(null); setNotice(null);
    try { await fn(); } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(null); }
  };
  const save = () => run('save', async () => {
    if (!draft) return;
    await api.saveGeneralSettings(d.event.id, draft, cover ?? undefined);
    const latest = await api.generalSettings(d.event.id);
    setSaved(latest); setDraft(latest); setCover(null);
    if (coverInput.current) coverInput.current.value = '';
    setNotice('Invitation saved. General visitors and family app guests will see your changes when they open or refresh their invitation.');
  });
  const moderate = (wish: Wish, status: WishStatus) => run(wish.id, async () => {
    await api.moderateWish(d.event.id, wish.id, status);
    setWishes(items => items.map(item => item.id === wish.id ? { ...item, status } : item));
    setNotice(status === 'approved' ? `Approved the wish from ${wish.name}.` : `Hidden the wish from ${wish.name}.`);
  });
  const dirty = !!cover || JSON.stringify(draft) !== JSON.stringify(saved);
  const previewSettings = draft ? { ...draft, coverUrl: coverPreview ?? draft.coverUrl } : null;

  return <>
    <header><h1 className="h1">General invitation</h1><p style={{ color: 'var(--p-muted)', marginBottom: 0 }}>Personalize the shared invitation for general visitors and family app guests, and review their wishes.</p></header>
    <div className="admin-view-switch" role="group" aria-label="General invitation tools"><button className="chip" aria-pressed={view === 'edit'} onClick={() => setView('edit')}>Edit invitation</button><button className="chip" aria-pressed={view === 'wishes'} onClick={() => setView('wishes')}>Review wishes{wishes.filter(w => w.status === 'pending').length > 0 && ` (${wishes.filter(w => w.status === 'pending').length})`}</button></div>
    <div hidden={view !== 'edit'} className="admin-editor-pane">
    <div className="panel admin-general-link">
      <code style={{ overflowWrap: 'anywhere' }}>{link}</code>
      <div className="import-actions">
        <a className="abtn" href={link} target="_blank" rel="noreferrer">Open general invitation</a>
        <button className="abtn" onClick={async () => {
          try { await navigator.clipboard.writeText(link); setNotice('General invitation link copied.'); }
          catch { setError('Could not copy automatically. Select and copy the link above.'); }
        }}>Copy invitation link</button>
      </div>
    </div>
    {draft && previewSettings && <div className="general-editor-grid">
      <form ref={editor} className="panel" onSubmit={e => { e.preventDefault(); void save(); }}>
        <h2>Customize invitation</h2>
        <fieldset className="general-editor-fields" disabled={!!busy}>
          <div className="field"><label htmlFor="general-welcome">Welcome message</label><textarea id="general-welcome" className="input" rows={4} maxLength={500} required value={draft.welcomeMessage} onChange={e => setDraft({ ...draft, welcomeMessage: e.target.value })} /><span className="import-help">{draft.welcomeMessage.length} / 500 characters</span></div>
          <button type="button" className="abtn" onClick={() => setDraft({ ...draft, welcomeMessage: DEFAULT_WELCOME })}>Use default welcome</button>
          <div className="field"><label htmlFor="general-cover">Cover photo</label><input ref={coverInput} id="general-cover" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => {
            const file = e.target.files?.[0];
            if (file) void run('cover', async () => { setCover(await prepareInvitationCover(file)); });
          }} /><span className="import-help">JPG, PNG or WebP, up to 5 MB. The preview shows how the photo will be cropped.</span></div>
          <button type="button" className="abtn" onClick={() => { setCover(null); setDraft({ ...draft, coverPath: null, coverUrl: null }); if (coverInput.current) coverInput.current.value = ''; }}>Use original cover photo</button>
          <div><b style={{ fontSize: 14 }}>Visible sections</b><div className="visibility-options">
            {(Object.keys(sectionLabels) as (keyof GeneralSections)[]).map(key => <label key={key}><input type="checkbox" checked={draft.sections[key]} onChange={e => setDraft({ ...draft, sections: { ...draft.sections, [key]: e.target.checked } })} />{sectionLabels[key]}</label>)}
          </div></div>
          <div className="import-actions general-save-actions">
            <button className="abtn red" disabled={!dirty || !draft.welcomeMessage.trim()}>{busy === 'save' ? 'Saving…' : 'Save invitation changes'}</button>
            <button type="button" className="abtn" disabled={!dirty} onClick={() => { if (saved) setDraft(saved); setCover(null); if (coverInput.current) coverInput.current.value = ''; }}>Discard changes</button>
          </div>
          <p className="import-help">The date, couple’s names and venue come from the wedding details. Section visibility applies to the general invitation.</p>
        </fieldset>
      </form>
      <details className="general-preview-disclosure" open={!compact || previewOpen} onToggle={e => { if (compact) setPreviewOpen(e.currentTarget.open); }}><summary><span>Preview invitation{dirty ? ' · unsaved changes' : ''}</span><span>⌄</span></summary><section className="panel general-editor-preview" aria-label="Invitation preview">
        <h2>Invitation preview{dirty ? ' · unsaved changes' : ''}</h2>
        <InvitationHero event={d.event} settings={previewSettings} />
        <p className="import-help">Visible sections: {(Object.keys(sectionLabels) as (keyof GeneralSections)[]).filter(key => key !== 'cover' && draft.sections[key]).map(key => sectionLabels[key]).join(', ') || 'Invitation only'}.</p>
      </section></details>
    </div>}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="import-success" role="status">{notice}</p>}
    <section hidden={view !== 'wishes'} className="panel" aria-labelledby="review-wishes">
      <div className="import-heading"><div><h2 id="review-wishes">Review wishes &amp; blessings</h2><p>Approve messages to show them in the guestbook. Hidden messages stay private.</p></div><button className="abtn" disabled={!!busy} onClick={loadWishes}>Refresh wishes</button></div>
      {wishesError && <p className="error" role="alert">{wishesError}</p>}
      <div className="import-actions">{(['pending', 'approved', 'rejected'] as const).map(status => <button key={status} className="chip" aria-pressed={filter === status} onClick={() => setFilter(status)}>{status === 'pending' ? 'Pending' : status === 'approved' ? 'Approved' : 'Hidden'} ({wishes.filter(w => w.status === status).length})</button>)}</div>
      {wishes.length === 200 && <p className="import-help">Showing the 200 most recent messages.</p>}
      {!wishesError && !wishes.some(w => w.status === filter) && <p style={{ margin: 0, color: 'var(--p-muted)' }}>No {filter === 'rejected' ? 'hidden' : filter} wishes.</p>}
      {wishes.filter(w => w.status === filter).map(wish => <article className="admin-wish" key={wish.id}>
        <div><b>{wish.name}</b><span className="import-help"> · {ago(wish.createdAt)}</span></div>
        <p>{wish.message}</p>
        <div className="import-actions">
          {wish.status !== 'approved' && <button className="abtn red" disabled={!!busy} onClick={() => void moderate(wish, 'approved')}>Approve wish from {wish.name}</button>}
          {wish.status !== 'rejected' && <button className="abtn" disabled={!!busy} onClick={() => void moderate(wish, 'rejected')}>{wish.status === 'approved' ? 'Hide' : 'Reject'} wish from {wish.name}</button>}
        </div>
      </article>)}
    </section>
  </>;
}
