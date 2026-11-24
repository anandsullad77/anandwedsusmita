import { useRef, useState } from 'react';
import type { GeneralInvitationSettings, GeneralInviteBundle } from '../lib/types';
import { Icon } from './Icon';

export default function InvitationDownloads({ bundle, settings, link }: { bundle: GeneralInviteBundle; settings: GeneralInvitationSettings; link: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const generate = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const { makeInvitationCard } = await import('./invitationCard');
      const url = URL.createObjectURL(await makeInvitationCard(bundle, settings, link));
      const a = document.createElement('a');
      a.href = url; a.download = `${bundle.event.slug}-invitation.png`;
      document.body.append(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <>
    <section id="invitation-download" className="general-download" lang="en" aria-labelledby="download-title" aria-busy={busy}>
      <div className="general-download-icon"><Icon size={26} d="M4 4h16v16H4zM4 4l8 7 8-7M9 15h6" /></div>
      <div className="general-download-copy"><p className="general-eyebrow">A little keepsake</p><h2 id="download-title">Keep your invitation</h2><p>Save a little piece of our day. Download your invitation, ready to share as a story.</p></div>
      <div className="general-actions">
        <button className="btn btn-deep" aria-label="Download invitation image" disabled={busy} onClick={() => void generate()}><Icon size={18} d="M12 3v12m-4-4l4 4 4-4M4 17v4h16v-4" />{busy ? 'Preparing…' : 'Download image'}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  </>;
}
