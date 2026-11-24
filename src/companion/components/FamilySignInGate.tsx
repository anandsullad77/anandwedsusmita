import type { ReactNode } from 'react';
import { GuestContentGate } from './GoogleSignIn';
import { api } from '../lib/backend';

export default function FamilySignInGate({ children }: { children: ReactNode }) {
  // The offline demo has no Google provider. Live family entry always uses
  // the same Google gate and OAuth return handling as the photo feed.
  if (api.kind === 'local') return <>{children}</>;
  return <GuestContentGate base="/invitation" purpose="open your family invitation and RSVP" standalone>{children}</GuestContentGate>;
}
