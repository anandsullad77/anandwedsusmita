import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { compressImage } from '../lib/image';
import { enqueuePost } from '../lib/uploadQueue';
import type { PhotoContext } from '../lib/types';
import { Icon } from './Icon';
import { useVisibleViewport } from '../lib/useVisibleViewport';
import { clearQuestDraft, photoQuest, PHOTO_QUESTS, questDraftFiles } from '../lib/photoQuests';
import './photo-quests.css';
import './compose.css';
import { requireGuestSignIn } from '../lib/guestAuth';
import { useGuestAuth } from '../lib/useGuestAuth';
import { get, set, del } from 'idb-keyval';

const MOMENTS = ['Getting ready', 'Oota', 'Candid', 'Family'];
export default function Haaku({ ctx }: { ctx: PhotoContext }) {
  const { b, me } = ctx;
  const { user } = useGuestAuth();
  const nav = useNavigate();
  const [search] = useSearchParams();
  const initialQuest = ctx.questsEnabled !== false ? photoQuest(search.get('quest')) : undefined;
  const [questId, setQuestId] = useState(initialQuest?.id ?? '');
  const [allQuests, setAllQuests] = useState(false);
  const [editName, setEditName] = useState(!me?.name?.trim());
  const selectedQuest = photoQuest(questId);
  const [files, setFiles] = useState<File[]>(() => questDraftFiles(search.get('draft'), b.event.id, initialQuest?.id ?? ''));
  const [previews, setPreviews] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [moment, setMoment] = useState<string>(b.functions[0]?.nameEn ?? 'Candid');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(me?.name ?? '');
  const [draftReady, setDraftReady] = useState(false);
  const draftKey = `as-wedding-photo-draft:${b.event.id}:${user?.id}:${initialQuest?.id || 'all'}`;
  const pickedForQuest = useRef(files.length > 0);
  const draftWrites = useRef<Promise<unknown>>(Promise.resolve());
  const lock = useRef(false);
  const general = !!ctx.prepareUpload;
  const scenePath = ctx.scenePath ?? '/app/feed';
  const galRef = useRef<HTMLInputElement>(null);
  const viewportRoot = useRef<HTMLDivElement>(null);
  useVisibleViewport(viewportRoot);
  useEffect(() => {
    let alive = true;
    get<{ files: File[]; caption: string; name: string; moment: string; questId: string; at: number }>(draftKey).then(saved => {
      if (!alive) return;
      if (saved && !pickedForQuest.current && Date.now() - saved.at < 24 * 60 * 60_000) {
        setFiles(saved.files); setCaption(saved.caption); setName(saved.name); setMoment(saved.moment); setQuestId(saved.questId);
      }
    }).catch(() => {}).finally(() => { if (alive) setDraftReady(true); });
    return () => { alive = false; };
  }, [draftKey]);
  useEffect(() => {
    if (!draftReady) return;
    draftWrites.current = draftWrites.current.catch(() => {}).then(() => set(draftKey, { files, caption, name, moment, questId, at: Date.now() }));
    void draftWrites.current.catch(() => {});
  }, [draftReady, draftKey, files, caption, name, moment, questId]);
  useEffect(() => { clearQuestDraft(search.get('draft')); }, [search]);
  useEffect(() => {
    const urls = files.map(f => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [files]);
  const add = (list: FileList | null) => {
    if (!list || busy) return;
    const valid = Array.from(list).filter(f => f.type.startsWith('image/'));
    if (!valid.length) { setErr('Choose an image from your gallery.'); return; }
    setErr(null); setFiles(f => [...f, ...valid].slice(0, 10));
  };
  const remove = () => { setFiles(fs => fs.filter((_, i) => i !== active)); setActive(i => Math.max(0, i - 1)); };
  async function post() {
    if (lock.current || !files.length || (!general && !me)) return;
    lock.current = true; setBusy(true); setErr(null);
    try {
      const account = await requireGuestSignIn();
      if (general) await ctx.prepareUpload!(name.trim());
      const images = [];
      for (const f of files) images.push(await compressImage(f));
      await enqueuePost(b.event.id, images, { moment, questId: selectedQuest?.id, caption: caption.trim() || undefined, uploaderName: general ? name.trim() : me!.name, personId: general ? null : me!.id, generalToken: ctx.generalToken, authUserId: account.id });
      await draftWrites.current.catch(() => {});
      await del(draftKey).catch(() => {});
      const done = new URLSearchParams({ type: 'posted', n: String(files.length) });
      if (selectedQuest) done.set('questTitle', selectedQuest.tag);
      nav(`${scenePath.endsWith('/feed') ? scenePath.slice(0, -5) : '/app'}/create?${done}`);
    } catch (e) { setErr((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  const moments = [...new Set([...b.functions.map(f => f.nameEn), ...MOMENTS])];
  if (!draftReady) return <p role="status">Opening your photo draft…</p>;
  const questChoices = PHOTO_QUESTS.filter(q => allQuests || q.easy || q.id === questId);
  const canShare = !busy && files.length > 0 && !(general && !name.trim());
  const shareLabel = busy ? 'Getting them ready…' : files.length ? `Share ${files.length} ${files.length === 1 ? 'photo' : 'photos'}` : 'Choose a photo first';
  const current = previews[active] ?? previews[0];
  return <div ref={viewportRoot} className="haaku-screen compose" aria-busy={busy} lang="en">
    <header className="compose-top">
      <Link to={scenePath} aria-label="Close" className="compose-close"><Icon size={20} d="M6 6l12 12M18 6L6 18" /></Link>
      <h1>New post</h1>
      <span className="compose-count" aria-label={`${files.length} of 10 photos`}>{files.length} of 10</span>
    </header>
    <input ref={galRef} type="file" accept="image/*" multiple aria-label="Choose photos from gallery" hidden disabled={busy} onChange={e => { add(e.target.files); e.target.value = ''; }} />
    <div className="compose-body">
      <div className="compose-media">
      {current ? <>
        <div className="compose-preview">
          <img className="compose-preview-fill" src={current} alt="" aria-hidden="true" />
          <img className="compose-preview-photo" src={current} alt={`Selected photo ${active + 1} of ${files.length}`} />
        </div>
        <div className="compose-thumbs" aria-label="Selected photos">
          {previews.map((u, i) => <span key={u} className="compose-thumb">
            <button type="button" aria-label={`Preview photo ${i + 1}`} aria-pressed={active === i} disabled={busy} onClick={() => setActive(i)}><img src={u} alt="" /></button>
            {active === i && <button type="button" className="compose-thumb-remove" aria-label={`Remove photo ${i + 1}`} disabled={busy} onClick={remove}><Icon size={12} d="M6 6l12 12M18 6L6 18" /></button>}
          </span>)}
          {files.length < 10 && <button type="button" className="compose-thumb-add" aria-label="Add more photos" disabled={busy} onClick={() => galRef.current?.click()}><Icon size={20} d="M12 5v14M5 12h14" /></button>}
        </div>
        <p className="compose-hint">Tap a photo to preview it. The × removes it.</p>
      </> : <button type="button" className="compose-pick" onClick={() => galRef.current?.click()}>
        <Icon size={30} d="M3.5 4.5h17v15h-17zM4 16l5-5 4 4 2.5-2.5L20 17M15.5 9h.01" />
        <b>Choose photos</b><span>Up to 10 from your gallery</span>
      </button>}
      </div>
      <div className="compose-details">

      <div className="compose-field">
        <label htmlFor="cap">Caption</label>
        <textarea id="cap" rows={2} className="input" disabled={busy} placeholder="What’s happening in this moment?" value={caption} onChange={e => setCaption(e.target.value)} />
      </div>
      <div className="compose-field">
        <span className="compose-label" id="moment-label">Moment</span>
        <div className="compose-chips" role="group" aria-labelledby="moment-label">{moments.map(m => <button type="button" key={m} className="compose-chip" disabled={busy} aria-pressed={moment === m} onClick={() => setMoment(m)}>{moment === m && <Icon size={14} d="M20 13l-7 7a2 2 0 0 1-3 0l-8-8V3h9l9 8a2 2 0 0 1 0 2zM7 7h.01" />}{m}</button>)}</div>
      </div>
      {ctx.questsEnabled !== false && <div className="compose-field">
        <span className="compose-label" id="quest-label">Photo quest <small>(optional)</small></span>
        <div className="compose-chips" role="group" aria-labelledby="quest-label">
          <button type="button" className="compose-chip" disabled={busy} aria-pressed={!questId} onClick={() => setQuestId('')}>None</button>
          {questChoices.map(q => <button type="button" key={q.id} className="compose-chip" disabled={busy} aria-pressed={questId === q.id} onClick={() => setQuestId(q.id)}>{questId === q.id && <Icon size={14} d="M20 13l-7 7a2 2 0 0 1-3 0l-8-8V3h9l9 8a2 2 0 0 1 0 2zM7 7h.01" />}{q.title}</button>)}
          {!allQuests && <button type="button" className="compose-chip compose-chip-more" disabled={busy} onClick={() => setAllQuests(true)}>More quests</button>}
        </div>
        {selectedQuest && <p className="compose-quest-prompt">{selectedQuest.prompt}</p>}
      </div>}
      {general && (editName || !name.trim()
        ? <div className="compose-field"><label htmlFor="uploader-name">Your name</label><input id="uploader-name" className="input" autoComplete="name" maxLength={80} disabled={busy} placeholder="So the couple knows who shared these" value={name} onChange={e => setName(e.target.value)} onBlur={() => { if (name.trim()) setEditName(false); }}  /></div>
        : <p className="compose-as">Posting as <b>{name.trim()}</b> · <button type="button" disabled={busy} onClick={() => setEditName(true)}>Change</button></p>)}
      {!general && me && <p className="compose-as">Posting as <b>{me.name}</b></p>}
      {err && <p className="error" role="alert">{err}</p>}
      </div>
    </div>
    <footer className="compose-actions">
      <button type="button" className="btn btn-primary btn-block" disabled={!canShare} onClick={post}>{shareLabel}</button>
      <p><Icon size={14} d="M3 11.5a13 13 0 0 1 18 0M6.5 15a8 8 0 0 1 11 0M10 18.5a3 3 0 0 1 4 0" />A host approves each post before it appears. Weak signal? It waits on your phone and sends itself.</p>
    </footer>
  </div>;
}
