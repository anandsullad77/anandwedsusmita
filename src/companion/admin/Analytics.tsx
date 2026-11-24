import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/backend';
import type { AdminAnalytics } from '../lib/types';
import { Icon } from '../guest/Icon';

const postStatus: Record<string, string> = { pending: 'Awaiting approval', rejected: 'Rejected', hidden: 'Hidden', partly_hidden: 'Some photos hidden' };
const when = (at: string) => new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export default function Analytics({ eventId }: { eventId: string }) {
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const load = useCallback(async () => {
    const current = ++request.current;
    setBusy(true); setError(null);
    try { const result = await api.adminAnalytics(eventId); if (request.current === current) setData(result); }
    catch (e) { if (request.current === current) setError((e as Error).message); }
    finally { if (request.current === current) setBusy(false); }
  }, [eventId]);
  useEffect(() => { void load(); return () => { request.current++; }; }, [load]);

  return <>
    <header className="analytics-header"><div><h1 className="h1">Analytics</h1><p className="admin-description">A simple look at visits, sign-ins and shared memories.</p></div><button className="abtn" disabled={busy} onClick={() => void load()}>{busy ? 'Refreshing…' : 'Refresh'}</button></header>
    {error && <p className="error" role="alert">{error}</p>}
    {!data && busy && <p role="status">Loading analytics…</p>}
    {data && <>
      <section className="kpis analytics-kpis" aria-label="Website totals">
        <div className="kpi"><span className="l">Link visitors</span><span className="n">{data.visitors.toLocaleString('en-IN')}</span><span className="l">Unique browsers</span></div>
        <div className="kpi"><span className="l">Guests signed in</span><span className="n">{data.signedIn.toLocaleString('en-IN')}</span><span className="l">Unique Google accounts</span></div>
        <div className="kpi"><span className="l">Posts shared</span><span className="n">{(data.photoPosts + data.wishes).toLocaleString('en-IN')}</span><span className="l">{data.photoPosts} photo {data.photoPosts === 1 ? 'post' : 'posts'} · {data.wishes} {data.wishes === 1 ? 'wish' : 'wishes'}</span></div>
      </section>
      <p className="analytics-note">Visits start when analytics is enabled and count each browser once; the same person on another device counts again. Sign-ins count guests, excluding hosts. Existing sign-ins and posts are included, along with posts awaiting approval.</p>
      {api.kind === 'local' && <p className="analytics-note">Demo: visits and posts are from this browser. Google sign-ins are available on the connected website.</p>}
      <section className="panel analytics-posts" aria-labelledby="analytics-posts-title">
        <div className="analytics-header"><h2 id="analytics-posts-title">Recent posts</h2><span className="analytics-note">Latest 20 · times in IST</span></div>
        {!data.recentPosts.length && <p className="analytics-note">No photos or wishes shared yet.</p>}
        {!!data.recentPosts.length && <ul>{data.recentPosts.map(post => <li key={`${post.kind}:${post.id}`}>
          <div className="analytics-post-image">{post.url ? <a href={post.url} target="_blank" rel="noreferrer" aria-label={`View photo by ${post.name}`}><img src={post.url} alt={`Photo shared by ${post.name}`} loading="lazy" /></a> : <Icon size={24} d={post.kind === 'photo' ? 'M3 6h18v14H3zM21 16l-5-5-9 9' : 'M12 21S3 15 3 8a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 7-9 13-9 13z'} />}</div>
          <div className="analytics-post-content"><b>{post.name}</b><span className="analytics-note">{post.kind === 'photo' ? `Shared ${post.photos} ${post.photos === 1 ? 'photo' : 'photos'}` : 'Sent a wish'} · <time dateTime={post.createdAt}>{when(post.createdAt)}</time></span>{post.text && <p>{post.text}</p>}{postStatus[post.status] && <span className={`pill ${post.status === 'pending' ? 'wait' : 'off'}`}>{postStatus[post.status]}</span>}</div>
        </li>)}</ul>}
      </section>
    </>}
  </>;
}
