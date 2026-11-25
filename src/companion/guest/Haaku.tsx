import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { compressImage } from '../lib/image';
import { enqueuePost } from '../lib/uploadQueue';
import type { PhotoContext } from '../lib/types';
import { Icon } from './Icon';
import { useVisibleViewport } from '../lib/useVisibleViewport';
import { clearQuestDraft, photoQuest, PHOTO_QUESTS, questDraftFiles } from '../lib/photoQuests';
import MomentTag from './MomentTag';
import './photo-quests.css';
import { WeddingMark } from '../components/WeddingBrand';
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
  const [questPickerOpen, setQuestPickerOpen] = useState(!!initialQuest);
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
  const camRef = useRef<HTMLInputElement>(null);
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
    if (!valid.length) { setErr('Choose an image from your phone or take a photo.'); return; }
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
  return <div ref={viewportRoot} className="haaku-screen" aria-busy={busy} lang="en">
    <header className="upload-header"><Link to={scenePath} aria-label="Close" className="upload-close"><Icon size={20} d="M6 6l12 12M18 6L6 18" /></Link><div className="upload-wedding-heading"><a href="/" aria-label="Anand and Susmita — wedding invitation"><WeddingMark size={40} /></a><div><span className="guest-eyebrow">Create Post</span><h1>Upload Photos</h1></div></div><span className="upload-count">{files.length}/10</span></header>
    <div className="upload-body">
      <p className="upload-intro">A little of the day, through your eyes. Choose up to 10 photos.</p>
      <input ref={camRef} type="file" accept="image/*" capture="environment" aria-label="Take a photo" hidden disabled={busy} onChange={e => { add(e.target.files); e.target.value = ''; }} />
      <input ref={galRef} type="file" accept="image/*" multiple aria-label="Choose photos from gallery" hidden disabled={busy} onChange={e => { add(e.target.files); e.target.value = ''; }} />
      {general && <div className="field"><label htmlFor="uploader-name">Your name</label><input id="uploader-name" className="input" autoComplete="name" maxLength={80} disabled={busy} placeholder="So the couple knows who shared these" value={name} onChange={e => setName(e.target.value)} /></div>}
      {previews.length ? <>
        <div className="upload-preview"><img src={previews[active] ?? previews[0]} alt="Selected photo" /></div>
        <div className="upload-selection-meta"><span>{files.length} {files.length === 1 ? 'photo' : 'photos'} selected</span><button className="upload-remove" disabled={busy} onClick={remove}>Remove this photo</button></div>
        <div className="thumbs" aria-label="Selected photos">{previews.map((u, i) => <button key={u} aria-label={`Preview photo ${i + 1}`} aria-pressed={active === i} disabled={busy} onClick={() => setActive(i)}><img src={u} alt={`Photo ${i + 1}`} /></button>)}{files.length < 10 && <button className="upload-add" aria-label="Add more photos" disabled={busy} onClick={() => galRef.current?.click()}><Icon size={24} d="M12 5v14M5 12h14" /></button>}</div>
      </> : <div className="upload-choices"><button className="upload-choice" onClick={() => camRef.current?.click()}><Icon size={30} d="M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" /><b>Take a photo</b><span>Capture it now</span></button><button className="upload-choice" onClick={() => galRef.current?.click()}><Icon size={30} d="M3 6h18v14H3zM21 16l-5-5-9 9" /><b>From gallery</b><span>Choose your favourites</span></button></div>}
      {ctx.questsEnabled !== false && <details className="upload-quest-picker" open={questPickerOpen} onToggle={e => setQuestPickerOpen(e.currentTarget.open)}><summary><span>{selectedQuest ? `Photo quest · ${selectedQuest.title}` : 'Join a photo quest (optional)'}</span><Icon size={16} d="M6 9l6 6 6-6" /></summary><div className="upload-quest-fields"><div className="field"><label htmlFor="upload-quest">Quest tag</label><select id="upload-quest" className="input" disabled={busy} value={questId} onChange={e => setQuestId(e.target.value)}><option value="">No photo quest</option>{(['heartfelt', 'playful'] as const).map(mood => <optgroup key={mood} label={mood === 'heartfelt' ? 'Heartfelt' : 'Playful'}>{PHOTO_QUESTS.filter(q => q.mood === mood).map(q => <option key={q.id} value={q.id}>{q.title}</option>)}</optgroup>)}</select></div>{selectedQuest && <><p>{selectedQuest.prompt}</p><MomentTag label={selectedQuest.tag} /><small>This quest tag is added to every photo in this post.</small></>}</div></details>}
      <div className="field"><label id="moment-label">Add a moment</label><div className="upload-moments" role="group" aria-labelledby="moment-label">{moments.map(m => <button key={m} className="chip" disabled={busy} aria-pressed={moment === m} onClick={() => setMoment(m)}><Icon size={14} d="M20 13l-7 7a2 2 0 0 1-3 0l-8-8V3h9l9 8a2 2 0 0 1 0 2zM7 7h.01" />{m}</button>)}</div></div>
      <div className="field"><label htmlFor="cap">Caption (optional)</label><textarea id="cap" rows={2} className="input" disabled={busy} placeholder="The story behind the moment…" value={caption} onChange={e => setCaption(e.target.value)} /></div>
      {err && <p className="error" role="alert">{err}</p>}
    </div>
    <footer className="upload-actions"><button className="btn btn-primary btn-block" disabled={busy || !files.length || (general && !name.trim())} onClick={post}>{busy ? 'Getting them ready…' : files.length ? `Create Post · ${files.length} photo${files.length > 1 ? 's' : ''}` : 'Pick a photo first'}</button><p>Weak signal? We’ll keep your post and share it when you’re back online.</p></footer>
  </div>;
}
