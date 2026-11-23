import { Link, Navigate, useSearchParams } from 'react-router-dom';
import type { PhotoContext } from '../lib/types';
import { GuestContentGate } from '../components/GoogleSignIn';
import Haaku from './Haaku';
import WishComposer from './WishComposer';
import { Icon } from './Icon';

export default function CreatePost({ ctx, base, token, canWish, canUpload }: { ctx: PhotoContext; base: string; token: string; canWish: boolean; canUpload: boolean }) {
  const [search] = useSearchParams();
  const type = search.get('type');
  if (type === 'photos' && canUpload) return <GuestContentGate base={base} purpose="upload photos"><Haaku key={search.toString()} ctx={ctx} /></GuestContentGate>;
  if (type === 'wish' && canWish) return <GuestContentGate base={base} purpose="send a wish"><WishComposer eventId={ctx.b.event.id} token={token} guestName={ctx.me?.name ?? null} feedPath={ctx.scenePath || base} /></GuestContentGate>;
  if (!canWish && !canUpload) return <Navigate to={base} replace />;
  const option = (value: string) => { const next = new URLSearchParams(search); next.set('type', value); return `${base}/create?${next}`; };
  return <section className="post-composer" lang="en" aria-labelledby="create-post-title">
    <p className="guest-eyebrow">A little love, a little memory</p><h1 id="create-post-title">Create Post</h1><p>Share something special with Anand and Susmita.</p>
    <div className="create-post-options">
      {canWish && <Link to={option('wish')} className="create-post-option"><Icon size={30} d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" /><b>Send a Wish</b><span>Words for their next chapter</span></Link>}
      {canUpload && <Link to={option('photos')} className="create-post-option"><Icon size={30} d="M3 6h18v14H3zM21 16l-5-5-9 9" /><b>Upload Photos</b><span>Up to 10 photos in one post</span></Link>}
    </div>
    <Link className="btn btn-ghost" to={ctx.scenePath || base}>Back to Feed</Link>
  </section>;
}
