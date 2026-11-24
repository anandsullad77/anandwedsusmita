import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Photo, ReactionKind } from '../lib/types';
import PhotoCarousel from './PhotoCarousel';
import ReactionEffect from './ReactionEffect';

export default function PhotoPost({ photos, children, priority = false }: { photos: Photo[]; children: (active: Photo, carousel: ReactNode, celebrate: (kind: ReactionKind | null) => void) => ReactNode; priority?: boolean }) {
  const [index, setIndex] = useState(0);
  const article = useRef<HTMLElement>(null);
  const [nearby, setNearby] = useState(priority);
  const [effect, setEffect] = useState<{ photoId: string; kind: ReactionKind; nonce: number } | null>(null);
  useEffect(() => {
    if (!effect) return;
    const timer = setTimeout(() => setEffect(null), matchMedia('(prefers-reduced-motion: reduce)').matches ? 700 : 1500);
    return () => clearTimeout(timer);
  }, [effect]);
  useEffect(() => {
    if (nearby) return;
    if (!('IntersectionObserver' in window)) { setNearby(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setNearby(true); observer.disconnect(); }
    }, { rootMargin: '500px 0px' });
    if (article.current) observer.observe(article.current);
    return () => observer.disconnect();
  }, [nearby]);
  const order = photos.map(photo => photo.id).join(':');
  // Reset after moderation changes the slides, keeping controls and image in sync.
  useEffect(() => setIndex(0), [order]);
  const activeIndex = Math.min(index, photos.length - 1);
  const active = photos[activeIndex];
  return <article ref={article} className="post feed-post" data-post-type="photos">
    {children(active, <PhotoCarousel key={order} photos={photos} active={activeIndex} onActive={next => { setEffect(null); setIndex(next); }} enabled={nearby} priority={priority}
      overlay={effect?.photoId === active.id ? <ReactionEffect key={effect.nonce} kind={effect.kind} /> : undefined} />, kind => setEffect(kind ? { photoId: active.id, kind, nonce: Date.now() } : null))}
  </article>;
}
