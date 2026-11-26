import { Link } from 'react-router-dom';
import type { Wish } from '../lib/types';
import { Icon } from './Icon';
import InviteGalleryPlaceholders from './InviteGalleryPlaceholders';
import './invite-gallery.css';

type Tile = { id: string; url: string; alt: string };

/** The invitation page's gallery: a mosaic of the latest photos and wishes, with a way to add your own. */
export default function InviteGallery({ base, photos, wishes, canUpload, canWish, locked }: { base: string; photos: Tile[]; wishes: Wish[]; canUpload: boolean; canWish: boolean; locked: boolean }) {
  const feed = `${base}/feed`;
  const create = `${base}/create`;
  const [big, ...small] = photos;
  const wishTile = (wish: Wish | undefined, area: string) => wish
    ? <Link key={`wish-${area}`} to={`${feed}`} className={`invite-tile invite-wish ${area}`}><span>“{wish.message}”</span><small>{wish.name}</small></Link>
    : <Link key={`wish-${area}`} to={canWish ? `${create}?type=wish` : feed} className={`invite-tile invite-wish invite-wish-prompt ${area}`}><span>{area === 'w1' ? 'Leave a little love for the couple.' : 'A wish for the journey ahead.'}</span><small>{canWish ? 'Write a wish' : 'Open the gallery'}</small></Link>;
  const photoTile = (tile: Tile | undefined, area: string) => tile
    ? <Link key={tile.id + area} to={feed} className={`invite-tile ${area}`}><img src={tile.url} alt={tile.alt} decoding="async" />{area === 'p1' && !locked && <span className="invite-tile-badge">Latest</span>}</Link>
    : <span key={`empty-${area}`} className={`invite-tile invite-tile-empty ${area}`} aria-hidden="true" />;

  return <section id="moments" tabIndex={-1} className="invite-gallery" lang="en" aria-labelledby="invite-gallery-title">
    <div className="invite-gallery-head">
      <h2 id="invite-gallery-title">Gallery</h2>
      <Link to={feed}>See all</Link>
    </div>
    {locked ? <InviteGalleryPlaceholders feed={feed} /> : photos.length === 0 && wishes.length === 0 ? <div className="invite-gallery-empty">
      <div className="invite-gallery-frames" aria-hidden="true"><span /><span><Icon size={24} d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3V19H4zM12 16.6a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z" /></span><span /></div>
      <p>The first photo could be yours.</p>
      {canUpload && <Link className="btn btn-primary" to={create}>Add photos</Link>}
    </div> : <div className="invite-mosaic">
      {photoTile(big, 'p1')}
      {wishTile(wishes[0], 'w1')}
      {photoTile(small[0], 'p2')}
      {photoTile(small[1], 'p3')}
      {wishTile(wishes[1], 'w2')}
      {small[2] ? photoTile(small[2], 'p4') : <Link to={feed} className="invite-tile invite-see-all p4"><Icon size={22} d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />See all</Link>}
      {canUpload ? <Link to={create} className="invite-tile invite-add p5"><Icon size={26} d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3V19H4zM12 16.6a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z" />Add yours</Link>
        : <Link to={feed} className="invite-tile invite-see-all p5">Open</Link>}
    </div>}
    <Link to={feed} className="btn btn-deep invite-gallery-open">{locked ? 'Sign in to open the gallery' : 'Open the gallery'}</Link>
    {locked && <p className="invite-gallery-note">Photos and wishes are only for invited guests.</p>}
  </section>;
}
