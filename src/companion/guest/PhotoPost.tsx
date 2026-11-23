import { useEffect, useState, type ReactNode } from 'react';
import type { Photo } from '../lib/types';
import PhotoCarousel from './PhotoCarousel';

export default function PhotoPost({ photos, children }: { photos: Photo[]; children: (active: Photo, carousel: ReactNode) => ReactNode }) {
  const [index, setIndex] = useState(0);
  const order = photos.map(photo => photo.id).join(':');
  // Reset after moderation changes the slides, keeping controls and image in sync.
  useEffect(() => setIndex(0), [order]);
  const activeIndex = Math.min(index, photos.length - 1);
  const active = photos[activeIndex];
  return <article className="post feed-post" data-post-type="photos">
    {children(active, <PhotoCarousel key={order} photos={photos} active={activeIndex} onActive={setIndex} />)}
  </article>;
}
