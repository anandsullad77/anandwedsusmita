import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/backend';
import { IMPORT_LIMITS, validateHouseholdImport } from '../lib/familyImport';
import { contactDrafts, contactPhone, contactPicker, contactReview, readContactFile } from '../lib/contactImport';
import type { ContactDraft } from '../lib/contactImport';
import type { AdminData } from '../lib/types';
import { useVisibleViewport } from '../lib/useVisibleViewport';
import { Icon } from '../guest/Icon';

export default function FamilyContactImport({ d, onClose, onImported }: { d: AdminData; onClose: () => void; onImported: (message: string) => void }) {
  const sheet = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const working = useRef(false);
  const [busy, setBusy] = useState<'pick' | 'read' | 'save' | null>(null);
  const [rows, setRows] = useState<ContactDraft[]>([]);
  const [error, setError] = useState('');
  const picker = contactPicker();
  useVisibleViewport(sheet);
  useEffect(() => {
    returnFocus.current ??= document.activeElement as HTMLElement | null;
    const dialog = sheet.current;
    dialog?.showModal();
    return () => { dialog?.close(); returnFocus.current?.focus({ preventScroll: true }); };
  }, []);

  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    if (working.current) return;
    working.current = true; setBusy(kind); setError('');
    try { await action(); }
    catch (e) {
      const err = e as Error;
      if (err.name !== 'AbortError') setError(err.name === 'NotAllowedError' || err.name === 'SecurityError'
        ? 'Contact access was not allowed. Try again, or import a .vcf contact file instead.'
        : err.message || 'Could not import contacts. Please try again.');
    } finally { working.current = false; setBusy(null); }
  };
  const review = contactReview(rows, d.households);
  const ready = review.filter(r => r.row.selected && !r.duplicate && !r.issue);
  const duplicates = review.filter(r => r.row.selected && r.duplicate).length;
  const hasIssues = review.some(r => r.row.selected && !r.duplicate && r.issue);
  const update = (id: string, patch: Partial<ContactDraft>) => setRows(items => items.map(row => row.id === id ? { ...row, ...patch } : row));
  const save = () => run('save', async () => {
    if (!ready.length || hasIssues) return;
    const families = ready.map(({ row }) => ({ name: row.family.trim(), side: null, invitedBy: null, cap: 6,
      functionIds: d.functions.map(f => f.id), people: [{ name: row.name.trim(), phone: contactPhone(row.phone) || null, isChild: false }] }));
    validateHouseholdImport(families, d.functions);
    const result = await api.importHouseholds(d.event.id, families);
    const skipped = duplicates + result.skipped;
    onImported(`Created ${result.created} ${result.created === 1 ? 'family' : 'families'} from contacts.${skipped ? ` Skipped ${skipped} duplicate ${skipped === 1 ? 'contact' : 'contacts'}.` : ''} Use Send on WhatsApp to share their invitations.`);
  });

  return <dialog ref={sheet} className="family-dialog contact-import-dialog" aria-labelledby="contact-import-title" aria-describedby="contact-import-help" onCancel={e => { e.preventDefault(); if (!working.current) onClose(); }}>
    <form className="family-edit-form" aria-busy={!!busy} onSubmit={e => { e.preventDefault(); void save(); }}>
      <header className="family-edit-header"><div><p className="admin-eyebrow">Personal invitations</p><h2 id="contact-import-title">Import contacts</h2></div><button type="button" className="admin-icon-button" disabled={!!busy} aria-label="Close contact import" onClick={onClose}><Icon d="M6 6l12 12M18 6L6 18" /></button></header>
      <div className="family-edit-scroll"><fieldset className="family-edit-body" disabled={!!busy}>
        <p id="contact-import-help" className="contact-import-intro">Choose guests from your phone, then review their names and numbers. Each contact creates one family invitation. Nothing is sent automatically.</p>
        <div className="contact-import-sources">
          {picker && <button autoFocus type="button" className="abtn solid" onClick={() => void run('pick', async () => {
            // Invoke inside the tap handler, before any await: the native picker needs user activation.
            const contacts = await picker.select(['name', 'tel'], { multiple: true });
            if (contacts.length) setRows(contactDrafts(contacts));
          })}><Icon size={18} d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6m-3-3h6" />{busy === 'pick' ? 'Opening contacts…' : rows.length ? 'Choose contacts again' : 'Choose phone contacts'}</button>}
          <button autoFocus={!picker} type="button" className={`abtn ${picker ? '' : 'solid'}`} onClick={() => fileInput.current?.click()}>{busy === 'read' ? 'Reading contacts…' : 'Import contact file (.vcf)'}</button>
          <input ref={fileInput} type="file" accept=".vcf,.vcard,text/vcard,text/x-vcard" hidden aria-label="Contact file" onChange={e => {
            const file = e.target.files?.[0]; e.target.value = '';
            if (file) void run('read', async () => {
              setRows([]);
              if (file.size > IMPORT_LIMITS.bytes) throw new Error('Choose a contact file smaller than 2 MB.');
              setRows(contactDrafts(readContactFile(await file.text())));
            });
          }} />
        </div>
        <p className="import-help">{picker ? 'Only the contacts you select are shared.' : 'This browser cannot open phone contacts directly. In your Contacts app, export or share selected contacts as a .vcf file, then choose it here.'} Up to 500 contacts. Numbers without a country code use +91 (India).</p>
        {!!rows.length && <>
          <div className="contact-review-heading"><h3>Review contacts</h3><p role="status">{ready.length} ready to import{duplicates ? ` · ${duplicates} duplicate${duplicates === 1 ? '' : 's'} will be skipped` : ''}</p></div>
          <p className="import-help">Edit family names before importing. Families are invited to all wedding events, with space for up to 6 people. You can add more family members using Edit afterwards.</p>
          <div className="contact-review-list">{review.map(({ row, issue, duplicate }, i) => <section key={row.id} className={`contact-review-card${!row.selected ? ' is-excluded' : ''}`} aria-label={`Contact ${i + 1}`}>
            <label className="contact-review-select"><input type="checkbox" checked={row.selected} onChange={e => update(row.id, { selected: e.target.checked })} /><b>{row.name || `Contact ${i + 1}`}</b>{row.selected && duplicate && <span className="pill off">Skip duplicate</span>}</label>
            {row.selected && <>
              <div className="field"><label htmlFor={`contact-name-${row.id}`}>Guest name</label><input id={`contact-name-${row.id}`} className="input" value={row.name} maxLength={200} onChange={e => update(row.id, { name: e.target.value })} /></div>
              <div className="field"><label htmlFor={`contact-family-${row.id}`}>Family name</label><input id={`contact-family-${row.id}`} className="input" value={row.family} maxLength={200} onChange={e => update(row.id, { family: e.target.value })} /></div>
              <div className="field"><label htmlFor={`contact-phone-${row.id}`}>WhatsApp number (optional)</label><input id={`contact-phone-${row.id}`} className="input" type="tel" list={`contact-numbers-${row.id}`} value={row.phone} placeholder="Include country code" onChange={e => update(row.id, { phone: e.target.value })} />{row.phones.length > 1 && <><datalist id={`contact-numbers-${row.id}`}>{row.phones.map(phone => <option key={phone} value={phone} />)}</datalist><span className="import-help">This contact has several numbers. Choose the one they use for WhatsApp.</span></>}</div>
              {duplicate ? <p className="import-help">This family name or phone number is already in your list or selected contacts.</p> : issue && <p className="error">{issue}</p>}
            </>}
          </section>)}</div>
        </>}
      </fieldset></div>
      {error && <p className="error contact-import-error" role="alert">{error}</p>}
      <footer className="family-edit-actions"><button type="button" className="abtn" disabled={!!busy} onClick={onClose}>Cancel</button><button className="abtn red" disabled={!!busy || !ready.length || hasIssues}>{busy === 'save' ? 'Importing…' : ready.length ? `Import ${ready.length} ${ready.length === 1 ? 'family' : 'families'}` : 'Import families'}</button></footer>
    </form>
  </dialog>;
}
