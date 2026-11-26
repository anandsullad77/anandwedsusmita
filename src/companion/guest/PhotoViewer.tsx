import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Photo, ReactionKind } from '../lib/types';
import { ago } from '../lib/format';
import { photoQuest } from '../lib/photoQuests';
import PhotoReactions from './PhotoReactions';
import { Icon } from './Icon';
import './gallery.css';
import './guest-preview.css';

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
  const [controls, setControls] = useState(true);
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const activeIndex = useRef(index);
  activeIndex.current = index;
  const closeButton = useRef<HTMLButtonElement>(null);
  const more = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const options = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const photo = photos[Math.min(index, photos.length - 1)];
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const go = useCallback((next: number) => {
    const target = Math.max(0, Math.min(photos.length - 1, next));
    track.current?.scrollTo({ left: target * track.current.clientWidth, behavior: reduced ? 'instant' : 'smooth' });
    setIndex(target); setMenu(false);
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
    const element = track.current;
    if (!element) return;
    const resize = new ResizeObserver(() => { element.scrollLeft = activeIndex.current * element.clientWidth; });
    resize.observe(element);
    return () => resize.disconnect();
  }, []);

  useEffect(() => {
    if (!menu) return;
    options.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const outside = (event: Event) => { if (!more.current?.contains(event.target as Node)) setMenu(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); };
  }, [menu]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Tab' && !document.querySelector('.reaction-picker-overlay')) {
        const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not([tabindex="-1"])') ?? []);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (menu) { setMenu(false); moreButton.current?.focus({ preventScroll: true }); }
        else onClose();
      }
      if (menu || document.querySelector('.reaction-picker-overlay')) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1); }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [go, index, menu, onClose]);

  if (!photo) return null;

  async function save() {
    if (saving) return;
    setMenu(false); moreButton.current?.focus({ preventScroll: true }); setSaving(true);
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

  const quest = photoQuest(photo.questId);
  return createPortal(<div ref={dialog} className="photo-viewer" role="dialog" aria-modal="true" aria-label="Photo viewer" lang="en">
    {controls && <header className="photo-viewer-top">
      <button ref={closeButton} type="button" className="photo-viewer-round" aria-label="Close" onClick={onClose}><Icon size={20} d="M6 6l12 12M18 6 6 18" /></button>
      <span aria-live="polite">{index + 1} of {total} {total === 1 ? 'photo' : 'photos'}</span>
      <div ref={more} className="photo-viewer-more">
        <button ref={moreButton} type="button" className="photo-viewer-round" aria-label="More options" aria-haspopup="menu" aria-expanded={menu} aria-controls={menu ? menuId : undefined} onClick={() => setMenu(open => !open)} onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setMenu(true); }
        }}><Icon size={18} d="M5 12h.01M12 12h.01M19 12h.01" /></button>
        {menu && <div ref={options} id={menuId} className="photo-viewer-menu" role="menu" aria-label="Photo options" onKeyDown={event => {
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
          const current = items.indexOf(document.activeElement as HTMLButtonElement);
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          }
        }}>
          <button type="button" role="menuitem" disabled={saving} onClick={() => void save()}><Icon size={18} d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" />{saving ? 'Saving…' : 'Save to phone'}</button>
          {!readOnly && <>
            <button type="button" role="menuitem" onClick={() => { setMenu(false); moreButton.current?.focus({ preventScroll: true }); onFlag(photo, true); }}>Request removal</button>
            <button type="button" role="menuitem" onClick={() => { setMenu(false); moreButton.current?.focus({ preventScroll: true }); onFlag(photo, false); }}>Report this photo</button>
          </>}
        </div>}
      </div>
    </header>}

    <div ref={track} className="photo-viewer-track" aria-roledescription="carousel" aria-label="All gallery photos" onScroll={event => {
      const next = Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth);
      if (next !== index) { setIndex(Math.max(0, Math.min(photos.length - 1, next))); setMenu(false); }
    }}>
      {photos.map((item, i) => <div key={item.id} className="photo-viewer-slide" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${total}`} aria-hidden={i !== index}>
        {Math.abs(i - index) <= 1 && <button type="button" className="photo-viewer-photo" tabIndex={i === index ? 0 : -1} aria-label={controls ? 'Hide photo controls' : 'Show photo controls'} onClick={() => { setMenu(false); setControls(visible => !visible); }}>
          <img src={item.url} alt={item.caption ? item.caption : `Photo by ${item.uploaderName}`} decoding="async" draggable={false} />
        </button>}
      </div>)}
    </div>
    {controls && index > 0 && <button type="button" className="photo-viewer-round photo-viewer-prev" aria-label="Previous photo" onClick={() => go(index - 1)}><Icon size={20} d="M15 6l-6 6 6 6" /></button>}
    {controls && index < photos.length - 1 && <button type="button" className="photo-viewer-round photo-viewer-next" aria-label="Next photo" onClick={() => go(index + 1)}><Icon size={20} d="M9 6l6 6-6 6" /></button>}

    {controls && <div className="photo-viewer-info">
      <div className="photo-viewer-details">
        <div className="photo-viewer-author">
          <span className="photo-viewer-avatar" aria-hidden="true">{initials(photo.uploaderName)}</span>
          <div><b>{photo.uploaderName}</b><span>{[photo.moment, ago(photo.createdAt)].filter(Boolean).join(' · ')}</span></div>
        </div>
        {(photo.caption || quest) && <p key={photo.id} className="photo-viewer-caption">{photo.caption}{quest && <span className="photo-viewer-quest">{quest.tag}</span>}</p>}
        {readOnly && <p className="photo-viewer-preview-note">Reactions are turned off in guest preview.</p>}
      </div>
      {!readOnly && <PhotoReactions key={photo.id} photo={photo} pending={reacting.has(photo.id)} onChange={kind => onReact(photo, kind)} appearance="overlay" />}
    </div>}
    <span className="sr-only" role="status">{saving ? 'Saving photo…' : ''}</span>
  </div>, document.body);
}
