import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Photo } from '../lib/types';
import { Icon } from './Icon';

export default function PhotoCarousel({ photos, active, onActive, enabled = true, priority = false, overlay }: { photos: Photo[]; active: number; onActive: (index: number) => void; enabled?: boolean; priority?: boolean; overlay?: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [visited, setVisited] = useState<Set<number>>(() => new Set());
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!enabled) return;
    setVisited(previous => {
      const next = new Set(previous);
      for (let i = Math.max(0, active - 1); i <= Math.min(photos.length - 1, active + 1); i++) next.add(i);
      return next.size === previous.size ? previous : next;
    });
  }, [active, enabled, photos.length]);
  const go = (index: number) => {
    track.current?.scrollTo({ left: index * track.current.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  return <div className="photo-carousel" role="region" aria-roledescription="carousel" aria-label={`Post with ${photos.length} photo${photos.length === 1 ? '' : 's'}`}>
    <div className="carousel-photo-surface">
    <div ref={track} className="carousel-track" style={{ aspectRatio: aspectRatios[photos[active]?.id] ?? 1 }} tabIndex={photos.length > 1 ? 0 : undefined} aria-label="Post photos" onKeyDown={event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); go(Math.max(0, Math.min(photos.length - 1, active + (event.key === 'ArrowRight' ? 1 : -1))));
      }
    }} onScroll={event => {
      const index = Math.max(0, Math.min(photos.length - 1, Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth)));
      if (index !== active) onActive(index);
    }}>
      {photos.map((photo, i) => <div className="carousel-slide" key={photo.id} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${photos.length}`}>
        <img src={enabled && (Math.abs(i - active) <= 1 || visited.has(i)) ? photo.url : undefined} alt={photo.caption ? `${photo.caption} — photo ${i + 1}` : `Photo ${i + 1} by ${photo.uploaderName}`} loading="eager" decoding="async" fetchPriority={priority && i === active ? 'high' : 'low'} draggable={false} onLoad={event => {
          const image = event.currentTarget;
          if (!image.naturalWidth || !image.naturalHeight) return;
          const ratio = image.naturalWidth / image.naturalHeight;
          setAspectRatios(previous => previous[photo.id] === ratio ? previous : { ...previous, [photo.id]: ratio });
        }} />
      </div>)}
    </div>
    {overlay}
    </div>
    {photos.length > 1 && <>
      <span className="carousel-count" aria-live="polite">{active + 1} / {photos.length}</span>
      <button type="button" className="carousel-control carousel-prev" aria-label="Previous photo" disabled={active === 0} onClick={() => go(active - 1)}><Icon d="M15 6l-6 6 6 6" /></button>
      <button type="button" className="carousel-control carousel-next" aria-label="Next photo" disabled={active === photos.length - 1} onClick={() => go(active + 1)}><Icon d="M9 6l6 6-6 6" /></button>
      <div className="carousel-pagination" aria-label="Choose photo">{photos.map((photo, i) => <button type="button" key={photo.id} aria-label={`Show photo ${i + 1}`} aria-current={active === i ? 'true' : undefined} onClick={() => go(i)}><span /></button>)}</div>
    </>}
  </div>;
}
