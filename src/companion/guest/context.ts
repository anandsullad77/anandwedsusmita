import type { InviteBundle, Session } from '../lib/types';

export type Ctx = { s: Session; b: InviteBundle; me: InviteBundle['people'][number] | undefined; reload: () => void };
