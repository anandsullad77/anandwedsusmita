import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Photo, ReactionKind } from '../lib/types';
import { REACTIONS } from '../lib/reactions';
import './reactions.css';

export default function PhotoReactions({ photo, pending, onChange }: { photo: Photo; pending: boolean; onChange: (kind: ReactionKind | null) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const locked = useRef(false);
  const menuId = useId();
  const current = REACTIONS.find(r => r.id === photo.myReaction);
  const used = REACTIONS.filter(r => photo.reactionCounts[r.id] > 0);
  const total = used.reduce((n, r) => n + photo.reactionCounts[r.id], 0);
  const cancelHold = () => { if (hold.current) clearTimeout(hold.current); hold.current = null; };
  const cancelLeave = () => { if (leaving.current) clearTimeout(leaving.current); leaving.current = null; };
  const close = (restore = false) => { cancelLeave(); setOpen(false); if (restore) trigger.current?.focus({ preventScroll: true }); };
  const focusItem = (index: number) => menu.current?.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]')[index]?.focus({ preventScroll: true });
  useLayoutEffect(() => {
    if (!open) { setPosition(null); return; }
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      const header = document.querySelector('.general-header')?.getBoundingClientRect().bottom ?? 0;
      if (anchor.bottom < header || anchor.top > innerHeight) { setOpen(false); return; }
      const width = Math.min(292, innerWidth - 64), height = menu.current?.offsetHeight ?? 90;
      let top = anchor.top - height - 10;
      if (top < header + 8) top = anchor.bottom + 10;
      setPosition({ left: Math.max(16, Math.min(anchor.left, innerWidth - width - 16)), top: Math.max(header + 8, Math.min(top, innerHeight - height - 12)) });
    };
    place(); window.addEventListener('scroll', place, true); window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancelHold(); cancelLeave(); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => { if (!root.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) { cancelLeave(); setOpen(false); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); };
  }, [open]);
  const choose = async (kind: ReactionKind) => {
    if (locked.current || pending) return;
    locked.current = true; setError(''); close(true);
    try { await onChange(photo.myReaction === kind ? null : kind); }
    catch (err) { if (mounted.current) setError((err as Error).message || 'Could not save your reaction. Please try again.'); }
    finally {
      locked.current = false;
      requestAnimationFrame(() => {
        if (mounted.current && (document.activeElement === document.body || root.current?.contains(document.activeElement))) trigger.current?.focus({ preventScroll: true });
      });
    }
  };

  return <div ref={root} className="photo-reactions" onPointerEnter={cancelLeave} onPointerLeave={event => {
    if (event.pointerType === 'mouse') { cancelLeave(); leaving.current = setTimeout(() => setOpen(false), 250); }
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(true); }
  }}>
    <div className="reaction-button-row">
      <button ref={trigger} type="button" className={`reaction-trigger${current ? ` has-reaction reaction-${current.id}` : ''}`} aria-label={current ? `Your reaction: ${current.label}. Change reaction` : 'React to this photo'} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} disabled={pending} onClick={() => {
        if (held.current) { held.current = false; return; }
        setOpen(true);
        requestAnimationFrame(() => focusItem(Math.max(0, REACTIONS.findIndex(r => r.id === photo.myReaction))));
      }} onPointerEnter={event => { if (event.pointerType === 'mouse' && !pending) { cancelLeave(); setOpen(true); } }} onPointerDown={event => {
        if (event.pointerType === 'mouse' || pending) return;
        held.current = false; cancelHold();
        hold.current = setTimeout(() => { held.current = true; setOpen(true); }, 450);
      }} onPointerUp={cancelHold} onPointerCancel={() => { cancelHold(); held.current = false; }} onPointerMove={event => { if (event.pointerType !== 'mouse' && event.buttons && Math.abs(event.movementY) > 8) cancelHold(); }} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); requestAnimationFrame(() => focusItem(event.key === 'ArrowUp' ? 3 : 0)); }
      }}>
        <span className="reaction-trigger-emoji" aria-hidden="true">{current?.emoji ?? '♡'}</span><span>{pending ? 'Saving…' : current?.label ?? 'React'}</span>
      </button>
      {!!total && <span className="reaction-summary" role="img" aria-label={used.map(r => `${photo.reactionCounts[r.id]} ${r.label}`).join(', ')}>
        <span className="reaction-summary-icons" aria-hidden="true">{used.map(r => <span key={r.id} title={`${r.label}: ${photo.reactionCounts[r.id]}`}>{r.emoji}</span>)}</span><span aria-hidden="true">{total}</span>
      </span>}
    </div>
    {open && createPortal(<div ref={menu} id={menuId} className="reaction-picker" style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }} role="menu" aria-label="Choose a photo reaction" onPointerEnter={cancelLeave} onPointerLeave={event => {
      if (event.pointerType === 'mouse') { cancelLeave(); leaving.current = setTimeout(() => close(), 250); }
    }} onKeyDown={event => {
      const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]') ?? []);
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        focusItem(event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + 4) % 4);
      }
      if (event.key === 'Tab') requestAnimationFrame(() => close());
    }}>{REACTIONS.map(reaction => <button key={reaction.id} type="button" role="menuitemradio" aria-label={reaction.label} aria-checked={photo.myReaction === reaction.id} disabled={pending} tabIndex={-1} style={{ color: reaction.color }} onClick={() => void choose(reaction.id)}><span aria-hidden="true">{reaction.emoji}</span><b>{reaction.label}</b></button>)}</div>, document.body)}
    {error && <p className="reaction-error error" role="alert">{error}</p>}
    <span className="sr-only" role="status">{current ? `${current.label} selected for this photo.` : 'No reaction selected for this photo.'}</span>
  </div>;
}
