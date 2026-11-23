import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/backend';
import { applyTheme } from '../lib/theme';
import type { GeneralInviteBundle, PhotoContext } from '../lib/types';
import InvitationExperience from './InvitationExperience';
import { WeddingMark } from '../components/WeddingBrand';

export default function GeneralInvite() {
  const { token: routeToken = '' } = useParams();
  const [token, setToken] = useState(routeToken);
  const [bundle, setBundle] = useState<GeneralInviteBundle | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = routeToken ? `/g/${encodeURIComponent(routeToken)}` : '/invitation';

  useEffect(() => {
    let alive = true;
    setBundle(null); setMissing(false); setError(null);
    const opening = routeToken
      ? api.generalInvite(routeToken).then(bundle => bundle ? { token: routeToken, bundle } : null)
      : api.weddingInvite();
    opening.then(result => {
      if (!alive) return;
      if (!result) { setMissing(true); return; }
      const { bundle: b, token: resolvedToken } = result;
      setToken(resolvedToken);
      applyTheme(b.event);
      setBundle({ ...b, guestName: localStorage.getItem(`as-wedding-general-name:${resolvedToken}`) || b.guestName });
    }).catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Could not open the invitation.'); });
    return () => { alive = false; };
  }, [routeToken]);

  if (!bundle) return (
    <div className="phone general-loading" lang="en">
      <a href="/" aria-label="Anand and Susmita — wedding invitation"><WeddingMark /></a>
      {missing ? <><h1 className="serif">Invitation not found</h1><p>Ask the hosts to send you the invitation link again.</p></>
        : error ? <p className="error" role="alert">{error}</p> : <p role="status">Opening your invitation…</p>}
    </div>
  );

  const ctx: PhotoContext = {
    b: bundle,
    me: bundle.guestName ? { id: null, name: bundle.guestName } : undefined,
    generalToken: token,
    prepareUpload: async name => {
      if (!name.trim() || name.trim().length > 80) throw new Error('Enter a name between 1 and 80 characters');
      localStorage.setItem(`as-wedding-general-name:${token}`, name.trim());
      setBundle(b => b ? { ...b, guestName: name.trim() } : b);
    },
  };
  return <InvitationExperience bundle={bundle} base={base} token={token} photoContext={ctx} />;
}
