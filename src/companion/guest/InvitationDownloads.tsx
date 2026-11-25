import { useRef, useState } from 'react';
import type { GeneralInvitationSettings, GeneralInviteBundle } from '../lib/types';
import { Icon } from './Icon';
import './invite-gallery.css';

const STATUS_ICON = 'M5 19l1.2-3.6A7.5 7.5 0 1 1 9 18.3z';

/** Keepsake: post the invitation to a WhatsApp status with a public link, or just save the image. */
export default function InvitationDownloads({ bundle, settings, link, publicLink }: { bundle: GeneralInviteBundle; settings: GeneralInvitationSettings; link: string; publicLink: string }) {
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const fileName = `${bundle.event.slug}-invitation.png`;
  const caption = `${bundle.event.coupleA} & ${bundle.event.coupleB} are getting married! Join the celebration: ${publicLink}`;

  const card = async (cardLink: string) => {
    const { makeInvitationCard } = await import('./invitationCard');
    return makeInvitationCard(bundle, settings, cardLink);
  };
  const download = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.append(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const run = async (kind: 'share' | 'save', task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(kind); setError(null); setMessage(null);
    try { await task(); } catch (e) { if ((e as Error).name !== 'AbortError') setError((e as Error).message); }
    finally { lock.current = false; setBusy(null); }
  };

  // Phones open the share sheet with the image and caption; pick WhatsApp, then "My status".
  const share = () => run('share', async () => {
    const blob = await card(publicLink);
    const file = new File([blob], fileName, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file], text: caption })) {
      await navigator.share({ files: [file], text: caption });
      return;
    }
    download(blob);
    try { await navigator.clipboard.writeText(caption); setMessage('Image saved and caption copied. In WhatsApp, open Status, add the image and paste the caption.'); }
    catch { setMessage(`Image saved. In WhatsApp, open Status and add the image with this link: ${publicLink}`); }
  });
  const save = () => run('save', async () => { download(await card(link)); });

  const cover = settings.coverUrl || '/images/anand-susmita-portrait.jpg';
  return <section id="invitation-download" className="invite-keepsake" lang="en" aria-labelledby="keepsake-title" aria-busy={!!busy}>
    <div className="invite-keepsake-card" aria-hidden="true"><img src={cover} alt="" /></div>
    <div className="invite-keepsake-copy">
      <h2 id="keepsake-title">Put it on your status</h2>
      <p>Your invitation with a link, so friends and family can join the celebration too.</p>
    </div>
    <button type="button" className="invite-keepsake-share" disabled={!!busy} onClick={() => void share()}><Icon size={18} d={STATUS_ICON} />{busy === 'share' ? 'Preparing…' : 'Add to WhatsApp status'}</button>
    <div className="invite-keepsake-foot">
      <span>Link included: {publicLink.replace(/^https?:\/\//, '').replace(/\/?\?.*$/, '')}</span>
      <button type="button" className="invite-keepsake-save" disabled={!!busy} onClick={() => void save()}><Icon size={16} d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" />{busy === 'save' ? 'Preparing…' : 'Save image'}</button>
    </div>
    {message && <p className="invite-keepsake-status" role="status">{message}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
