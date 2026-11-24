import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/backend';
import type { HostTeam as Team, HostTeamAction, HostTeamResult } from '../lib/types';

const roles: Record<string, string> = { owner: 'Co-owner', cohost: 'Host', planner: 'Planner', photographer: 'Photographer' };

export default function HostTeam({ eventId }: { eventId: string }) {
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<HostTeamResult | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'cohost' | 'owner'>('cohost');
  const [working, setWorking] = useState<string | null>(null);
  const lock = useRef(false);
  const request = useRef(0);
  const load = useCallback(async () => {
    const current = ++request.current; setLoading(true); setError('');
    try { const data = await api.hostTeam(eventId); if (current === request.current) setTeam(data); }
    catch (err) { if (current === request.current) { setTeam(null); setError((err as Error).message); } }
    finally { if (current === request.current) setLoading(false); }
  }, [eventId]);
  useEffect(() => { void load(); return () => { request.current++; }; }, [load]);

  const act = async (action: HostTeamAction) => {
    if (lock.current) return;
    lock.current = true; setWorking(action.action === 'invite' ? 'invite' : action.userId); setError(''); setResult(null);
    try {
      const response = await api.manageHostTeam(eventId, action); setResult(response);
      if (response.accessAdded && action.action === 'invite') { setName(''); setEmail(''); setRole('cohost'); }
      // A membership can succeed even if SMTP fails; always show its actual state.
      await load();
    } catch (err) { setError((err as Error).message); }
    finally { lock.current = false; setWorking(null); }
  };
  return <>
    <header className="analytics-header"><div><h1 className="h1">Hosts &amp; co-owners</h1><p className="admin-description">Share the wedding workspace and help your team sign in.</p></div><button className="abtn" disabled={loading || !!working} onClick={() => void load()}>{loading ? 'Refreshing…' : 'Refresh hosts'}</button></header>
    {api.kind === 'local' && <p className="analytics-note">Demo: team changes stay in this browser, and no emails are sent. Any email/password can sign in to the demo.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {result && <p className={result.emailSent || api.kind === 'local' ? 'import-success' : 'host-team-warning'} role="status">{result.message}</p>}
    {loading && !team && <p role="status">Loading hosts…</p>}
    {team?.canManage && <section className="panel" aria-labelledby="add-host-title"><div><h2 id="add-host-title">Add a host or co-owner</h2><p className="admin-description">They’ll receive a one-time email link to set up their password. You don’t need to choose or share a password for them.</p></div>
      <form className="host-team-form" onSubmit={e => { e.preventDefault(); void act({ action: 'invite', name: name.trim(), email: email.trim(), role }); }}>
        <fieldset className="host-team-fields" disabled={!!working || loading}>
          <div className="field"><label htmlFor="host-name">Host name</label><input id="host-name" className="input" autoComplete="off" required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="field"><label htmlFor="host-email">Host email</label><input id="host-email" className="input" type="email" autoComplete="off" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></div>
          <div className="field"><label htmlFor="host-role">Access level</label><select id="host-role" className="input" value={role} onChange={e => setRole(e.target.value as typeof role)}><option value="cohost">Host</option><option value="owner">Co-owner</option></select></div>
        </fieldset>
        <p className="analytics-note">{role === 'owner' ? 'Co-owners have full admin access and can add hosts and other co-owners.' : 'Hosts can manage guests, invitations, posts and wedding settings. Only owners and co-owners can add people to the host team or send them password links.'}</p>
        <button className="abtn red" disabled={!!working || loading || !name.trim() || !email.trim()}>{working === 'invite' ? 'Adding host…' : 'Add host & send password link'}</button>
      </form>
    </section>}
    {team && <section className="panel" aria-labelledby="host-team-title"><div className="analytics-header"><h2 id="host-team-title">Your host team</h2><span className="analytics-note">{team.members.length} team members</span></div>
      {!team.canManage && <p className="analytics-note">Ask an owner or co-owner to add team members or send someone a password link.</p>}
      <div className="host-team-list">{team.members.map(member => <article className="host-team-member" key={member.id}><div className="host-team-identity"><h3>{member.name}{member.id === team.currentUserId && <span className="pill off">You</span>}</h3>{member.email ? <a href={`mailto:${member.email}`}>{member.email}</a> : <p className="analytics-note">Email unavailable</p>}<div className="import-actions"><span className={`pill ${member.role === 'owner' ? 'ok' : 'off'}`}>{roles[member.role]}</span><span className={`pill ${member.confirmed ? 'ok' : 'wait'}`}>{member.confirmed ? 'Email verified' : 'Awaiting email verification'}</span></div></div>
        {team.canManage && <button className="abtn" disabled={!!working || loading || !member.email} onClick={() => void act({ action: 'reset', userId: member.id })}>{working === member.id ? 'Sending link…' : 'Send password link'}</button>}
      </article>)}</div>
    </section>}
    <section className="panel"><h2>Forgotten your password?</h2><p>Every host can request their own reset email from the sign-in page. Password links are one-time links; an expired or already-used link needs a new request.</p><Link className="abtn" to="/admin/forgot-password">Request my password reset</Link></section>
  </>;
}
