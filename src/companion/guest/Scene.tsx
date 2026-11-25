import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/backend';
import { onQueueChange, pendingCount } from '../lib/uploadQueue';
import type { Photo, PhotoContext, ReactionKind, Wish } from '../lib/types';
import { withReaction } from '../lib/reactions';
import { weddingFeed } from '../lib/feed';
import { Icon } from './Icon';
import { photoQuest, PHOTO_QUESTS } from '../lib/photoQuests';
import { usePhotoQuestSummary } from './usePhotoQuestSummary';
import PhotoViewer from './PhotoViewer';
import { useGuestPreview } from '../lib/guestPreview';
import './photo-quests.css';
import './feed.css';
import './gallery.css';

type Tab = 'photos' | 'wishes';
const TABS: { id: Tab; label: string; d: string }[] = [
  { id: 'photos', label: 'Photos', d: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
  { id: 'wishes', label: 'Wishes', d: 'M5 6h14v10H9l-4 3z' },
];
const PAGE = 30;

/** Flatten posts into one newest-first list of photos, keeping each post's own order. */
function galleryPhotos(photos: Photo[]) {
  return weddingFeed(photos, []).flatMap(post => post.kind === 'photos' ? post.photos : []);
}

export default function Scene({ ctx, canUpload = true, canWish = true, showPhotos = true }: { ctx: PhotoContext; canUpload?: boolean; canWish?: boolean; showPhotos?: boolean }) {
  const { b } = ctx;
  const [search, setSearch] = useSearchParams();
  const quest = showPhotos && ctx.questsEnabled !== false ? photoQuest(search.get('quest')) : undefined;
  const { summary } = usePhotoQuestSummary(b.event.id);
  const preview = useGuestPreview();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [visible, setVisible] = useState(PAGE);
  const [pending, setPending] = useState(0);
  const [tab, setTab] = useState<Tab>(showPhotos ? 'photos' : 'wishes');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [questsOpen, setQuestsOpen] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [reacting, setReacting] = useState<Set<string>>(() => new Set());
  const pendingReactions = useRef(new Map<string, ReactionKind | null>());
  const reactionVersions = useRef(new Map<string, number>());
  const [loaded, setLoaded] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const loadGeneration = useRef(0);
  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const versions = new Map(reactionVersions.current);
    let failed = false;
    // Display each section as soon as it arrives; slow wishes must not hold up photos.
    await Promise.all([
      (showPhotos ? api.listPhotos(b.event.id, quest ? { questId: quest.id } : undefined) : Promise.resolve([]))
        .then(items => {
          if (generation === loadGeneration.current) setPhotos(previous => {
            const latest = new Map(previous.map(photo => [photo.id, photo]));
            return items.map(photo => pendingReactions.current.has(photo.id) ? withReaction(photo, pendingReactions.current.get(photo.id)!)
              : (versions.get(photo.id) ?? 0) !== (reactionVersions.current.get(photo.id) ?? 0) && latest.has(photo.id)
                ? withReaction(photo, latest.get(photo.id)!.myReaction) : photo);
          });
        }).catch(() => { failed = true; }),
      (canWish && !quest ? api.listWishes(b.event.id) : Promise.resolve([]))
        .then(items => { if (generation === loadGeneration.current) setWishes(items); }).catch(() => { failed = true; }),
    ]);
    if (generation !== loadGeneration.current) return;
    setLoadError(failed); setLoaded(true);
  }, [b.event.id, quest?.id, canWish, showPhotos]);
  const createBase = ctx.scenePath?.endsWith('/feed') ? `${ctx.scenePath.slice(0, -5)}/create` : '/app/create';
  const photoPath = `${createBase}?type=photos${quest ? `&quest=${quest.id}` : ''}`;
  const wishPath = `${createBase}?type=wish`;
  const selectCollection = (id: string) => {
    setPinnedOnly(false); setQuestsOpen(false); setTab('photos'); setVisible(PAGE);
    setSearch(previous => { if (id) previous.set('quest', id); else previous.delete('quest'); return previous; });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  useEffect(() => {
    setLoaded(false); setLoadError(false); setPhotos([]); setWishes([]); setVisible(PAGE); setViewer(null);
    void load();
    pendingCount(b.event.id).then(setPending);
    const off = onQueueChange(() => { void pendingCount(b.event.id).then(setPending); void load(); });
    const t = setInterval(() => { if (!document.hidden) void load(); }, 20_000);
    const resume = () => { if (!document.hidden) void load(); };
    const h = () => void load();
    window.addEventListener('as-wedding-db', h);
    document.addEventListener('visibilitychange', resume);
    return () => { ++loadGeneration.current; off(); clearInterval(t); window.removeEventListener('as-wedding-db', h); document.removeEventListener('visibilitychange', resume); };
  }, [load]);

  async function react(photo: Photo, reaction: ReactionKind | null) {
    if (pendingReactions.current.has(photo.id)) return;
    pendingReactions.current.set(photo.id, reaction);
    reactionVersions.current.set(photo.id, (reactionVersions.current.get(photo.id) ?? 0) + 1);
    setReacting(ids => new Set(ids).add(photo.id));
    setPhotos(items => items.map(item => item.id === photo.id ? withReaction(item, reaction) : item));
    try { await api.setPhotoReaction(photo.id, reaction); }
    catch (err) {
      setPhotos(items => items.map(item => item.id === photo.id ? withReaction(item, photo.myReaction) : item));
      throw err;
    } finally {
      pendingReactions.current.delete(photo.id);
      reactionVersions.current.set(photo.id, (reactionVersions.current.get(photo.id) ?? 0) + 1);
      setReacting(ids => { const next = new Set(ids); next.delete(photo.id); return next; });
    }
  }

  async function flag(p: Photo, removal: boolean) {
    if (flagging) return;
    setFlagging(true); setNotice(null); setError(null);
    try {
      await api.flagPhoto(p.id, removal ? 'Please remove this photo' : 'Not appropriate', removal);
      setNotice(removal ? 'Removal request sent to the hosts for review.' : 'Report sent to the hosts for review.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your request. Please try again.');
    } finally { setFlagging(false); }
  }

  const all = useMemo(() => galleryPhotos(photos), [photos]);
  const approvedWishes = useMemo(() => weddingFeed([], wishes).flatMap(post => post.kind === 'wish' ? [post.wish] : []), [wishes]);
  const postSizes = useMemo(() => {
    const sizes = new Map<string, number>();
    for (const p of all) if (p.postId) sizes.set(p.postId, (sizes.get(p.postId) ?? 0) + 1);
    return sizes;
  }, [all]);
  const shown = pinnedOnly ? all.filter(p => p.pinned) : all;
  const pinned = all.filter(p => p.pinned);
  const guests = new Set([...all.map(p => p.uploaderName.trim().toLowerCase()), ...approvedWishes.map(w => w.name.trim().toLowerCase())]).size;
  const questCollections = PHOTO_QUESTS
    .map(q => ({ quest: q, count: summary?.counts[q.id] ?? 0, cover: all.find(p => p.questId === q.id) }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);
  const circles = [
    ...(pinned.length ? [{ id: 'pinned', label: 'Pinned', cover: pinned[0], on: pinnedOnly, pick: () => { selectCollection(''); setPinnedOnly(true); } }] : []),
    ...questCollections.slice(0, pinned.length ? 3 : 4).map(c => ({ id: c.quest.id, label: c.quest.tag, cover: c.cover, on: quest?.id === c.quest.id, pick: () => selectCollection(c.quest.id) })),
  ];
  const showCollections = showPhotos && ctx.questsEnabled !== false;

  const emptyCopy = tab === 'wishes'
    ? { title: 'The first wish could be yours', text: 'Words for Anand and Susmita’s next chapter.' }
    : quest ? { title: 'This collection is waiting for its first photo', text: quest.prompt }
        : { title: 'The first photo could be yours', text: 'Every photo and wish here becomes part of the couple’s album.' };
  const isEmpty = loaded && !loadError && (tab === 'wishes' ? !approvedWishes.length : !shown.length);

  return (
    <div className="gallery" lang="en">
      <h1 className="gallery-title">Gallery</h1>
      <div className="gallery-stats">
        {showPhotos && <div><b>{all.length}</b><span>{all.length === 1 ? 'photo' : 'photos'}</span></div>}
        {canWish && <div><b>{approvedWishes.length}</b><span>{approvedWishes.length === 1 ? 'wish' : 'wishes'}</span></div>}
        <div><b>{guests}</b><span>guests sharing</span></div>
      </div>

      {showCollections && (circles.length > 0 || summary) && <div className="gallery-collections" aria-label="Collections">
        {circles.map(c => <button key={c.id} type="button" className="gallery-circle" aria-pressed={c.on} onClick={c.on ? () => selectCollection('') : c.pick}>
          <span className="gallery-circle-ring">{c.cover ? <img src={c.cover.url} alt="" loading="lazy" /> : <Icon size={22} d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3V19H4zM12 16.6a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z" />}</span>
          <span className="gallery-circle-label">{c.label}</span>
        </button>)}
        <button type="button" className="gallery-circle" aria-expanded={questsOpen} onClick={() => setQuestsOpen(open => !open)}>
          <span className="gallery-circle-ring gallery-circle-more"><Icon size={22} d="M5 12h.01M12 12h.01M19 12h.01" /></span>
          <span className="gallery-circle-label">{PHOTO_QUESTS.length} quests</span>
        </button>
      </div>}
      {questsOpen && <div className="gallery-quest-list" role="group" aria-label="Photo quests">
        {PHOTO_QUESTS.map(q => <button key={q.id} type="button" className="chip" aria-pressed={quest?.id === q.id} onClick={() => selectCollection(q.id)}>{q.tag}{summary?.counts[q.id] ? ` · ${summary.counts[q.id]}` : ''}</button>)}
      </div>}
      {(quest || pinnedOnly) && <div className="gallery-filter-note" role="status">
        <span><b>{quest ? quest.tag : 'Pinned by the couple'}</b>{quest ? ` · ${quest.prompt}` : ''}</span>
        <button type="button" onClick={() => selectCollection('')}>All photos</button>
      </div>}

      {pending > 0 && <div className="gallery-waiting" role="status">
        <Icon size={20} d="M3 11.5a13 13 0 0 1 18 0M6.5 15a8 8 0 0 1 11 0M10 18.5a3 3 0 0 1 4 0" />
        <div><b>{pending} {pending === 1 ? 'photo' : 'photos'} waiting for signal</b><span>They’re safe on this phone and will post on their own.</span></div>
      </div>}
      {notice && <p className="gallery-notice" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <div className="gallery-tabs" role="tablist" aria-label="Show">
        {TABS.filter(t => t.id === 'wishes' ? canWish : showPhotos).map(t => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setVisible(PAGE); if (t.id !== 'photos') setPinnedOnly(false); }}>
          <Icon size={18} d={t.d} />{t.label}
        </button>)}
      </div>

      {loadError && <div className="gallery-empty" role="alert"><p>Some photos could not be refreshed.</p><button className="btn btn-ghost" onClick={() => void load()}>Try again</button></div>}
      {!loaded && <p className="guest-meta gallery-loading" role="status">Gathering the memories…</p>}

      {isEmpty && <div className="gallery-empty">
        <div className="gallery-empty-frames" aria-hidden="true"><span /><span><Icon size={24} d={tab === 'wishes' ? 'M5 6h14v10H9l-4 3z' : 'M4 8.5h3l1.6-2.5h6.8L17 8.5h3V19H4zM12 16.6a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z'} /></span><span /></div>
        <h2>{emptyCopy.title}</h2>
        <p>{emptyCopy.text}</p>
        <div className="gallery-empty-actions">
          {canUpload && tab !== 'wishes' && <Link className="btn btn-primary btn-block" to={photoPath}><Icon size={18} d="M12 5v14M5 12h14" />Add photos</Link>}
          {canWish && <Link className={`btn btn-block ${tab === 'wishes' ? 'btn-primary' : 'btn-ghost'}`} to={wishPath}>Write a wish</Link>}
        </div>
      </div>}

      {tab !== 'wishes' && shown.length > 0 && <div className="gallery-grid">
        {shown.slice(0, visible).map((p, i) => <button key={p.id} type="button" className="gallery-tile" aria-label={`Open photo by ${p.uploaderName}${p.caption ? `: ${p.caption}` : ''}`} onClick={() => setViewer(i)}>
          <img src={p.url} alt="" loading={i < 12 ? 'eager' : 'lazy'} decoding="async" />
          {p.postId && (postSizes.get(p.postId) ?? 0) > 1 && <svg className="gallery-tile-multi" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="7" y="7" width="13" height="13" rx="2" /><path d="M4 16V5a1 1 0 0 1 1-1h11" /></svg>}
        </button>)}
      </div>}
      {tab === 'wishes' && approvedWishes.length > 0 && <div className="gallery-wishes">
        {approvedWishes.slice(0, visible).map(w => <article key={w.id} className="gallery-wish">
          <p>“{w.message}”</p>
          <span>{w.name}</span>
        </article>)}
      </div>}
      {visible < (tab === 'wishes' ? approvedWishes.length : shown.length) && <button className="btn btn-ghost gallery-more" onClick={() => setVisible(n => n + PAGE)}>Show more</button>}
      {loaded && (photos.length >= 200 || wishes.length === 50) && <p className="guest-meta">Showing the latest photos and up to 50 wishes.</p>}

      {viewer !== null && shown.length > 0 && <PhotoViewer photos={shown} start={viewer} total={shown.length} reacting={reacting} readOnly={preview}
        onClose={() => setViewer(null)} onReact={react} onFlag={(p, removal) => void flag(p, removal)} />}
    </div>
  );
}
