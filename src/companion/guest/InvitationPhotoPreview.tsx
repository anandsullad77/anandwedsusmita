import { Link } from 'react-router-dom';
import { Icon } from './Icon';

type PreviewPhoto = { id: string; url: string; alt: string };
export default function InvitationPhotoPreview({ photos, to, publicPreview = false }: { photos: PreviewPhoto[]; to?: string; publicPreview?: boolean }) {
  if (!photos.length) return null;
  const content = <>
    {photos.slice(0, 3).map((photo, index) => <img key={photo.id} src={photo.url} alt={photo.alt} loading="lazy" decoding="async" className={`general-photo-${index + 1}`} />)}
    <span className="general-photo-caption">{publicPreview ? 'Sign in to see all memories' : `${photos.length} ${photos.length === 1 ? 'memory' : 'memories'} shared`}<Icon size={16} d="M5 12h14m-6-6l6 6-6 6" /></span>
  </>;
  return to ? <Link to={to} aria-label={publicPreview ? 'Sign in to view the wedding feed' : 'View latest wedding posts'} className="general-photo-preview">{content}</Link>
    : <div className="general-photo-preview" aria-label="Photos shown before sign-in">{content}</div>;
}
