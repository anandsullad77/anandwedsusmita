import { useRef } from 'react';
import type { Photo } from '../lib/types';
import { Icon } from './Icon';

export default function PhotoCarousel({ photos, active, onActive }: { photos: Photo[]; active: number; onActive: (index: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const go = (index: number) => {
    track.current?.scrollTo({ left: index * track.current.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  return <div className="photo-carousel" role="region" aria-roledescription="carousel" aria-label={`Post with ${photos.length} photo${photos.length === 1 ? '' : 's'}`}>
    <div ref={track} className="carousel-track" tabIndex={photos.length > 1 ? 0 : undefined} aria-label="Post photos" onKeyDown={event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); go(Math.max(0, Math.min(photos.length - 1, active + (event.key === 'ArrowRight' ? 1 : -1))));
      }
    }} onScroll={event => {
      const index = Math.max(0, Math.min(photos.length - 1, Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth)));
      if (index !== active) onActive(index);
    }}>
      {photos.map((photo, i) => <div className="carousel-slide" key={photo.id} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${photos.length}`}>
        <img src={photo.url} alt={photo.caption ? `${photo.caption} — photo ${i + 1}` : `Photo ${i + 1} by ${photo.uploaderName}`} loading="lazy" draggable={false} />
      </div>)}
    </div>
    {photos.length > 1 && <>
      <span className="carousel-count" aria-live="polite">{active + 1} / {photos.length}</span>
      <button type="button" className="carousel-control carousel-prev" aria-label="Previous photo" disabled={active === 0} onClick={() => go(active - 1)}><Icon d="M15 6l-6 6 6 6" /></button>
      <button type="button" className="carousel-control carousel-next" aria-label="Next photo" disabled={active === photos.length - 1} onClick={() => go(active + 1)}><Icon d="M9 6l6 6-6 6" /></button>
      <div className="carousel-pagination" aria-label="Choose photo">{photos.map((photo, i) => <button type="button" key={photo.id} aria-label={`Show photo ${i + 1}`} aria-current={active === i ? 'true' : undefined} onClick={() => go(i)}><span /></button>)}</div>
    </>}
  </div>;
}
