import { api } from '../lib/backend';
import type { GuestContact, GuestMemoryPost } from '../lib/types';

export const memoryWhen = (value: string | null) => value ? new Date(value).toLocaleString('en-IN', {
  year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
}) : '';

// Protect spreadsheet users from formulas in guest names, captions or wishes.
export function memoryCsv(rows: unknown[][]) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let text = value == null ? '' : String(value);
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
}

function downloadCsv(name: string, rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob([memoryCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function allPages<T>(fetch: (offset: number) => Promise<{ total: number; rows: T[] }>, key: (row: T) => string) {
  const rows: T[] = [];
  let total: number | undefined;
  do {
    const page = await fetch(rows.length);
    if (total !== undefined && page.total !== total) throw new Error('Guest activity changed during export. Please export again.');
    total = page.total;
    if (!page.rows.length && rows.length < total) throw new Error('The export was incomplete. Please try again.');
    rows.push(...page.rows);
  } while (rows.length < total);
  if (new Set(rows.map(key)).size !== rows.length) throw new Error('Guest activity changed during export. Please export again.');
  return rows;
}

export async function exportGuestContacts(eventId: string) {
  const guests = await allPages<GuestContact>(async offset => {
    const data = await api.adminGuests(eventId, { offset, limit: 200 });
    return { total: data.total, rows: data.guests };
  }, guest => guest.id);
  downloadCsv('wedding-guest-contacts.csv', [
    ['Guest ID', 'Google name', 'Google email', 'Photo posts', 'Photos', 'Wishes', 'Reactions given', 'First recorded activity (IST)', 'Last recorded activity (IST)', 'First recorded sign-in (IST)', 'Last recorded sign-in (IST)'],
    ...guests.map(g => [g.id, g.name, g.email, g.photoPosts, g.photos, g.wishes, g.reactions, memoryWhen(g.firstSeenAt), memoryWhen(g.lastActiveAt), memoryWhen(g.firstSignedInAt), memoryWhen(g.lastSignedInAt)]),
  ]);
  return guests.length;
}

export async function exportGuestMemories(eventId: string, guestId?: string) {
  const posts = await allPages<GuestMemoryPost>(async offset => {
    const data = await api.adminGuestPosts(eventId, { guestId, offset, limit: 200, includeUrls: false });
    return { total: data.total, rows: data.posts };
  }, post => `${post.guestId}:${post.kind}:${post.id}`);
  downloadCsv(guestId ? `wedding-guest-${guestId}-memories.csv` : 'wedding-guest-posts-and-wishes.csv', [
    ['Guest ID', 'Google name', 'Google email', 'Post ID', 'Post type', 'Posted as', 'Posted at (IST)', 'Status', 'Post text', 'Photo ID', 'Photo storage path', 'Photo caption', 'Moment', 'Quest', 'Photo hidden'],
    ...posts.flatMap(post => {
      const fields = [post.guestId, post.name, post.email, post.id, post.kind, post.author, memoryWhen(post.createdAt), post.status, post.text];
      return post.photos.length ? post.photos.map(photo => [...fields, photo.id, photo.path, photo.caption, photo.moment, photo.questId, photo.hidden ? 'Yes' : 'No']) : [[...fields, '', '', '', '', '', '']];
    }),
  ]);
  return posts.length;
}
