import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Photo } from '../lib/types';
import PhotoCarousel from './PhotoCarousel';

export default function PhotoPost({ photos, children, priority = false }: { photos: Photo[]; children: (active: Photo, carousel: ReactNode) => ReactNode; priority?: boolean }) {
  const [index, setIndex] = useState(0);
  const article = useRef<HTMLElement>(null);
  const [nearby, setNearby] = useState(priority);
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
    {children(active, <PhotoCarousel key={order} photos={photos} active={activeIndex} onActive={setIndex} enabled={nearby} priority={priority} />)}
  </article>;
}
