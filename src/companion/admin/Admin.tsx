import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { api } from '../lib/backend';
import { ago, inviteMessage, waLink } from '../lib/format';
import type { AdminData, AdminHousehold, EventInfo, Person, Photo } from '../lib/types';
import FamilyExcelImport from './FamilyExcelImport';
import FamilyContactImport from './FamilyContactImport';
import GeneralInvitationAdmin from './GeneralInvitationAdmin';
import AdminNavigation from './AdminNavigation';
import Analytics from './Analytics';
import HostTeam from './HostTeam';
import { Icon } from '../guest/Icon';
import { useVisibleViewport } from '../lib/useVisibleViewport';
import MomentTag from '../guest/MomentTag';
import { photoQuest, PHOTO_QUESTS } from '../lib/photoQuests';
import './admin.css';
import WeddingBrand, { WeddingTextile } from '../components/WeddingBrand';

export default function Admin() {
  const [events, setEvents] = useState<EventInfo[] | null>(null);
  const [data, setData] = useState<AdminData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    try { const ev = await api.hostEvents(); setEvents(ev); return ev.length; }
    catch (e) { setErr((e as Error).message); setEvents([]); return 0; }
  }, []);
  useEffect(() => { void loadEvents(); }, [loadEvents]);

  const ev = events?.[0];
  const reload = useCallback(() => { if (ev) api.adminData(ev.id).then(setData).catch(e => setErr(e.message)); }, [ev?.id]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { const h = () => reload(); window.addEventListener('as-wedding-db', h); return () => window.removeEventListener('as-wedding-db', h); }, [reload]);

  if (events === null) return <div className="platform" lang="en" style={{ padding: 24 }}>{err ?? 'Loading…'}</div>;
  if (!events.length) return <Login onIn={loadEvents} />;
  if (!data) return <div className="platform" lang="en" style={{ padding: 24 }}>{err ?? 'Loading the wedding…'}</div>;

  const flagged = data.photos.filter(p => p.hidden || (p.flags ?? 0) > 0).length;
  return (
    <div className="platform" lang="en">
      <div className="adm">
        <AdminNavigation event={data.event} flagged={flagged} />
        <main id="admin-content" tabIndex={-1}>
          {err && <p className="error" role="alert">{err}</p>}
          <Routes>
            <Route index element={<Overview d={data} />} />
            <Route path="families" element={<Families d={data} reload={reload} />} />
            <Route path="general" element={<GeneralInvitationAdmin d={data} />} />
            <Route path="photos" element={<Photos d={data} reload={reload} />} />
            <Route path="analytics" element={<Analytics eventId={data.event.id} />} />
            <Route path="hosts" element={<HostTeam eventId={data.event.id} />} />
            <Route path="updates" element={<Updates d={data} reload={reload} />} />
            <Route path="settings" element={<Settings d={data} reload={reload} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function Login({ onIn }: { onIn: () => Promise<number> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  return (
    <div className="platform" lang="en" style={{ display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="panel" style={{ width: 'min(420px, 100%)' }}>
        <WeddingBrand tagline="Host workspace" />
        <h1 className="h1" style={{ fontSize: 28 }}>Host sign in</h1>
        <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          onSubmit={e => { e.preventDefault(); void go(async () => {
            if (!email.includes('@')) throw new Error('Use your full email address (for example admin@yourdomain.com), not a username.');
            if (!(await api.hostSignIn(email.trim(), password))) throw new Error('Wrong email or password');
            if (!(await onIn())) throw new Error('This account is not a host of Anand and Susmita’s wedding. Please contact the hosts.');
          }); }}>
          <div className="field"><label htmlFor="em">Email</label><input id="em" className="input" type="text" inputMode="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="field"><label htmlFor="pw">Password</label><input id="pw" className="input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></div>
          {api.kind === 'local' && <p style={{ margin: 0, fontSize: 14, color: 'var(--p-muted)' }}>Demo: any email and password.</p>}
          <button type="submit" className="btn btn-primary" disabled={busy || !email.trim() || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <Link className="linkbtn" to="/admin/forgot-password" state={{ email }}>Forgot password?</Link>
        {err && <p className="error" role="alert">{err}</p>}
        <WeddingTextile />
      </div>
    </div>
  );
}

function Overview({ d }: { d: AdminData }) {
  const s = useMemo(() => {
    const hh = d.households;
    const people = hh.flatMap(h => h.people);
    const coming = people.filter(p => p.attending.length);
    const windows = new Map<string, Record<string, number>>();
    for (const h of hh) {
      const n = h.people.filter(p => p.attending.length).length;
      if (!n || !h.travel || h.travel.mode === 'near') continue;
      const w = h.travel.window ?? 'Unknown';
      const row = windows.get(w) ?? {}; row[h.travel.mode] = (row[h.travel.mode] ?? 0) + n; windows.set(w, row);
    }
    return {
      invited: hh.length, sent: hh.filter(h => h.inviteStatus !== 'not_sent').length, opened: hh.filter(h => h.inviteStatus === 'opened' || h.inviteStatus === 'responded').length,
      responded: hh.filter(h => h.inviteStatus === 'responded').length, coming: coming.length, kids: coming.filter(p => p.isChild).length,
      stay: hh.filter(h => h.stay && h.stay.nights.length).length, roomNights: hh.reduce((a, h) => a + (h.stay?.nights.length ?? 0), 0),
      cant: hh.filter(h => h.coming === 'no').length, pending: hh.filter(h => h.inviteStatus !== 'responded').length,
      arrived: people.filter(p => p.arrivedAt).length, near: hh.filter(h => h.travel?.mode === 'near').reduce((a, h) => a + h.people.filter(p => p.attending.length).length, 0),
      windows: [...windows.entries()], open: hh.filter(h => h.source === 'open').length
    };
  }, [d]);
  const max = Math.max(1, ...s.windows.map(([, r]) => Object.values(r).reduce((a, b) => a + b, 0)));
  const colours: Record<string, string> = { train: 'var(--deep)', bus: 'var(--primary)', car: '#7A927C', flight: '#D7A9B6' };
  return (<>
    <header><h1 className="h1">Overview</h1><span style={{ color: 'var(--p-muted)', fontSize: 14 }}>{Math.max(0, Math.ceil((new Date(d.event.startsAt).getTime() - Date.now()) / 86400000))} days to the muhurta</span></header>
    <section className="kpis" aria-label="Key numbers">
      <div className="kpi"><span className="l">Guests coming</span><span className="n">{s.coming}</span><span className="l">incl. {s.kids} children</span></div>
      <div className="kpi"><span className="l">Families answered</span><span className="n">{s.responded}<span style={{ fontSize: 22, color: 'var(--p-muted)' }}> / {s.invited}</span></span><span className="l">{s.cant} can't come · {s.open} joined via open link</span></div>
      <div className="kpi"><span className="l">Need a stay</span><span className="n">{s.stay}</span><span className="l">families · {s.roomNights} room-nights</span></div>
      <div className="kpi" style={{ background: 'var(--p-ink)', color: 'var(--p-ivory)' }}><span className="l" style={{ color: '#E8D9C3' }}>Still to answer</span><span className="n" style={{ color: 'var(--p-haldi)' }}>{s.pending}</span><NavLink to="/admin/families" style={{ color: 'var(--p-ivory)', fontWeight: 600, fontSize: 14 }}>Nudge them on WhatsApp →</NavLink></div>
    </section>
    <div className="cols">
      <section className="panel"><h2>Invite progress</h2>
        <div className="bars" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[['Invited', s.invited, 'var(--deep)'], ['Sent on WhatsApp', s.sent, '#7A927C'], ['Opened Banni', s.opened, 'var(--primary)'], ["RSVP'd", s.responded, '#D7A9B6']].map(([l, n, c]) => (
            <div key={l as string}><span>{l}</span><span className="bar"><span style={{ width: `${(Number(n) / Math.max(1, s.invited)) * 100}%`, background: c as string }} /></span><b>{n}</b></div>
          ))}
        </div>
      </section>
      <section className="panel"><h2>Arrivals by window</h2>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: 'var(--p-muted)' }}>{Object.entries(colours).map(([m, c]) => <span key={m} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ width: 12, height: 12, borderRadius: 3, background: c }} />{m}</span>)}</div>
        <div className="bars" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {s.windows.length === 0 && <span style={{ color: 'var(--p-muted)' }}>No travel plans yet.</span>}
          {s.windows.map(([w, r]) => { const tot = Object.values(r).reduce((a, b) => a + b, 0); return (
            <div key={w}><span>{w}</span><span className="bar" style={{ width: `${(tot / max) * 100}%` }}>{Object.entries(r).map(([m, n]) => <span key={m} title={`${m}: ${n}`} style={{ width: `${(n / tot) * 100}%`, background: colours[m] }} />)}</span><b>{tot}</b></div>
          ); })}
        </div>
        <span style={{ fontSize: 14, color: 'var(--p-muted)' }}>{s.near} coming from nearby.</span>
      </section>
    </div>
    <div className="cols">
      <section className="panel"><h2>On the day</h2>
        <div style={{ display: 'flex', gap: 24 }}><div><div className="kpi n" style={{ border: 0, padding: 0 }}>{s.arrived}<span style={{ fontSize: 18, color: 'var(--p-muted)' }}> / {s.coming}</span></div><span className="l" style={{ fontSize: 13, color: 'var(--p-muted)' }}>arrived</span></div>
          <div><div className="kpi n" style={{ border: 0, padding: 0 }}>{d.photos.length}</div><span style={{ fontSize: 13, color: 'var(--p-muted)' }}>photos</span></div></div>
      </section>
      <section className="panel"><h2>Asking to get in</h2>
        {d.requests.filter(r => r.status === 'pending').length === 0 && <span style={{ color: 'var(--p-muted)' }}>No requests.</span>}
        {d.requests.filter(r => r.status === 'pending').map(r => (
          <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1 }}><b>{r.name}</b> {r.note && `· ${r.note}`} <span style={{ color: 'var(--p-muted)' }}>· {ago(r.at)}</span></span>
            {r.phone && <a className="abtn" href={waLink(r.phone, `Namaskara ${r.name}! Here's the wedding PIN: ${d.pin}. Open: ${location.origin}/e/${d.event.slug}`)} target="_blank" rel="noreferrer">Send PIN on WhatsApp</a>}
          </div>
        ))}
      </section>
    </div>
  </>);
}

const statusPill = (h: AdminHousehold) => {
  if (h.coming === 'no') return <span className="pill no">Can't come</span>;
  if (h.inviteStatus === 'responded') return <span className="pill ok">Coming</span>;
  if (h.inviteStatus === 'opened') return <span className="pill wait">Opened · no reply</span>;
  if (h.inviteStatus === 'sent') return <span className="pill off">Sent</span>;
  return <span className="pill off">Not sent</span>;
};

function Families({ d, reload }: { d: AdminData; reload: () => void }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'not_sent' | 'waiting' | 'open'>('all');
  const [edit, setEdit] = useState<AdminHousehold | 'new' | null>(null);
  const [remove, setRemove] = useState<AdminHousehold | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [importContacts, setImportContacts] = useState(false);
  const couple = `${d.event.coupleA} & ${d.event.coupleB}`;
  const rows = d.households.filter(h =>
    (filter === 'all' || (filter === 'not_sent' && h.inviteStatus === 'not_sent') || (filter === 'waiting' && h.inviteStatus !== 'responded' && h.inviteStatus !== 'not_sent') || (filter === 'open' && h.source === 'open'))
    && (!q || h.name.toLowerCase().includes(q.toLowerCase()) || h.people.some(p => p.name.toLowerCase().includes(q.toLowerCase()) || (p.phone ?? '').includes(q))));
  const link = (h: AdminHousehold) => `${location.origin}/i/${h.token}`;
  const send = (h: AdminHousehold) => {
    const phone = h.people.find(p => p.phone)?.phone ?? '';
    const text = h.inviteStatus === 'not_sent' ? inviteMessage(h.name, couple, link(h), d.pin) : `Namaskara! Gentle reminder to RSVP for ${couple}'s wedding: ${link(h)}`;
    window.open(waLink(phone, text), '_blank');
    void api.setInviteStatus(h.id, 'sent').then(reload).catch(e => setActionError(e.message));
  };
  return (<>
    <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
      <div><h1 className="h1">Families &amp; invites</h1><span style={{ color: 'var(--p-muted)', fontSize: 14 }}>{d.households.length} families · personal invitations and replies</span></div>
      <div className="family-header-actions"><button className="abtn" onClick={() => setImportContacts(true)}><Icon size={18} d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6m-3-3h6" />Import contacts</button><button className="abtn red" onClick={() => setEdit('new')}>+ Add family</button></div>
    </header>
    <div className="family-toolbar">
      <label htmlFor="fq" className="sr-only">Search</label>
      <input id="fq" className="input" placeholder="Search by name or number" value={q} onChange={e => setQ(e.target.value)} />
      <div className="admin-filter-scroll">{([['all', 'All'], ['not_sent', 'Not sent'], ['waiting', 'Waiting for reply'], ['open', 'Joined via open link']] as const).map(([k, l]) =>
        <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</div>
    </div>
    <details className="admin-import-disclosure"><summary><Icon size={20} d="M12 3v12m-4-4l4 4 4-4M4 17v4h16v-4" /><span><b>Excel import</b><small>Download a sample or add several families at once</small></span><Icon size={16} d="M6 9l6 6 6-6" /></summary><FamilyExcelImport d={d} reload={reload} /></details>
    {notice && <p className="import-success" role="status">{notice}</p>}
    {actionError && <p className="error" role="alert">{actionError}</p>}
    <div className="tbl-wrap families-wrap">
      <table className="tbl families-table">
        <thead><tr><th scope="col">Family</th><th scope="col">Side · invited by</th><th scope="col">Status</th><th scope="col">Coming</th><th scope="col">Arrival</th><th scope="col">Stay</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {rows.map(h => {
            const coming = h.people.filter(p => p.attending.length);
            return (
              <tr key={h.id}>
                <td><b>{h.name}</b>{h.source === 'open' && <span className="pill wait" style={{ marginLeft: 6 }}>open link</span>}<br /><span style={{ color: 'var(--p-muted)' }}>{h.people.map(p => p.name).join(', ')}</span></td>
                <td data-label="Side · invited by">{[h.side, h.invitedBy].filter(Boolean).join(' · ') || '—'}</td>
                <td data-label="Status">{statusPill(h)}</td>
                <td data-label="Coming">{coming.length || '—'}{coming.some(p => p.addedBy === 'guest') && <span title="Includes people added by the family" style={{ color: 'var(--p-muted)' }}> +added</span>}</td>
                <td data-label="Arrival" className={!h.travel ? 'is-empty-detail' : undefined}>{h.travel ? (h.travel.mode === 'near' ? 'Nearby' : `${h.travel.mode} · ${h.travel.window ?? ''}`) : '—'}</td>
                <td data-label="Stay" className={!h.stay?.manage && !h.stay?.nights.length ? 'is-empty-detail' : undefined}>{h.stay?.manage ? 'Own' : h.stay?.nights.length ? h.stay.nights.join(', ') : '—'}</td>
                <td className="family-row-actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {h.inviteStatus !== 'responded' && <button className={`abtn ${h.inviteStatus === 'not_sent' ? 'red' : 'solid'}`} onClick={() => send(h)}>{h.inviteStatus === 'not_sent' ? 'Send on WhatsApp' : 'Nudge'}</button>}
                  <button className="abtn" onClick={async () => { setActionError(null); try { await navigator.clipboard.writeText(link(h)); setNotice(`Invitation link copied for ${h.name}.`); } catch { setActionError('Could not copy the invitation link. Please try again.'); } }}>Copy link</button>
                  <button className="abtn" onClick={() => setEdit(h)}>Edit</button>
                  <button className="abtn danger" aria-label={`Delete ${h.name}`} onClick={() => { setNotice(null); setActionError(null); setRemove(h); }}>Delete</button>
                </td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={7} className="admin-empty">No families match your search or filter.</td></tr>}
        </tbody>
      </table>
    </div>
    {edit && <EditFamily d={d} h={edit === 'new' ? null : edit} onClose={() => { setEdit(null); reload(); }} />}
    {importContacts && <FamilyContactImport d={d} onClose={() => setImportContacts(false)} onImported={message => { setImportContacts(false); setNotice(message); reload(); }} />}
    {remove && <DeleteFamily eventId={d.event.id} h={remove} onClose={() => setRemove(null)} onDeleted={() => { setNotice(`${remove.name} deleted.`); setRemove(null); reload(); }} />}
  </>);
}

function DeleteFamily({ eventId, h, onClose, onDeleted }: { eventId: string; h: AdminHousehold; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const deleted = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  useVisibleViewport(sheet);
  useEffect(() => {
    returnFocus.current ??= document.activeElement as HTMLElement | null;
    const dialog = sheet.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      (deleted.current ? document.getElementById('fq') : returnFocus.current)?.focus({ preventScroll: true });
    };
  }, []);
  const remove = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setErr(null);
    try {
      await api.deleteHousehold(eventId, h.id);
      deleted.current = true;
      onDeleted();
    } catch (e) { setErr((e as Error).message); setBusy(false); lock.current = false; }
  };
  return <dialog ref={sheet} className="family-dialog family-delete-dialog" role="alertdialog" aria-labelledby="delete-family-title" aria-describedby="delete-family-description" onCancel={e => { e.preventDefault(); if (!lock.current) onClose(); }}>
    <form className="family-edit-form" onSubmit={e => { e.preventDefault(); void remove(); }}>
      <header className="family-edit-header"><h2 id="delete-family-title">Delete family?</h2></header>
      <div className="family-edit-scroll"><div className="family-edit-body">
        <p id="delete-family-description">This will permanently delete <b>{h.name}</b>, all {h.people.length} family {h.people.length === 1 ? 'member' : 'members'}, and their RSVP, travel and stay details. Their personal invitation link will stop working. This cannot be undone.</p>
        <p>Photos and wishes already shared will be kept.</p>
        {err && <p className="error" role="alert">{err}</p>}
      </div></div>
      <footer className="family-edit-actions"><button autoFocus type="button" className="abtn" disabled={busy} onClick={onClose}>Cancel</button><button className="abtn red" disabled={busy}>{busy ? 'Deleting…' : 'Delete family'}</button></footer>
    </form>
  </dialog>;
}

function EditFamily({ d, h, onClose }: { d: AdminData; h: AdminHousehold | null; onClose: () => void }) {
  const [name, setName] = useState(h?.name ?? '');
  const [side, setSide] = useState(h?.side ?? '');
  const [invitedBy, setInvitedBy] = useState(h?.invitedBy ?? '');
  const [cap, setCap] = useState(h?.cap ?? 6);
  const [fns, setFns] = useState<string[]>(h?.functionIds ?? d.functions.map(f => f.id));
  const [people, setPeople] = useState<Partial<Person>[]>(h?.people.length ? h.people : [{ name: '', phone: '' }]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sheet = useRef<HTMLDialogElement>(null);
  useVisibleViewport(sheet);
  const lock = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    returnFocus.current ??= document.activeElement as HTMLElement | null;
    const dialog = sheet.current;
    dialog?.showModal();
    return () => { dialog?.close(); returnFocus.current?.focus({ preventScroll: true }); };
  }, []);
  const upd = (i: number, patch: Partial<Person>) => setPeople(ps => ps.map((p, j) => j === i ? { ...p, ...patch } : p));
  const save = async () => {
    if (lock.current) return;
    lock.current = true; setSaving(true); setErr(null);
    try {
      const clean = people.filter(p => p.name?.trim()).map(p => ({ ...p, name: p.name!.trim(), phone: p.phone?.replace(/[^\d+]/g, '') || null }));
      if (!Number.isInteger(cap) || cap < 1 || cap > 20 || cap < clean.length) throw new Error('Max people must be 1–20 and cover everyone listed.');
      await api.saveHousehold(d.event.id, { id: h?.id, name: name.trim(), side: side || null, invitedBy: invitedBy.trim() || null, cap, functionIds: fns }, clean);
      onClose();
    } catch (e) { setErr((e as Error).message); setSaving(false); lock.current = false; }
  };
  return <dialog ref={sheet} className="family-dialog" aria-label={h ? `Edit ${h.name}` : 'Add a family'} onCancel={e => { e.preventDefault(); if (!saving) onClose(); }}>
    <form className="family-edit-form" onSubmit={e => { e.preventDefault(); void save(); }}>
      <header className="family-edit-header"><div><p className="admin-eyebrow">Personal invitation</p><h2>{h ? 'Edit family' : 'Add a family'}</h2></div><button type="button" className="admin-icon-button" disabled={saving} aria-label="Close family editor" onClick={onClose}><Icon d="M6 6l12 12M18 6L6 18" /></button></header>
      <div className="family-edit-scroll"><fieldset className="family-edit-body" disabled={saving}>
        <div className="field"><label htmlFor="fn">Family name</label><input autoFocus required id="fn" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Kulkarni family" /></div>
        <div className="family-meta-fields">
          <div className="field"><label htmlFor="sd">Side</label><select id="sd" className="input" value={side} onChange={e => setSide(e.target.value)}><option value="">Choose a side</option><option>Bride</option><option>Groom</option><option>Both</option></select></div>
          <div className="field"><label htmlFor="ib">Invited by</label><input id="ib" className="input" value={invitedBy} onChange={e => setInvitedBy(e.target.value)} /></div>
          <div className="field"><label htmlFor="cp">Max people</label><input id="cp" className="input" type="number" inputMode="numeric" min={1} max={20} value={cap} onChange={e => setCap(Number(e.target.value))} /></div>
        </div>
        {d.functions.length > 1 && <div><b>Invited to</b><div className="import-actions">{d.functions.map(f => <button type="button" key={f.id} className="chip" aria-pressed={fns.includes(f.id)} onClick={() => setFns(s => s.includes(f.id) ? s.filter(x => x !== f.id) : [...s, f.id])}>{f.nameEn}</button>)}</div></div>}
        <div className="family-people-heading"><b>People</b><span className="import-help">Names and WhatsApp numbers</span></div>
        {people.map((p, i) => <div key={p.id ?? i} className="family-person-fields"><div className="field"><label htmlFor={`person-${i}`}>Person {i + 1} name</label><input id={`person-${i}`} className="input" placeholder="Full name" value={p.name ?? ''} onChange={e => upd(i, { name: e.target.value })} /></div><div className="field"><label htmlFor={`phone-${i}`}>Person {i + 1} WhatsApp number</label><input id={`phone-${i}`} className="input" placeholder="Optional · include country code" inputMode="tel" value={p.phone ?? ''} onChange={e => upd(i, { phone: e.target.value })} /></div><label className="family-child-field"><input type="checkbox" checked={!!p.isChild} onChange={e => upd(i, { isChild: e.target.checked })} />Child</label></div>)}
        <button type="button" className="abtn" disabled={people.length >= 20} onClick={() => setPeople(ps => [...ps, { name: '', phone: '' }])}>+ Add person</button>
        {err && <p className="error" role="alert">{err}</p>}
      </fieldset></div>
      <footer className="family-edit-actions"><button type="button" className="abtn" disabled={saving} onClick={onClose}>Cancel</button><button className="abtn red" disabled={!name.trim() || saving}>{saving ? 'Saving…' : 'Save family'}</button></footer>
    </form>
  </dialog>;
}

function Photos({ d, reload }: { d: AdminData; reload: () => void }) {
  const [show, setShow] = useState<'flagged' | 'all'>('flagged');
  const [questId, setQuestId] = useState('');
  const [collection, setCollection] = useState<Photo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setError(null); setCollection(null);
    if (!questId) { setLoading(false); return; }
    setLoading(true);
    api.listPhotos(d.event.id, { questId, includeHidden: true }).then(items => { if (alive) setCollection(items); }).catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [questId, d.event.id, d.photos]);
  const photos = questId ? collection ?? [] : d.photos;
  const list = show === 'flagged' ? photos.filter(p => p.hidden || (p.flags ?? 0) > 0) : photos;
  const act = async (fn: () => Promise<void>) => { try { await fn(); setError(null); reload(); } catch (e) { setError((e as Error).message); } };
  return (<>
    <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
      <div><h1 className="h1">Photos &amp; flags</h1><span style={{ color: 'var(--p-muted)', fontSize: 14 }}>{d.photos.length} photos · hidden photos are invisible to guests</span></div>
      <div style={{ display: 'flex', gap: 8 }}><button className="chip" aria-pressed={show === 'flagged'} onClick={() => setShow('flagged')}>Needs a look</button><button className="chip" aria-pressed={show === 'all'} onClick={() => setShow('all')}>All</button></div>
    </header>
    <div className="field admin-quest-filter"><label htmlFor="admin-photo-collection">Photo quest collection</label><select id="admin-photo-collection" className="input" value={questId} onChange={e => { setQuestId(e.target.value); setShow('all'); }}><option value="">All photos</option>{PHOTO_QUESTS.map(q => <option key={q.id} value={q.id}>{q.tag}</option>)}</select>{photoQuest(questId) && <p className="import-help">{photoQuest(questId)!.prompt}</p>}</div>
    {error && <p className="error" role="alert">{error}</p>}
    {loading && <p role="status">Loading the collection…</p>}
    {!loading && !error && list.length === 0 && <div className="panel">{questId ? 'No photos in this collection yet.' : 'Nothing to review.'}</div>}
    <div className="photo-grid">
      {list.map(p => (
        <article key={p.id} className="panel" style={{ padding: 0, overflow: 'hidden', borderColor: p.hidden ? 'var(--p-kumkuma)' : undefined, borderWidth: p.hidden ? 2 : 1 }}>
          <div style={{ position: 'relative' }}>
            <img src={p.url} alt={p.caption ?? `Photo by ${p.uploaderName}`} style={{ width: '100%', height: 180, objectFit: 'cover' }} />
            {(p.hidden || (p.flags ?? 0) > 0) && <span className="pill no" style={{ position: 'absolute', left: 10, top: 10 }}>{p.hidden ? 'Hidden' : ''}{p.flags ? ` · flagged ${p.flags}×` : ''}</span>}
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div><b>{p.uploaderName}</b><div className="admin-photo-metadata">{p.moment && <MomentTag label={p.moment} />}{photoQuest(p.questId) && <MomentTag label={photoQuest(p.questId)!.tag} />}{p.pinned && <span className="post-pinned">Pinned</span>}<time className="post-timestamp" dateTime={p.createdAt}>{ago(p.createdAt)}</time></div></div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {p.hidden && <button className="abtn" onClick={() => act(() => api.setPhoto(p.id, { hidden: false }))}>Keep</button>}
              {!p.hidden && <button className="abtn" onClick={() => act(() => api.setPhoto(p.id, { hidden: true }))}>Hide</button>}
              <button className="abtn" onClick={() => act(() => api.setPhoto(p.id, { pinned: !p.pinned }))}>{p.pinned ? 'Unpin' : 'Pin'}</button>
              <button className="abtn solid" onClick={() => { if (confirm('Remove this photo for everyone?')) void act(() => api.deletePhoto(p.id)); }}>Remove</button>
            </div>
          </div>
        </article>
      ))}
    </div>
  </>);
}

const TEMPLATES = ['The muhurta begins in 10 minutes — please come to the mandap.', 'Oota is served in the dining hall.', 'Pickup vans are leaving the station now — look for the pink flag.', 'Breakfast is ready in the hall.'];

function Updates({ d, reload }: { d: AdminData; reload: () => void }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const lock = useRef(false);
  const post = async () => {
    if (lock.current || !body.trim()) return;
    lock.current = true; setBusy(true); setError(null); setNotice(null);
    try { await api.postAnnouncement(d.event.id, body.trim()); setBody(''); setNotice('Update sent to your guests.'); reload(); }
    catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <>
    <header><h1 className="h1">Gamanisi! updates</h1><p className="admin-description">Keep your guests in the loop, wherever they are.</p></header>
    <form className="panel" onSubmit={e => { e.preventDefault(); void post(); }}><h2>Message to guests</h2><div className="field"><label htmlFor="ub">Update</label><textarea ref={composer} id="ub" className="input" rows={4} disabled={busy} value={body} onChange={e => setBody(e.target.value)} placeholder="e.g. Mehendi starts in the garden at 4 PM" /></div><p className="import-help">This message will appear in the guest app and general invitation when host updates are visible.</p><button className="abtn red" disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Send to everyone'}</button>{error && <p className="error" role="alert">{error}</p>}{notice && <p className="import-success" role="status">{notice}</p>}</form>
    <details className="panel admin-templates"><summary>Start with a template</summary><p className="import-help">Choose a message, adjust the details, then send.</p><div className="admin-template-list">{TEMPLATES.map(t => <button key={t} className="abtn" disabled={busy} onClick={() => { setBody(t); composer.current?.focus(); }}>{t}<Icon size={16} d="M5 12h14m-6-6l6 6-6 6" /></button>)}</div></details>
    <section className="panel"><h2>Sent updates</h2>{!d.announcements.length && <p className="import-help">Your messages will appear here after sending.</p>}{d.announcements.map(a => <article className="admin-sent-update" key={a.id}><p>{a.body}</p><time dateTime={a.at}>{ago(a.at)}</time></article>)}</section>
  </>;
}

function Settings({ d, reload }: { d: AdminData; reload: () => void }) {
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const generalLink = `${location.origin}/invitation`;
  return (<>
    <h1 className="h1">PIN &amp; links</h1>
    <section className="panel"><h2>General invitation</h2>
      <p style={{ margin: 0 }}>Photos, wishes, and host updates for Anand and Susmita's wedding. This page is linked from the public wedding invitation; visitors can view visible wedding photos. Family RSVP and travel details stay separate.</p>
      <code style={{ fontSize: 15, overflowWrap: 'anywhere' }}>{generalLink}</code>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="abtn" onClick={async () => {
          try { await navigator.clipboard.writeText(generalLink); setCopyMessage('General invitation link copied.'); }
          catch { setCopyMessage('Could not copy automatically. Select and copy the link above.'); }
        }}>Copy general invitation link</button>
        <a className="abtn" href={generalLink} target="_blank" rel="noreferrer">Open invitation</a>
        <NavLink className="abtn" to="/admin/general">Customize invitation &amp; review wishes</NavLink>
      </div>
      {copyMessage && <p role="status" style={{ margin: 0 }}>{copyMessage}</p>}
    </section>
    <section className="panel"><h2>Wedding PIN</h2>
      <p style={{ margin: 0 }}>Current PIN: <b style={{ fontSize: 20, letterSpacing: '.2em' }}>{d.pin}</b>. Guests need it only on a new phone or via the open link. Changing it keeps signed-in phones signed in.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label htmlFor="np" className="sr-only">New PIN</label>
        <input id="np" className="input" style={{ maxWidth: 200 }} inputMode="numeric" maxLength={6} placeholder="New 6-digit PIN" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} />
        <button className="abtn red" disabled={pin.length !== 6} onClick={async () => { try { await api.setPin(d.event.id, pin); setMsg('PIN changed.'); setPin(''); reload(); } catch (e) { setMsg((e as Error).message); } }}>Change PIN</button>
      </div>
      {msg && <p role="status" style={{ margin: 0 }}>{msg}</p>}
    </section>
    <section className="panel"><h2>Open link</h2>
      <p style={{ margin: 0 }}>For guests not on your list. They enter the PIN, we match them to your list, or they join as a new family.</p>
      <code style={{ fontSize: 15 }}>{location.origin}/rsvp</code>
      <button className="abtn" style={{ alignSelf: 'flex-start' }} onClick={() => navigator.clipboard?.writeText(`${location.origin}/rsvp`)}>Copy open link</button>
    </section>
  </>);
}
