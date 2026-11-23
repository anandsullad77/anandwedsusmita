import { useRef, useState } from 'react';
import { api } from '../lib/backend';
import { familyKey } from '../lib/familyImport';
import type { AdminData } from '../lib/types';
import type { WorkbookPreview } from './familyWorkbook';

export default function FamilyExcelImport({ d, reload }: { d: AdminData; reload: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const working = useRef(false);
  const [busy, setBusy] = useState<'download' | 'read' | 'create' | null>(null);
  const [preview, setPreview] = useState<WorkbookPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const existing = new Set(d.households.map(h => familyKey(h.name)));
  const fresh = preview?.families.filter(h => !existing.has(familyKey(h.name))) ?? [];
  const skipped = (preview?.families.length ?? 0) - fresh.length;

  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(kind); setError(null); setMessage(null);
    try { await action(); }
    catch (e) { setError((e as Error).message || 'Could not complete the import. Please try again.'); }
    finally { working.current = false; setBusy(null); }
  };
  const read = (file: File) => run('read', async () => {
    setPreview(null);
    const { readFamilyWorkbook } = await import('./familyWorkbook');
    setPreview(await readFamilyWorkbook(file, d.functions));
  });
  const create = () => run('create', async () => {
    if (!preview || preview.errors.length || !fresh.length) return;
    // Send the full sheet: the backend rechecks existing names under a transaction lock.
    const result = await api.importHouseholds(d.event.id, preview.families);
    setMessage(`Created ${result.created} ${result.created === 1 ? 'family' : 'families'} and personal invite ${result.created === 1 ? 'link' : 'links'}.${result.skipped ? ` Skipped ${result.skipped} existing ${result.skipped === 1 ? 'family' : 'families'}.` : ''} Use Send on WhatsApp in the family list to share the invitations.`);
    setPreview(null);
    reload();
  });

  return (
    <section className="panel family-import" aria-labelledby="excel-title" aria-busy={busy !== null}>
      <div className="import-heading">
        <div>
          <h2 id="excel-title">Import families from Excel</h2>
          <p>Download the sample, replace the examples with your guests, then upload it. Use one row per person and repeat the family name to create one shared invite.</p>
        </div>
        <div className="import-actions">
          <button className="abtn" disabled={!!busy} onClick={() => void run('download', async () => {
            const { downloadFamilyTemplate } = await import('./familyWorkbook');
            await downloadFamilyTemplate(d.functions);
          })}>{busy === 'download' ? 'Preparing sample…' : 'Download sample Excel'}</button>
          <button className="abtn solid" disabled={!!busy} onClick={() => fileInput.current?.click()}>{busy === 'read' ? 'Reading Excel…' : 'Upload Excel'}</button>
          <input ref={fileInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Excel workbook" hidden disabled={!!busy} onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void read(file);
          }} />
        </div>
      </div>
      <p className="import-help">Excel .xlsx · Up to 500 families / 2,000 people · Max 2 MB. The sample includes instructions and this wedding’s function names. Existing family names are skipped.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="import-success" role="status">{message}</p>}
      {busy === 'create' && <p role="status">Creating families and invite links. Please keep this page open…</p>}
      {preview && <div className="import-preview">
        <h3>Review {preview.filename}</h3>
        {preview.errors.length > 0 ? <div role="alert" className="import-errors">
          <b>Fix {preview.errors.length} {preview.errors.length === 1 ? 'issue' : 'issues'} in Excel, then upload again. No families have been created.</b>
          <ul>{preview.errors.slice(0, 20).map((issue, i) => <li key={i}>{issue}</li>)}</ul>
          {preview.errors.length > 20 && <p>Showing the first 20 issues.</p>}
        </div> : <>
          <p role="status"><b>{fresh.length} new {fresh.length === 1 ? 'family' : 'families'}</b> with {fresh.reduce((n, h) => n + h.people.length, 0)} people, ready to create.{skipped > 0 && ` ${skipped} existing ${skipped === 1 ? 'family will' : 'families will'} be skipped.`}</p>
          <div className="tbl-wrap">
            <table className="tbl import-table">
              <caption className="sr-only">Families found in the uploaded Excel workbook</caption>
              <thead><tr><th scope="col">Family</th><th scope="col">People</th><th scope="col">Side · invited by</th><th scope="col">Invited to</th><th scope="col">Action</th></tr></thead>
              <tbody>{preview.families.slice(0, 10).map(h => <tr key={familyKey(h.name)}>
                <td><b>{h.name}</b><br /><span className="import-help">Max {h.cap} people</span></td>
                <td data-label="People">{h.people.map(p => `${p.name}${p.isChild ? ' (child)' : ''}${p.phone ? ` · ${p.phone}` : ''}`).join(', ')}</td>
                <td data-label="Side · invited by">{[h.side, h.invitedBy].filter(Boolean).join(' · ') || '—'}</td>
                <td data-label="Invited to">{h.functionIds.map(id => d.functions.find(f => f.id === id)?.nameEn).join(', ') || '—'}</td>
                <td data-label="Action"><span className={`pill ${existing.has(familyKey(h.name)) ? 'off' : 'ok'}`}>{existing.has(familyKey(h.name)) ? 'Skip existing' : 'Create invite'}</span></td>
              </tr>)}</tbody>
            </table>
          </div>
          {preview.families.length > 10 && <p className="import-help">Showing 10 of {preview.families.length} families. All new families in the sheet will be created.</p>}
          <p className="import-help">New invites start as Not sent. Share them using Send on WhatsApp after importing.</p>
        </>}
        <div className="import-actions">
          <button className="abtn red" disabled={!!busy || !!preview.errors.length || !fresh.length} onClick={() => void create()}>{busy === 'create' ? 'Creating…' : 'Create families & invites'}</button>
          <button className="abtn" disabled={!!busy} onClick={() => { setPreview(null); setError(null); }}>Cancel import</button>
        </div>
      </div>}
    </section>
  );
}
