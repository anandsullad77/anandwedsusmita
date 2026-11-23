// Offline-first upload queue: photos wait in IndexedDB and post themselves when the signal returns.
import { get, set } from 'idb-keyval';
import { api } from './backend';
import { requireGuestSignIn } from './guestAuth';
import type { PhotoMeta, PostImage } from './types';

export type QueuedPhoto = { id: string; eventId: string; blob: Blob; moment?: string; questId?: string; caption?: string; uploaderName: string; personId: string | null; generalToken?: string; authUserId?: string; tries: number };
type QueuedPost = Omit<QueuedPhoto, 'blob'> & { images: PostImage[] };
type QueueItem = QueuedPhoto | QueuedPost;

const KEY = 'as-wedding-upload-queue';
let running = false;
const listeners = new Set<(n: number) => void>();

async function read(): Promise<QueueItem[]> { return (await get<QueueItem[]>(KEY)) ?? []; }
const count = (q: QueueItem[]) => q.reduce((n, item) => n + ('images' in item ? item.images.length : 1), 0);
// Serialize read/modify/write so posting while a flush runs cannot lose photos.
let changes: Promise<unknown> = Promise.resolve();
function change(update: (q: QueueItem[]) => QueueItem[]) {
  const operation = changes.then(async () => {
    const q = update(await read());
    await set(KEY, q); listeners.forEach(l => l(count(q)));
  });
  changes = operation.catch(() => {});
  return operation;
}

export async function enqueue(items: Omit<QueuedPhoto, 'id' | 'tries'>[]) {
  await change(q => [...q, ...items.map(it => ({ ...it, id: crypto.randomUUID(), tries: 0 }))]);
  void flush();
}

export async function enqueuePost(eventId: string, blobs: Blob[], meta: PhotoMeta & { generalToken?: string; authUserId: string }) {
  const item: QueuedPost = { ...meta, eventId, id: crypto.randomUUID(), tries: 0, images: blobs.map(blob => ({ id: crypto.randomUUID(), blob })) };
  await change(q => [...q, item]);
  void flush();
}

export async function pendingCount(eventId?: string) { return count((await read()).filter(p => !eventId || p.eventId === eventId)); }
export function onQueueChange(fn: (n: number) => void) { listeners.add(fn); return () => listeners.delete(fn); }

export async function flush() {
  if (running || !navigator.onLine) return;
  running = true;
  try {
    const attempted = new Set<string>();
    while (navigator.onLine) {
      const item = (await read()).find(item => !attempted.has(item.id));
      if (!item) break;
      attempted.add(item.id);
      try {
        const account = await requireGuestSignIn();
        if (item.authUserId && item.authUserId !== account.id) throw new Error('Sign in to the account that queued this photo.');
        if (item.generalToken) {
          const invite = await api.generalInvite(item.generalToken, item.uploaderName);
          if (!invite || invite.event.id !== item.eventId) throw new Error('Invitation no longer available');
        }
        const meta = { moment: item.moment, questId: item.questId, caption: item.caption, uploaderName: item.uploaderName, personId: item.personId };
        if ('images' in item) await api.uploadPhotoPost(item.eventId, item.id, item.images, meta);
        else await api.uploadPhoto(item.eventId, item.blob, meta);
        await change(q => q.filter(other => other.id !== item.id));
      } catch {
        await change(q => q.map(other => other.id === item.id ? { ...other, tries: other.tries + 1 } : other));
      }
    }
  } finally { running = false; }
}

window.addEventListener('online', () => void flush());
setInterval(() => void flush(), 30_000);
