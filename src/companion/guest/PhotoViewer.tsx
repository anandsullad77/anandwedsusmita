import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Photo, ReactionKind } from '../lib/types';
import { REACTIONS } from '../lib/reactions';
import { ago } from '../lib/format';
import { photoQuest } from '../lib/photoQuests';
import ReactionSymbol from './ReactionSymbol';
import { Icon } from './Icon';
import './gallery.css';
import './guest-preview.css';

// Stroke icons for the reactions; Blessings keeps its rice-grain symbol.
const REACTION_ICON: Record<Exclude<ReactionKind, 'akshate'>, string> = {
  love: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  wow: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
  celebrate: 'M4 20 9 8l7 7zM14 4v2M19 9h2M17.5 5.5 16 7M12 3.5l.5 1.5',
};

const initials = (name: string) => name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase() || 'G';

type Props = {
  photos: Photo[];
  start: number;
  total: number;
  reacting: Set<string>;
  onClose: () => void;
  onReact: (photo: Photo, reaction: ReactionKind | null) => Promise<void>;
  onFlag: (photo: Photo, removal: boolean) => void;
  readOnly?: boolean;
};

/** Full-screen viewer that swipes through every photo in the gallery, not just one post. */
export default function PhotoViewer({ photos, start, total, reacting, onClose, onReact, onFlag, readOnly = false }: Props) {
  const [index, setIndex] = useState(Math.min(start, photos.length - 1));
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const photo = photos[Math.min(index, photos.length - 1)];
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const go = useCallback((next: number) => {
    const target = Math.max(0, Math.min(photos.length - 1, next));
    track.current?.scrollTo({ left: target * track.current.clientWidth, behavior: reduced ? 'instant' : 'smooth' });
    setIndex(target); setMenu(false); setError(null);
  }, [photos.length, reduced]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus({ preventScroll: true });
    if (track.current) track.current.scrollLeft = index * track.current.clientWidth;
    return () => { document.body.style.overflow = overflow; previous?.focus?.({ preventScroll: true }); };
    // Position once on open; later moves come from swipes and the arrows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (menu) setMenu(false); else onClose(); }
      if (event.key === 'ArrowRight') go(index + 1);
      if (event.key === 'ArrowLeft') go(index - 1);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [go, index, menu, onClose]);

  if (!photo) return null;

  async function save() {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch(photo.url);
      if (!response.ok) throw new Error('download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `anand-susmita-${photo.id.slice(0, 8)}.${blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg'}`;
      document.body.append(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      window.open(photo.url, '_blank', 'noopener');
    } finally { setSaving(false); }
  }

  async function react(kind: ReactionKind) {
    if (reacting.has(photo.id)) return;
    setError(null);
    try { await onReact(photo, photo.myReaction === kind ? null : kind); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save your reaction. Please try again.'); }
  }

  const quest = photoQuest(photo.questId);
  return createPortal(<div className="photo-viewer" role="dialog" aria-modal="true" aria-label="Photo viewer" lang="en">
    <header className="photo-viewer-top">
      <button ref={closeButton} type="button" className="photo-viewer-round" aria-label="Close" onClick={onClose}><Icon size={20} d="M6 6l12 12M18 6 6 18" /></button>
      <span aria-live="polite">{index + 1} of {total} {total === 1 ? 'photo' : 'photos'}</span>
      {readOnly ? <span style={{ width: 44 }} /> : <div className="photo-viewer-more">
        <button type="button" className="photo-viewer-round" aria-label="More options" aria-expanded={menu} onClick={() => setMenu(open => !open)}><Icon size={18} d="M5 12h.01M12 12h.01M19 12h.01" /></button>
        {menu && <div className="photo-viewer-menu">
          <button type="button" onClick={() => { setMenu(false); onFlag(photo, true); }}>Request removal</button>
          <button type="button" onClick={() => { setMenu(false); onFlag(photo, false); }}>Report this photo</button>
        </div>}
      </div>}
    </header>

    <div ref={track} className="photo-viewer-track" aria-roledescription="carousel" aria-label="All gallery photos" onScroll={event => {
      const next = Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth);
      if (next !== index) { setIndex(next); setMenu(false); setError(null); }
    }}>
      {photos.map((item, i) => <div key={item.id} className="photo-viewer-slide" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${total}`}>
        {Math.abs(i - index) <= 1 && <img src={item.url} alt={item.caption ? item.caption : `Photo by ${item.uploaderName}`} decoding="async" draggable={false} />}
      </div>)}
    </div>
    {index > 0 && <button type="button" className="photo-viewer-round photo-viewer-prev" aria-label="Previous photo" onClick={() => go(index - 1)}><Icon size={20} d="M15 6l-6 6 6 6" /></button>}
    {index < photos.length - 1 && <button type="button" className="photo-viewer-round photo-viewer-next" aria-label="Next photo" onClick={() => go(index + 1)}><Icon size={20} d="M9 6l6 6-6 6" /></button>}

    <div className="photo-viewer-info">
      <div className="photo-viewer-author">
        <span className="photo-viewer-avatar" aria-hidden="true">{initials(photo.uploaderName)}</span>
        <div><b>{photo.uploaderName}</b><span>{[photo.moment, ago(photo.createdAt)].filter(Boolean).join(' · ')}</span></div>
        {photos.length > 1 && <small>Swipe for more</small>}
      </div>
      {(photo.caption || quest) && <p className="photo-viewer-caption">{photo.caption}{quest && <span className="photo-viewer-quest">{quest.tag}</span>}</p>}
      <div className="photo-viewer-reactions" role="group" aria-label="React to this photo">
        {REACTIONS.map(r => {
          const on = photo.myReaction === r.id;
          const count = photo.reactionCounts[r.id];
          return <button key={r.id} type="button" aria-pressed={on} disabled={readOnly || reacting.has(photo.id)} onClick={() => void react(r.id)} style={on ? { ['--reaction' as string]: r.id === 'akshate' ? '#E9A21B' : r.color } : undefined}>
            <span className="photo-viewer-reaction-dot">{r.id === 'akshate' ? <ReactionSymbol kind="akshate" /> : <Icon size={22} d={REACTION_ICON[r.id]} />}</span>
            {r.id === 'akshate' ? 'Bless' : r.label}{count > 0 ? ` ${count}` : ''}
          </button>;
        })}
      </div>
      {readOnly && <p className="photo-viewer-preview-note">Reactions are turned off in guest preview.</p>}
      {error && <p className="photo-viewer-error" role="alert">{error}</p>}
      <button type="button" className="photo-viewer-save" disabled={saving} onClick={() => void save()}><Icon size={18} d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" />{saving ? 'Saving…' : 'Save to phone'}</button>
    </div>
  </div>, document.body);
}
