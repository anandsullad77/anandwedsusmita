// Offline-first upload queue: photos wait in IndexedDB and post themselves when the signal returns.
import { get, set } from 'idb-keyval';
import { api } from './backend';
import { requireGuestSignIn } from './guestAuth';

export type QueuedPhoto = { id: string; eventId: string; blob: Blob; moment?: string; questId?: string; caption?: string; uploaderName: string; personId: string | null; generalToken?: string; authUserId?: string; tries: number };

const KEY = 'as-wedding-upload-queue';
let running = false;
const listeners = new Set<(n: number) => void>();

async function read(): Promise<QueuedPhoto[]> { return (await get<QueuedPhoto[]>(KEY)) ?? []; }
async function write(q: QueuedPhoto[]) { await set(KEY, q); listeners.forEach(l => l(q.length)); }

export async function enqueue(items: Omit<QueuedPhoto, 'id' | 'tries'>[]) {
  const q = await read();
  for (const it of items) q.push({ ...it, id: crypto.randomUUID(), tries: 0 });
  await write(q);
  void flush();
}

export async function pendingCount(eventId?: string) { return (await read()).filter(p => !eventId || p.eventId === eventId).length; }
export function onQueueChange(fn: (n: number) => void) { listeners.add(fn); return () => listeners.delete(fn); }

export async function flush() {
  if (running || !navigator.onLine) return;
  running = true;
  try {
    let q = await read();
    while (q.length && navigator.onLine) {
      const item = q[0];
      try {
        const account = await requireGuestSignIn();
        if (item.authUserId && item.authUserId !== account.id) throw new Error('Sign in to the account that queued this photo.');
        if (item.generalToken) {
          const invite = await api.generalInvite(item.generalToken, item.uploaderName);
          if (!invite || invite.event.id !== item.eventId) throw new Error('Invitation no longer available');
        }
        await api.uploadPhoto(item.eventId, item.blob, { moment: item.moment, questId: item.questId, caption: item.caption, uploaderName: item.uploaderName, personId: item.personId });
        q = q.slice(1);
      } catch {
        item.tries += 1;
        q = [...q.slice(1), item];       // try the next one; this one goes to the back
        await write(q);
        if (q.every(x => x.tries > 0)) break;   // everything failed once — wait for the next 'online' / timer
        continue;
      }
      await write(q);
    }
  } finally { running = false; }
}

window.addEventListener('online', () => void flush());
setInterval(() => void flush(), 30_000);
