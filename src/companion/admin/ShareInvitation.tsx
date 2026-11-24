import { useEffect, useRef, useState } from 'react';
import type { AdminHousehold, EventInfo } from '../lib/types';
import { inviteMessage, waLink } from '../lib/format';
import { useVisibleViewport } from '../lib/useVisibleViewport';

export const INVITATION_SHARE_IMAGE = '/images/wedding-share-invitation.png';

export default function ShareInvitation({ household, event, link, onClose, onShared }: {
  household: AdminHousehold; event: EventInfo; link: string; onClose: () => void; onShared: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const message = inviteMessage(household.name, event, link, household.invitationType === 'individual');
  const phone = household.people.find(p => p.phone)?.phone ?? '';
  const shareData = file ? { files: [file], text: message } : null;
  const canShare = Boolean(shareData && typeof navigator.share === 'function' && navigator.canShare?.(shareData));
  useVisibleViewport(dialog);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const sheet = dialog.current;
    sheet?.showModal();
    return () => { sheet?.close(); previous?.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(INVITATION_SHARE_IMAGE, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Image unavailable');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      setFile(new File([blob], 'Anand-and-Susmita-wedding.png', { type: 'image/png' }));
    }).catch(() => { if (!controller.signal.aborted) setError('Could not prepare the picture. You can still download it or send the message below.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const share = async () => {
    if (!shareData || lock.current) return;
    lock.current = true; setBusy(true); setNotice(''); setError('');
    try {
      // File preparation happens before this click to preserve browser user activation.
      await navigator.share(shareData);
      setNotice('Invitation handed to your sharing app.'); onShared();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError('Sharing could not open. Download the picture and use Open WhatsApp below.');
    } finally { lock.current = false; setBusy(false); }
  };
  return <dialog ref={dialog} className="family-dialog invitation-share-dialog" aria-labelledby="share-invitation-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="family-edit-form">
      <header className="family-edit-header"><h2 id="share-invitation-title">Invitation for {household.name}</h2><button type="button" className="abtn" disabled={busy} onClick={onClose} aria-label="Close invitation sharing">Close</button></header>
      <div className="family-edit-scroll"><div className="family-edit-body">
        <img className="invitation-share-image" src={INVITATION_SHARE_IMAGE} alt="Anand and Susmita’s wedding invitation, 29 November 2026" width={1660} height={948} />
        <label className="field" htmlFor="invitation-share-message"><span>Personal invitation message</span><textarea id="invitation-share-message" className="input invitation-share-message" readOnly value={message} /></label>
        <p className="invitation-share-help">{canShare ? 'Share the picture and message together. Choose WhatsApp, then select your guest.' : loading ? 'Preparing the invitation picture…' : 'Download the picture, then open WhatsApp and attach it above the prepared message.'}</p>
        <div className="invitation-share-tools"><a className="abtn" href={INVITATION_SHARE_IMAGE} download="Anand-and-Susmita-wedding.png">Download picture</a><button type="button" className="abtn" onClick={async () => {
          try { await navigator.clipboard.writeText(message); setNotice('Invitation message copied.'); setError(''); }
          catch { setError('Could not copy. Select and copy the message above.'); }
        }}>Copy message</button></div>
        {notice && <p role="status" className="import-success">{notice}</p>}
        {error && <p role="alert" className="error">{error}</p>}
      </div></div>
      <footer className="family-edit-actions">
        <a className="abtn" href={waLink(phone, message)} target="_blank" rel="noopener noreferrer" onClick={onShared}>Open WhatsApp</a>
        {canShare && <button type="button" className="abtn red" disabled={busy} onClick={() => void share()}>{busy ? 'Sharing…' : 'Share picture & message'}</button>}
      </footer>
    </div>
  </dialog>;
}
