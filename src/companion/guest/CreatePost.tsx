import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { PhotoContext } from '../lib/types';
import { GuestContentGate, SignInReassurance } from '../components/GoogleSignIn';
import { signInWithGoogle } from '../lib/guestAuth';
import { useGuestAuth } from '../lib/useGuestAuth';
import { initialPhotoQuests, stashQuestPhotos } from '../lib/photoQuests';
import { onQueueChange, pendingCount } from '../lib/uploadQueue';
import { WeddingMark } from '../components/WeddingBrand';
import Haaku from './Haaku';
import { useGuestPreview } from '../lib/guestPreview';
import { GuestPreviewNotice } from './GuestPreview';
import WishComposer from './WishComposer';
import { Icon } from './Icon';
import './create-flow.css';

const CHEVRON = 'm9 6 6 6-6 6';

/** Step 1: a sheet over the gallery that asks what the guest wants to share. */
function ChooseSheet({ ctx, base, canWish, canUpload }: { ctx: PhotoContext; base: string; canWish: boolean; canUpload: boolean }) {
  const nav = useNavigate();
  const [search] = useSearchParams();
  const gallery = useRef<HTMLInputElement>(null);
  const feedPath = ctx.scenePath || base;
  const today = ctx.questsEnabled !== false ? initialPhotoQuests(ctx.b.event.id)[0] : undefined;
  const close = () => nav(feedPath);
  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter(file => file.type.startsWith('image/'));
    if (!files.length) return;
    const quest = search.get('quest') ?? '';
    const next = new URLSearchParams({ type: 'photos', draft: stashQuestPhotos(ctx.b.event.id, quest, files) });
    if (quest) next.set('quest', quest);
    nav(`${base}/create?${next}`);
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  });
  return <div className="create-sheet-backdrop" onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="create-sheet" role="dialog" aria-modal="true" aria-labelledby="create-sheet-title" lang="en">
      <span className="create-sheet-handle" aria-hidden="true" />
      <h1 id="create-sheet-title">Share a memory</h1>
      <p className="create-sheet-intro">Everything you add goes into {ctx.b.event.coupleA} and {ctx.b.event.coupleB}’s album.</p>
      <input ref={gallery} type="file" accept="image/*" multiple aria-label="Choose photos from gallery" hidden onChange={event => { pick(event.target.files); event.target.value = ''; }} />
      <div className="create-sheet-options">
        {canUpload && <button type="button" className="create-option" onClick={() => gallery.current?.click()}>
          <span className="create-option-icon create-option-rose"><Icon size={24} d="M3.5 4.5h17v15h-17zM4 16l5-5 4 4 2.5-2.5L20 17M15.5 9h.01" /></span>
          <span><b>Add photos</b><small>Choose up to 10 from your gallery</small></span><Icon size={18} d={CHEVRON} />
        </button>}
        {canWish && <Link className="create-option" to={`${base}/create?type=wish`}>
          <span className="create-option-icon create-option-soft"><Icon size={24} d="M5 6h14v10H9l-4 3z" /></span>
          <span><b>Write a wish</b><small>A few words for the couple</small></span><Icon size={18} d={CHEVRON} />
        </Link>}
      </div>
      {canUpload && today && <Link className="create-sheet-quest" to={`${base}/create?type=photos&quest=${today.id}`}>
        <span><b>Today’s photo quest:</b> {today.title}</span><span className="create-sheet-quest-try">Try it</span>
      </Link>}
      <button type="button" className="create-sheet-cancel" onClick={close}>Cancel</button>
    </section>
  </div>;
}

/** Step 2: shown only until the guest has signed in once on this phone. */
function SignInSheet({ ctx, base }: { ctx: PhotoContext; base: string }) {
  const { pathname, search } = useLocation();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <div className="create-sheet-backdrop" onClick={event => { if (event.target === event.currentTarget) nav(ctx.scenePath || base); }}>
    <section className="create-sheet create-sheet-center" role="dialog" aria-modal="true" aria-labelledby="sign-in-sheet-title" lang="en">
      <span className="create-sheet-handle" aria-hidden="true" />
      <WeddingMark size={40} />
      <h1 id="sign-in-sheet-title">One quick step</h1>
      <p className="create-sheet-intro">Sign in with Google so your photos carry your name. You only do this once on this phone.</p>
      <button type="button" className="create-google" disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        try { await signInWithGoogle(pathname + search); } catch (e) { setError((e as Error).message); setBusy(false); }
      }}><img src="/images/google-sign-in.png" width={20} height={20} alt="" aria-hidden="true" />{busy ? 'Opening Google…' : 'Continue with Google'}</button>
      <SignInReassurance />
      {error && <p className="error" role="alert">{error}</p>}
      <Link className="create-sheet-cancel" to={ctx.scenePath || base}>Not now</Link>
    </section>
  </div>;
}

/** Steps 4 and 5: sharing progress, then the thank-you once everything has posted. */
function Posted({ ctx, base }: { ctx: PhotoContext; base: string }) {
  const [search] = useSearchParams();
  const count = Math.max(1, Number(search.get('n')) || 1);
  const quest = search.get('questTitle');
  const [waiting, setWaiting] = useState<number | null>(null);
  useEffect(() => {
    const check = () => { void pendingCount(ctx.b.event.id).then(setWaiting); };
    check();
    const off = onQueueChange(check);
    const timer = setInterval(check, 2000);
    return () => { off(); clearInterval(timer); };
  }, [ctx.b.event.id]);
  const feedPath = ctx.scenePath || base;
  const sharing = waiting === null || waiting > 0;
  const plural = count === 1 ? 'photo' : 'photos';
  return <section className="create-done" lang="en" aria-live="polite">
    {sharing ? <>
      <span className="create-done-spinner" aria-hidden="true" />
      <h1>Uploading your {plural}</h1>
      <p>{waiting ? `${waiting} ${waiting === 1 ? 'photo is' : 'photos are'} still on the way.` : 'Getting them ready…'}</p>
      <div className="create-done-note" role="status"><Icon size={20} d="M3 11.5a13 13 0 0 1 18 0M6.5 15a8 8 0 0 1 11 0M10 18.5a3 3 0 0 1 4 0" /><span>You can close this screen. If the signal drops, your {plural} wait safely on this phone and finish on their own.</span></div>
    </> : <>
      <div className="create-done-grains" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} />)}</div>
      <span className="create-done-check" aria-hidden="true"><Icon size={30} d="m5 12.5 4.5 4.5L19 7.5" /></span>
      <h1>Sent for approval</h1>
      <p>{count} {plural} submitted{quest ? ` to ${quest}` : ''}. Your post will appear in the album after a host approves it. Thank you for being part of the day.</p>
    </>}
    <div className="create-done-actions">
      <Link className="btn btn-deep btn-block" to={feedPath}>Back to the gallery</Link>
      {!sharing && <Link className="btn btn-ghost btn-block" to={`${base}/create`}><Icon size={18} d="M12 5v14M5 12h14" />Add more</Link>}
    </div>
  </section>;
}

export default function CreatePost({ ctx, base, token, canWish, canUpload }: { ctx: PhotoContext; base: string; token: string; canWish: boolean; canUpload: boolean }) {
  const [search] = useSearchParams();
  const auth = useGuestAuth();
  const preview = useGuestPreview();
  const type = search.get('type');
  if (preview) return <GuestPreviewNotice feedPath={ctx.scenePath || base} />;
  if (type === 'posted' && canUpload) return <Posted ctx={ctx} base={base} />;
  if (type === 'photos' && canUpload) return <GuestContentGate base={base} purpose="upload photos"><Haaku key={search.toString()} ctx={ctx} /></GuestContentGate>;
  if (type === 'wish' && canWish) return <GuestContentGate base={base} purpose="send a wish"><WishComposer eventId={ctx.b.event.id} token={token} guestName={ctx.me?.name ?? null} feedPath={ctx.scenePath || base} createPath={`${base}/create`} /></GuestContentGate>;
  if (!canWish && !canUpload) return <Navigate to={base} replace />;
  if (!auth.ready) return <p className="guest-meta" role="status">Checking your sign-in…</p>;
  if (!auth.canAccess) return <SignInSheet ctx={ctx} base={base} />;
  return <ChooseSheet ctx={ctx} base={base} canWish={canWish} canUpload={canUpload} />;
}
