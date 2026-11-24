import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/backend';
import { ago, shortDate } from '../lib/format';
import { framedCopy } from '../lib/image';
import { onQueueChange, pendingCount } from '../lib/uploadQueue';
import type { Photo, PhotoContext, ReactionKind, Wish } from '../lib/types';
import { withReaction } from '../lib/reactions';
import { weddingFeed } from '../lib/feed';
import PhotoPost from './PhotoPost';
import PhotoReactions from './PhotoReactions';
import { Icon } from './Icon';
import MomentTag from './MomentTag';
import { photoQuest, PHOTO_QUESTS } from '../lib/photoQuests';
import { usePhotoQuestSummary } from './usePhotoQuestSummary';
import './photo-quests.css';
import './feed.css';

const getVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#283A2D';

export default function Scene({ ctx, canUpload = true, canWish = true, showPhotos = true }: { ctx: PhotoContext; canUpload?: boolean; canWish?: boolean; showPhotos?: boolean }) {
  const { b } = ctx;
  const [search, setSearch] = useSearchParams();
  const quest = showPhotos && ctx.questsEnabled !== false ? photoQuest(search.get('quest')) : undefined;
  const { summary } = usePhotoQuestSummary(b.event.id);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [visible, setVisible] = useState(12);
  const [pending, setPending] = useState(0);
  const [menu, setMenu] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
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
  const uploadPath = quest && ctx.questsEnabled !== false ? `${createBase}?type=photos&quest=${quest.id}` : createBase;
  const selectCollection = (id: string) => { setSearch(previous => { if (id) previous.set('quest', id); else previous.delete('quest'); return previous; }); window.scrollTo({ top: 0, behavior: 'instant' }); };

  useEffect(() => {
    setLoaded(false); setLoadError(false); setPhotos([]); setWishes([]); setMenu(null); setVisible(12);
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

  async function share(p: Photo) {
    const blob = await framedCopy(p.url, `${b.event.coupleA} & ${b.event.coupleB}`, shortDate(b.event.startsAt), { deep: getVar('--deep'), paper: getVar('--paper') });
    if (!blob) return;
    const file = new File([blob], 'wedding-photo.jpg', { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: `${b.event.coupleA} & ${b.event.coupleB}` }).catch(() => {});
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'wedding-photo.jpg'; a.click(); }
  }

  async function flag(p: Photo, removal: boolean) {
    if (flagging) return;
    setMenu(null);
    setFlagging(true);
    setNotice(null);
    setError(null);
    try {
      await api.flagPhoto(p.id, removal ? 'Please remove this photo' : 'Not appropriate', removal);
      setNotice(removal ? 'Removal request sent to the hosts for review.' : 'Report sent to the hosts for review.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your request. Please try again.');
    } finally {
      setFlagging(false);
    }
  }

  const shown = weddingFeed(filter === 'mine' ? photos.filter(p => p.uploadedByMe) : photos, filter === 'mine' ? [] : wishes);

  return (
    <>
      <header className="guest-page-heading scene-heading" lang="en"><div><p className="guest-eyebrow">Our memories &amp; blessings</p><h1>Feed</h1><p>Photos and wishes, together. Newest moments first.</p></div><span className="scene-count">{shown.length} {shown.length === 1 ? 'post' : 'posts'}</span></header>
      <div className="scene-toolbar" lang="en"><div className="scene-filters">
        <button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
        {showPhotos && <button className="chip" aria-pressed={filter === 'mine'} onClick={() => setFilter('mine')}>My photos</button>}
      </div>{(canUpload || canWish) && <Link className="btn btn-deep" to={uploadPath}><Icon size={18} d="M12 5v14M5 12h14" />Create Post</Link>}</div>
      {(quest || photos.some(p => p.questId) || Object.keys(summary?.counts ?? {}).length > 0) && <div className="quest-collection-picker"><label htmlFor="photo-collection">Photo quest collection</label><select id="photo-collection" className="input" value={quest?.id ?? ''} onChange={e => selectCollection(e.target.value)}><option value="">All photos</option>{PHOTO_QUESTS.map(q => <option key={q.id} value={q.id}>{q.tag}{summary?.counts[q.id] ? ` (${summary.counts[q.id]})` : ''}</option>)}</select>{quest && <div className="quest-selected-collection"><MomentTag label={quest.tag} /><p>{quest.prompt}</p><button className="guest-text-link" onClick={() => selectCollection('')}>Back to all photos</button></div>}</div>}

      {notice && <div className="card" role="status" lang="en" style={{ padding: '10px 12px' }}>{notice}</div>}
      {error && <p className="error" role="alert" lang="en">{error}</p>}

      {pending > 0 && (
        <div role="status" className="card" style={{ padding: '10px 12px', borderStyle: 'dashed' }} lang="en">
          <b style={{ fontSize: 14 }}>{pending} of your photo{pending > 1 ? 's are' : ' is'} waiting for signal</b>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>They'll post on their own — keep the app open.</div>
        </div>
      )}

      {loadError && <div className="scene-empty card" role="alert"><p>Some posts could not be refreshed.</p><button className="btn btn-ghost" onClick={() => void load()}>Try again</button></div>}
      {!loaded && !shown.length && <p className="guest-meta" role="status">Gathering the memories…</p>}
      {loaded && !loadError && !shown.length && <div className="scene-empty card" lang="en"><Icon size={32} d="M3 6h18v14H3zM21 16l-5-5-9 9" /><h2>{quest ? 'This collection is waiting for its first memory.' : filter === 'mine' ? 'Your moments belong here.' : 'The first posts are on their way.'}</h2><p>Photos and wishes from the people who make this day special.</p>{(canUpload || canWish) && <Link className="btn btn-primary" to={uploadPath}>Create Post</Link>}</div>}
      {loaded && (photos.length >= 200 || wishes.length === 50) && <p className="guest-meta">Showing the latest photos and up to 50 approved wishes.</p>}

      {shown.slice(0, visible).map((post, index) => post.kind === 'wish' ? (
        <article key={post.id} className="post feed-post feed-wish" data-post-type="wish">
          <div className="post-header"><div className="post-avatar" aria-hidden="true">{post.wish.name.slice(0, 2).toUpperCase()}</div><div className="post-author"><b className="post-author-name">{post.wish.name}</b><div className="post-metadata"><MomentTag label="Wish & blessing" /><time className="post-timestamp" dateTime={post.createdAt}>{ago(post.createdAt)}</time></div></div></div>
          <p className="feed-wish-message">{post.wish.message}</p>
        </article>
      ) : (
        <PhotoPost key={post.id} photos={post.photos} priority={index === 0}>{(p, carousel, celebrate) => <>
          <div className="post-header" lang="en">
            <div className="post-avatar" aria-hidden="true">{p.uploaderName.slice(0, 2).toUpperCase()}</div>
            <div className="post-author">
              <b className="post-author-name">{p.uploaderName}</b>
              <div className="post-metadata">
                {p.moment && <MomentTag label={p.moment} />}
                {photoQuest(p.questId) && <MomentTag label={photoQuest(p.questId)!.tag} />}
                {p.pinned && <span className="post-pinned"><Icon size={12} d="M16 3l5 5-4 1-4 5v3l-3-3-6 6m6-6l-3-3h3l5-4 1-4z" />Pinned</span>}
                <time className="post-timestamp" dateTime={p.createdAt}>{ago(p.createdAt)}</time>
              </div>
            </div>
            <button aria-label="More options" aria-expanded={menu === p.id} disabled={flagging} className="chip post-more" onClick={() => setMenu(menu === p.id ? null : p.id)}>⋯</button>
          </div>
          {menu === p.id && (
            <div className="menu" lang="en">
              <button disabled={flagging} onClick={() => flag(p, true)}>Request removal</button>
              <button disabled={flagging} onClick={() => flag(p, false)}>Report this photo</button>
            </div>
          )}
          {carousel}
          <div style={{ padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {p.caption && <p className="post-caption" lang="en" style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>{p.caption}</p>}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <PhotoReactions key={p.id} photo={p} pending={reacting.has(p.id)} onChange={async reaction => { await react(p, reaction); celebrate(reaction); }} />
              <button className="chip" onClick={() => share(p)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} lang="en"><Icon size={18} d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" />Share</button>
            </div>
          </div>
        </>}</PhotoPost>
      ))}
      {visible < shown.length && <button className="btn btn-ghost" onClick={() => setVisible(n => n + 12)}>Load more posts</button>}
    </>
  );
}
