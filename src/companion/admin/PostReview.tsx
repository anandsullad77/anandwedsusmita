import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/backend';
import { ago } from '../lib/format';
import { PHOTO_QUESTS } from '../lib/photoQuests';
import type { PostReview as ReviewPost, PostReviewFilter, PostReviewQueue } from '../lib/types';
import { Icon } from '../guest/Icon';
import './post-review.css';

const PAGE_SIZE = 12;
const postKey = (post: Pick<ReviewPost, 'id' | 'kind'>) => `${post.kind}:${post.id}`;
const publishLabel = (post: ReviewPost) => post.status === 'pending' ? 'Approve & publish' : post.hidden || post.status === 'rejected' ? 'Return to feed' : 'Keep in feed';
const inFeed = (post: ReviewPost) => post.status === 'approved' && !post.hidden;
const visibilityLabel = (post: ReviewPost) => post.status === 'pending' ? 'Awaiting approval' : inFeed(post) ? 'In feed'
  : post.photos.some(photo => !photo.hidden && photo.status === 'approved') ? 'Some photos hidden' : 'Hidden';

function ReviewActions({ post, disabled, act }: { post: ReviewPost; disabled: boolean; act: (action: 'approve' | 'hide') => void }) {
  return <div className="review-actions">
    {(!inFeed(post) || post.flags > 0) && <button type="button" className="abtn red" disabled={disabled} onClick={() => act('approve')}><Icon size={16} d="m5 12 4 4L19 6" />{publishLabel(post)}</button>}
    {(inFeed(post) || post.status === 'pending' || post.photos.some(photo => !photo.hidden && photo.status === 'approved')) && <button type="button" className="abtn" disabled={disabled} onClick={() => act('hide')}>Hide post</button>}
  </div>;
}

function PostPhotos({ post, initial, onClose, disabled, error, act }: { post: ReviewPost; initial: number; onClose: () => void; disabled: boolean; error: string | null; act: (action: 'approve' | 'hide') => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(initial);
  const photo = post.photos[index];
  const move = (step: number) => setIndex(value => (value + step + post.photos.length) % post.photos.length);
  useEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; element.showModal();
    return () => { element.close(); document.body.style.overflow = overflow; opener?.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<dialog ref={dialog} className="post-review-dialog" aria-labelledby="review-preview-title" aria-busy={disabled}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={event => { if (event.key === 'ArrowRight') { event.preventDefault(); move(1); } if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); } }}>
    <header><div><h2 id="review-preview-title">Photos from {post.name}</h2><p>Photo {index + 1} of {post.photos.length} · {visibilityLabel(post)}</p></div><button type="button" className="admin-icon-button" autoFocus aria-label="Close post photos" onClick={onClose}><Icon d="M6 6l12 12M18 6L6 18" /></button></header>
    <div className="review-preview-image"><img src={photo.url} alt={photo.caption || `Photo ${index + 1} by ${post.name}`} /></div>
    {post.photos.length > 1 && <nav aria-label="Post photos"><button className="abtn" aria-label="Previous photo" onClick={() => move(-1)}><Icon size={18} d="m15 5-7 7 7 7" />Previous</button><span>{index + 1} / {post.photos.length}</span><button className="abtn" aria-label="Next photo" onClick={() => move(1)}>Next<Icon size={18} d="m9 5 7 7-7 7" /></button></nav>}
    <div className="review-preview-copy">{post.text && <p>{post.text}</p>}{photo.reports.map((report, i) => <p className="review-report" key={i}>{report.removal ? 'Removal requested' : 'Reported'}: {report.reason || 'No reason provided'}</p>)}{error && <p className="error" role="alert">{error}</p>}<p className="analytics-note">Your decision applies to all {post.photos.length} photos in this post.</p><ReviewActions post={post} disabled={disabled} act={act} /></div>
  </dialog>, document.body);
}

export default function PostReview({ eventId }: { eventId: string }) {
  const [filter, setFilter] = useState<PostReviewFilter>('review');
  const [kind, setKind] = useState<'all' | 'photo' | 'wish'>('all');
  const [questId, setQuestId] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [queue, setQueue] = useState<PostReviewQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ post: ReviewPost; index: number } | null>(null);
  const request = useRef(0);
  const lock = useRef(false);
  useEffect(() => { const timer = setTimeout(() => { setOffset(0); setSelected(new Set()); setQuery(search); }, 250); return () => clearTimeout(timer); }, [search]);
  const load = useCallback(async () => {
    const generation = ++request.current;
    setLoading(true); setError(null);
    try {
      const next = await api.postReviewQueue(eventId, { filter, kind, query, questId, offset, limit: PAGE_SIZE });
      if (generation !== request.current) return;
      if (offset && offset >= next.total) { setOffset(Math.max(0, Math.floor((next.total - 1) / PAGE_SIZE) * PAGE_SIZE)); return; }
      setQueue(next);
      setSelected(current => new Set([...current].filter(key => next.posts.some(post => postKey(post) === key))));
    } catch (e) { if (generation === request.current) setError((e as Error).message); }
    finally { if (generation === request.current) setLoading(false); }
  }, [eventId, filter, kind, query, questId, offset]);
  useEffect(() => {
    void load();
    const refresh = () => { if (!lock.current) void load(); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = setInterval(refresh, 30_000);
    window.addEventListener('as-wedding-db', refresh); document.addEventListener('visibilitychange', visible);
    return () => { request.current++; clearInterval(timer); window.removeEventListener('as-wedding-db', refresh); document.removeEventListener('visibilitychange', visible); };
  }, [load]);
  const changeFilter = (next: PostReviewFilter) => { setFilter(next); setOffset(0); setSelected(new Set()); setNotice(null); };
  const act = async (posts: ReviewPost[], action: 'approve' | 'hide') => {
    if (lock.current || !posts.length) return;
    lock.current = true; setWorking(true); setError(null); setNotice(null);
    try {
      await api.reviewPosts(eventId, posts.map(({ id, kind }) => ({ id, kind })), action);
      setNotice(action === 'approve' ? `${posts.length === 1 ? 'Post is' : `${posts.length} posts are`} now in the feed. Reports have been resolved.` : `${posts.length === 1 ? 'Post is' : `${posts.length} posts are`} hidden from guests.`);
      setSelected(new Set()); setViewer(null); await load();
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setWorking(false); }
  };
  const disabled = loading || working;
  const selectedPosts = queue?.posts.filter(post => selected.has(postKey(post))) ?? [];
  const allSelected = !!queue?.posts.length && selectedPosts.length === queue.posts.length;
  return <>
    <header className="analytics-header"><div><h1 className="h1">Review posts</h1><p className="admin-description">Approve new photos and wishes before guests see them.</p></div><button className="abtn" disabled={disabled} onClick={() => void load()}><Icon size={16} d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2" />{loading ? 'Refreshing…' : 'Refresh posts'}</button></header>
    <nav className="review-tabs" aria-label="Post status">{([['review', 'To review'], ['feed', 'In feed'], ['hidden', 'Hidden'], ['all', 'All posts']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} disabled={working} onClick={() => changeFilter(value)}>{label}<span>{queue?.counts[value] ?? '—'}</span></button>)}</nav>
    <details className="review-filter-panel"><summary>Search &amp; filters{(query || kind !== 'all' || questId) && <span>Filtered</span>}</summary><div className="review-filters"><div className="field"><label htmlFor="review-search">Find a post</label><input id="review-search" className="input" type="search" maxLength={120} placeholder="Guest name or caption" value={search} disabled={working} onChange={e => setSearch(e.target.value)} /></div><div className="field"><label htmlFor="review-kind">Post type</label><select id="review-kind" className="input" value={kind} disabled={working} onChange={e => { setKind(e.target.value as typeof kind); setOffset(0); setSelected(new Set()); if (e.target.value === 'wish') setQuestId(''); }}><option value="all">Photos & wishes</option><option value="photo">Photos</option><option value="wish">Wishes</option></select></div>{kind !== 'wish' && <div className="field"><label htmlFor="review-quest">Photo quest</label><select id="review-quest" className="input" value={questId} disabled={working} onChange={e => { setQuestId(e.target.value); setOffset(0); setSelected(new Set()); }}><option value="">All collections</option>{PHOTO_QUESTS.map(quest => <option value={quest.id} key={quest.id}>{quest.tag}</option>)}</select></div>}</div></details>
    {queue && filter === 'review' && <p className="analytics-note">{queue.counts.pending} awaiting approval · {queue.counts.reported} reported.</p>}
    {queue && !queue.canReview && <p className="host-team-warning">You can view posts. An owner, co-owner or host must approve or hide them.</p>}
    {error && !viewer && <div className="review-error" role="alert"><p>{error}</p><button className="abtn" disabled={disabled} onClick={() => void load()}>Try again</button></div>}
    {working && <p className="analytics-note" role="status">Saving your decision…</p>}
    {notice && <p className="import-success" role="status">{notice}</p>}
    {loading && <p className="analytics-note" role="status">Loading posts…</p>}
    {queue?.canReview && !!queue.posts.length && <div className="review-bulk"><label><input type="checkbox" checked={allSelected} disabled={disabled} onChange={e => setSelected(e.target.checked ? new Set(queue.posts.map(postKey)) : new Set())} />Select all shown</label><span>{selected.size} selected</span>{selected.size > 0 && <><button className="abtn red" disabled={disabled} onClick={() => void act(selectedPosts, 'approve')}>Approve selected</button><button className="abtn" disabled={disabled} onClick={() => void act(selectedPosts, 'hide')}>Hide selected</button></>}</div>}
    {!loading && !error && queue && !queue.posts.length && <section className="panel review-empty"><Icon size={30} d="m5 12 4 4L19 6" /><h2>{filter === 'review' ? 'You’re all caught up' : 'No posts here'}</h2><p>{search || questId ? 'Try another name, caption or collection.' : filter === 'review' ? 'New uploads and guest reports will appear here.' : filter === 'hidden' ? 'Hidden posts stay here so you can return them to the feed later.' : 'Approved posts will appear in the feed.'}</p></section>}
    <div className="review-grid" aria-busy={disabled}>{queue?.posts.map(post => <article key={postKey(post)} className="panel review-card" aria-label={`Post by ${post.name}`}>
      <header><div><h2>{post.name}</h2><p>{post.kind === 'wish' ? 'Wish' : `${post.photos.length} ${post.photos.length === 1 ? 'photo' : 'photos'}`} · <time dateTime={post.createdAt}>{ago(post.createdAt)}</time></p></div>{queue.canReview && <label className="review-select"><input type="checkbox" aria-label={`Select post by ${post.name}`} checked={selected.has(postKey(post))} disabled={disabled} onChange={e => setSelected(current => { const next = new Set(current); if (e.target.checked) next.add(postKey(post)); else next.delete(postKey(post)); return next; })} /></label>}</header>
      <div className="review-badges"><span className={`review-badge ${post.status === 'pending' ? 'pending' : inFeed(post) ? 'published' : 'hidden'}`}>{visibilityLabel(post)}</span>{post.flags > 0 && <span className="review-badge reported">{post.flags} {post.flags === 1 ? 'report' : 'reports'}</span>}</div>
      {post.photos.length > 0 && <div className={`review-photo-grid${post.photos.length === 1 ? ' single' : ''}`}>{post.photos.slice(0, 4).map((photo, index) => <button type="button" key={photo.id} aria-label={`View photo ${index + 1} by ${post.name}`} onClick={() => setViewer({ post, index })}><img src={photo.url} alt={photo.caption || `Photo ${index + 1} by ${post.name}`} loading="lazy" />{post.photos.length > 4 && index === 3 && <span>+{post.photos.length - 4} more</span>}</button>)}</div>}
      {post.text && <p className="review-caption">{post.text}</p>}
      {post.flags > 0 && <details className="review-reports"><summary>Why this was reported</summary>{post.photos.flatMap((photo, index) => photo.reports.map((report, i) => <p key={`${photo.id}:${i}`}><b>Photo {index + 1}{report.removal ? ' · Removal requested' : ''}</b>{report.reason || 'No reason provided'}</p>))}</details>}
      {post.photos.length > 1 && <button className="review-view-all" type="button" onClick={() => setViewer({ post, index: 0 })}>View all {post.photos.length} photos<Icon size={16} d="M5 12h14m-6-6 6 6-6 6" /></button>}
      {queue.canReview && <ReviewActions post={post} disabled={disabled} act={action => void act([post], action)} />}
    </article>)}</div>
    {queue && queue.total > PAGE_SIZE && <nav className="review-pagination" aria-label="Review pages"><button className="abtn" disabled={disabled || offset === 0} onClick={() => { setOffset(value => Math.max(0, value - PAGE_SIZE)); setSelected(new Set()); }}>Previous</button><span>{offset + 1}–{Math.min(offset + PAGE_SIZE, queue.total)} of {queue.total} posts</span><button className="abtn" disabled={disabled || offset + PAGE_SIZE >= queue.total} onClick={() => { setOffset(value => value + PAGE_SIZE); setSelected(new Set()); }}>Next</button></nav>}
    {viewer && <PostPhotos key={postKey(viewer.post)} post={viewer.post} initial={viewer.index} onClose={() => setViewer(null)} error={error} disabled={disabled || !queue?.canReview} act={action => { if (queue?.canReview) void act([viewer.post], action); }} />}
  </>;
}
