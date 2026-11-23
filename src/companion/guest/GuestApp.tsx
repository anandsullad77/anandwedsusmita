import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getSession } from '../lib/backend';
import { applyTheme } from '../lib/theme';
import type { GeneralInvitationSettings, InviteBundle } from '../lib/types';
import type { Ctx } from './context';
import InvitationExperience from './InvitationExperience';
import FamilyPlan from './FamilyPlan';
import Family from './Family';
import { WEDDING_SLUG } from '../lib/wedding';
import WeddingBrand from '../components/WeddingBrand';

export default function GuestApp() {
  const saved = getSession();
  const s = saved?.slug === WEDDING_SLUG ? saved : null;
  const [data, setData] = useState<{ bundle: InviteBundle; settings: GeneralInvitationSettings } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const generation = useRef(0);
  const token = s?.householdToken;
  const reload = useCallback(async () => {
    if (!token) return;
    const request = ++generation.current;
    try {
      const bundle = await api.inviteBundle(token);
      if (!bundle) throw new Error('Invitation not found. Ask the hosts to send your family link again.');
      const settings = await api.generalSettings(bundle.event.id);
      if (request !== generation.current) return;
      applyTheme(bundle.event);
      setData({ bundle, settings });
      setErr(null);
    } catch (e) {
      if (request === generation.current) setErr(e instanceof Error ? e.message : 'Could not open your invitation.');
    }
  }, [token]);

  useEffect(() => {
    setData(null);
    void reload();
    const refresh = () => { void reload(); };
    window.addEventListener('as-wedding-db', refresh);
    return () => {
      ++generation.current;
      window.removeEventListener('as-wedding-db', refresh);
    };
  }, [reload]);

  if (!s) return <div className="phone guest-welcome" lang="en"><WeddingBrand /><h1 className="serif">Welcome to Anand and Susmita's wedding</h1><p>Open your family's invitation link, or use the wedding PIN to find your family.</p><a className="btn btn-deep" href="/rsvp">Find my family</a><p><a href="/invitation">Photos &amp; wishes</a> · <a href="/">Wedding invitation</a></p></div>;
  if (!data) return <div className="phone guest-welcome" lang="en"><WeddingBrand />{err ? <p className="error" role="alert">{err}</p> : <p role="status">Opening your wedding companion…</p>}</div>;

  const { bundle: b, settings } = data;
  const ctx: Ctx = { s, b, me: b.people.find(p => p.id === s.personId), reload };
  return <InvitationExperience
    key={s.householdToken}
    bundle={{ event: b.event, functions: b.functions, guestName: ctx.me?.name ?? null, settings }}
    base="/app"
    token={s.householdToken}
    invitationPath={`/i/${encodeURIComponent(s.householdToken)}`}
    photoContext={ctx}
    personalSection={<FamilyPlan ctx={ctx} />}
    familyPage={<Family ctx={ctx} />}
  />;
}
