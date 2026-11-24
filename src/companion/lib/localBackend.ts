// In-browser demo backend: same rules as the Supabase RPCs, stored in localStorage (+ IndexedDB for photos).
// Lets the pilot run end to end with no server. Shared across tabs of the same browser only.
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { DEMO_PIN, demoEvent, demoFunctions, demoHouseholds } from './demoSeed';
import { familyKey, validateHouseholdImport } from './familyImport';
import { defaultGeneralSettings, normalizeGeneralSettings, validateGeneralSettings, validateWish } from './generalInvitation';
import { photoQuest } from './photoQuests';
import { demoVisitorCount } from './visitAnalytics';
import type {
  AdminData, AdminHousehold, AnalyticsPost, Announcement, Backend, Change, EventInfo, Fn, GeneralInvitationSettings, Household, InviteBundle, ListMatch, Person, Photo, RsvpPayload, Wish
} from './types';

type DBPhoto = Omit<Photo, 'url' | 'mine' | 'akshate' | 'uploadedByMe'> & { eventId: string; personId: string | null; uploadedBy?: string; akshateBy: string[]; flaggedBy: string[] };
type DB = {
  events: (EventInfo & { pin: string })[];
  functions: (Fn & { eventId: string })[];
  households: (AdminHousehold & { eventId: string })[];
  devices: { device: string; eventId: string; householdId: string; personId: string }[];
  visitors: { device: string; eventId: string; name: string | null }[];
  generalSettings: Record<string, GeneralInvitationSettings>;
  wishes: (Wish & { eventId: string; device: string; requestId: string })[];
  changes: (Change & { householdId: string; requestId?: string })[];
  photos: DBPhoto[];
  announcements: (Announcement & { eventId: string })[];
  requests: { id: string; eventId: string; name: string; phone?: string; note?: string; status: string; at: string }[];
  pinFails: Record<string, { n: number; at: number }>;
};

const KEY = 'as-wedding-demo-db-v1';
const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();

function device(): string {
  let d = localStorage.getItem('as-wedding-device');
  if (!d) { d = 'dev-' + uid() + uid(); localStorage.setItem('as-wedding-device', d); }
  return d;
}

function seed(): DB {
  return {
    events: [{ ...demoEvent, pin: DEMO_PIN }],
    functions: demoFunctions.map(f => ({ ...f, eventId: demoEvent.id })),
    households: demoHouseholds.map(h => ({ ...h, eventId: demoEvent.id })),
    devices: [],
    visitors: [],
    generalSettings: {},
    wishes: [],
    changes: [{ householdId: 'hh-hunashyal', byName: 'Vinay', summary: 'RSVP: 3 coming · train, Sat evening', at: '2026-11-15T19:00:00+05:30' }],
    photos: [],
    announcements: [{ id: 'a1', eventId: demoEvent.id, body: 'Pickup vans leave Belagavi station at 7 PM on Saturday. Look for the pink flag.', at: '2026-11-16T10:00:00+05:30' }],
    requests: [],
    pinFails: {}
  };
}

function load(): DB {
  const raw = localStorage.getItem(KEY);
  if (raw) { try { const db = JSON.parse(raw) as DB; db.visitors ??= []; db.generalSettings ??= {}; db.wishes ??= []; return db; } catch { /* reseed */ } }
  const db = seed(); save(db); return db;
}
function save(db: DB) { localStorage.setItem(KEY, JSON.stringify(db)); window.dispatchEvent(new Event('as-wedding-db')); }

const urlCache = new Map<string, string>();
async function photoUrl(id: string): Promise<string> {
  if (urlCache.has(id)) return urlCache.get(id)!;
  const blob = await idbGet<Blob>('photo-' + id);
  const url = blob ? URL.createObjectURL(blob) : '';
  urlCache.set(id, url);
  return url;
}

function bundleFor(db: DB, h: DB['households'][number]): InviteBundle {
  const event = db.events.find(e => e.id === h.eventId)!;
  const { pin: _pin, ...ev } = event;
  const linked = new Set(db.devices.map(d => d.personId));
  return {
    event: ev,
    functions: db.functions.filter(f => (h.functionIds ?? []).includes(f.id)),
    household: { id: h.id, name: h.name, cap: h.cap, coming: h.coming, travel: h.travel, stay: h.stay, blessing: h.blessing, updatedAt: h.updatedAt, token: h.token },
    people: h.people.map(p => ({ id: p.id, name: p.name, relation: p.relation, isChild: p.isChild, attending: p.attending, linked: linked.has(p.id) }))
  };
}

function checkPin(db: DB, slug: string, pin: string): string {
  const e = db.events.find(x => x.slug === slug);
  if (!e) throw new Error('Event not found');
  const k = device() + ':' + e.id;
  const f = db.pinFails[k];
  if (f && f.n >= 5 && Date.now() - f.at < 15 * 60 * 1000) throw new Error('Too many tries — wait 15 minutes or ask the hosts');
  if (pin !== e.pin) {
    db.pinFails[k] = { n: f && Date.now() - f.at < 15 * 60 * 1000 ? f.n + 1 : 1, at: Date.now() };
    save(db);
    throw new Error('That PIN is not right');
  }
  delete db.pinFails[k];
  return e.id;
}

function link(db: DB, eventId: string, householdId: string, personId: string) {
  db.devices = db.devices.filter(d => !(d.device === device() && d.eventId === eventId));
  db.devices.push({ device: device(), eventId, householdId, personId });
}

function myDevice(db: DB, eventId: string) {
  const d = db.devices.find(x => x.device === device() && x.eventId === eventId);
  if (!d) throw new Error('This phone is not linked to the event yet');
  return d;
}

let hostEmail: string | null = sessionStorage.getItem('as-wedding-host');

function requirePhotoHost() {
  if (!hostEmail) throw new Error('Only hosts can hide or delete photos');
}

function requirePhotoGuest(db: DB, eventId: string) {
  const me = device();
  if (hostEmail || db.devices.some(d => d.device === me && d.eventId === eventId)
    || db.visitors.some(v => v.device === me && v.eventId === eventId)) return;
  throw new Error('This phone is not linked to the event yet');
}

export const localBackend: Backend = {
  async weddingInvite(name) {
    const token = demoEvent.slug;
    const bundle = await localBackend.generalInvite(token, name);
    return bundle ? { token, bundle } : null;
  },
  kind: 'local',

  async inviteBundle(token) {
    const db = load();
    const h = db.households.find(x => x.token === token);
    return h ? bundleFor(db, h) : null;
  },

  async generalInvite(token, name) {
    const db = load();
    const e = db.events.find(x => x.slug === token);
    if (!e) return null;
    const cleanName = name?.trim();
    if (name !== undefined && (!cleanName || cleanName.length > 80)) throw new Error('Enter a name between 1 and 80 characters');
    let visitor = db.visitors.find(v => v.device === device() && v.eventId === e.id);
    if (!visitor) {
      visitor = { device: device(), eventId: e.id, name: cleanName ?? null };
      db.visitors.push(visitor);
      save(db);
    } else if (cleanName && visitor.name !== cleanName) {
      visitor.name = cleanName;
      save(db);
    }
    const { pin: _pin, ...event } = e;
    return { event, functions: db.functions.filter(f => f.eventId === e.id), guestName: visitor.name, settings: normalizeGeneralSettings(db.generalSettings[e.id]) };
  },

  async generalSettings(eventId) {
    const db = load();
    requirePhotoGuest(db, eventId);
    return normalizeGeneralSettings(db.generalSettings[eventId]);
  },
  async saveGeneralSettings(eventId, settings, cover, previews = []) {
    if (!hostEmail) throw new Error('Only hosts can customize the invitation');
    validateGeneralSettings(settings);
    if (previews.length > 3) throw new Error('Choose up to three preview photos.');
    let coverPath = settings.coverPath;
    if (cover) {
      if (cover.size > 2 * 1024 * 1024 || !['image/webp', 'image/png', 'image/jpeg'].includes(cover.type)) throw new Error('Use a JPG, PNG or WebP cover smaller than 2 MB.');
      coverPath = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not save the cover photo.'));
        reader.readAsDataURL(cover);
      });
    }
    const previewPhotos = [];
    for (let index = 0; index < 3; index++) {
      const blob = previews[index];
      let path = settings.previewPhotos[index]?.path;
      if (blob) {
        if (blob.size > 2 * 1024 * 1024 || !['image/webp', 'image/png', 'image/jpeg'].includes(blob.type)) throw new Error('Use a JPG, PNG or WebP photo smaller than 2 MB.');
        path = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Could not save the preview photo.'));
          reader.readAsDataURL(blob);
        });
      }
      if (path) previewPhotos.push({ path, url: path });
    }
    const db = load();
    if (!db.events.some(e => e.id === eventId)) throw new Error('Event not found');
    db.generalSettings[eventId] = { ...settings, welcomeMessage: settings.welcomeMessage.trim(), coverPath, coverUrl: coverPath, previewPhotos, sections: { ...settings.sections } };
    save(db);
  },
  async listWishes(eventId, moderation = false) {
    const db = load();
    if (moderation && !hostEmail) throw new Error('Only hosts can review wishes');
    requirePhotoGuest(db, eventId);
    if (!moderation && !(db.generalSettings[eventId] ?? defaultGeneralSettings()).sections.guestbook) return [];
    return db.wishes.filter(w => w.eventId === eventId && (moderation || w.status === 'approved'))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, moderation ? 200 : 50)
      .map(({ id, name, message, status, createdAt }) => ({ id, name, message, status, createdAt }));
  },
  async submitWish(token, name, message, requestId) {
    validateWish(name, message);
    const db = load();
    const me = device();
    const household = db.households.find(h => h.token === token && db.devices.some(d => d.device === me && d.householdId === h.id && d.eventId === h.eventId));
    const event = db.events.find(e => e.id === household?.eventId || (e.slug === token && db.visitors.some(v => v.eventId === e.id && v.device === me)));
    if (!event) throw new Error('Open your invitation before leaving a wish.');
    if (!(db.generalSettings[event.id] ?? defaultGeneralSettings()).sections.guestbook) throw new Error('The guestbook is currently closed.');
    const mine = db.wishes.filter(w => w.eventId === event.id && w.device === me);
    if (mine.some(w => w.requestId === requestId)) return;
    if (mine.some(w => Date.now() - Date.parse(w.createdAt) < 30_000)) throw new Error('Please wait 30 seconds before sending another wish.');
    if (mine.filter(w => Date.now() - Date.parse(w.createdAt) < 86400_000).length >= 10) throw new Error('You can leave up to 10 wishes per day.');
    db.wishes.push({ id: 'wish-' + uid(), eventId: event.id, device: me, requestId, name: name.trim(), message: message.trim(), status: 'pending', createdAt: now() });
    save(db);
  },
  async moderateWish(eventId, wishId, status) {
    if (!hostEmail) throw new Error('Only hosts can review wishes');
    if (!['pending', 'approved', 'rejected'].includes(status)) throw new Error('Invalid wish status');
    const db = load();
    const wish = db.wishes.find(w => w.id === wishId && w.eventId === eventId);
    if (!wish) throw new Error('Wish not found');
    wish.status = status;
    save(db);
  },

  async claimPerson(token, personId, newName, relation) {
    const db = load();
    const h = db.households.find(x => x.token === token);
    if (!h) throw new Error('Invite not found');
    let pid = personId;
    if (!pid) {
      if (h.people.length >= h.cap) throw new Error('Your family is full — ask the hosts');
      pid = 'pp-' + uid();
      h.people.push({ id: pid, name: newName || 'Guest', relation: relation ?? null, isChild: false, attending: [], addedBy: 'guest' });
    } else if (relation) {
      const p = h.people.find(x => x.id === pid); if (p) p.relation = relation;
    }
    link(db, h.eventId, h.id, pid);
    if (h.inviteStatus === 'not_sent' || h.inviteStatus === 'sent') h.inviteStatus = 'opened';
    save(db);
    return pid;
  },

  async findOnList(slug, pin, query, phone) {
    const db = load();
    const ev = checkPin(db, slug, pin);
    const q = query.trim().toLowerCase();
    const out: ListMatch[] = [];
    for (const h of db.households.filter(x => x.eventId === ev)) {
      for (const p of h.people) {
        if ((phone && p.phone && p.phone.replace(/\D/g, '').endsWith(phone.replace(/\D/g, '').slice(-10))) || (q && p.name.toLowerCase().includes(q))) {
          out.push({ personId: p.id, name: p.name, household: h.name, householdToken: h.token! });
        }
      }
    }
    return out.slice(0, 8);
  },

  async openJoin(slug, pin, householdName, people, phone) {
    const db = load();
    const ev = checkPin(db, slug, pin);
    const hid = 'hh-' + uid();
    const token = uid() + uid();
    const ps: Person[] = people.map((x, i) => ({ id: 'pp-' + uid(), name: x.name, relation: x.relation ?? null, isChild: !!x.isChild, attending: [], addedBy: 'guest', phone: i === 0 ? phone ?? null : null }));
    db.households.push({
      id: hid, eventId: ev, name: householdName, token, cap: Math.max(6, ps.length), coming: null, travel: null, stay: null,
      updatedAt: now(), inviteStatus: 'opened', source: 'open', functionIds: db.functions.filter(f => f.eventId === ev).map(f => f.id), people: ps
    });
    link(db, ev, hid, ps[0].id);
    save(db);
    return { householdToken: token, personId: ps[0].id };
  },

  async requestAccess(slug, name, phone, note) {
    const db = load();
    const e = db.events.find(x => x.slug === slug);
    if (!e) throw new Error('Event not found');
    db.requests.push({ id: uid(), eventId: e.id, name, phone, note, status: 'pending', at: now() });
    save(db);
  },

  async saveRsvp(eventId, payload: RsvpPayload) {
    const db = load();
    const d = myDevice(db, eventId);
    const h = db.households.find(x => x.id === d.householdId)!;
    const me = h.people.find(p => p.id === d.personId);
    if (payload.requestId && db.changes.some(c => c.householdId === h.id && c.requestId === payload.requestId)) return;
    const allowed = new Set(h.functionIds ?? []);
    for (const item of [...(payload.add ?? []), ...(payload.attendance ?? [])]) {
      if (item.functionIds?.some(id => !allowed.has(id))) throw new Error('Choose only the events on your invitation');
    }
    if (payload.attendance?.some(a => !h.people.some(p => p.id === a.personId))) throw new Error('A family member has changed. Reload your invitation and try again.');
    for (const a of payload.add ?? []) {
      if (h.people.length >= h.cap) throw new Error('Your family is full — ask the hosts');
      if (!a.name.trim() || a.name.trim().length > 80) throw new Error('Enter a name between 1 and 80 characters');
      h.people.push({ id: 'pp-' + uid(), name: a.name.trim(), relation: a.relation ?? null, isChild: !!a.isChild, attending: a.functionIds ?? [], addedBy: 'guest' });
    }
    for (const a of payload.attendance ?? []) {
      const p = h.people.find(x => x.id === a.personId); if (p) p.attending = a.functionIds;
    }
    if (payload.coming) h.coming = payload.coming;
    if (payload.travel !== undefined) h.travel = payload.travel;
    if (payload.stay !== undefined) h.stay = payload.stay;
    if (payload.blessing !== undefined) h.blessing = payload.blessing;
    if (payload.coming) h.inviteStatus = 'responded';
    h.updatedAt = now();
    db.changes.push({ householdId: h.id, byName: me?.name ?? 'Someone', summary: payload.summary, at: now(), requestId: payload.requestId });
    save(db);
  },

  async changes(householdId) {
    return load().changes.filter(c => c.householdId === householdId).sort((a, b) => b.at.localeCompare(a.at));
  },

  async listPhotos(eventId, options) {
    const db = load();
    requirePhotoGuest(db, eventId);
    if (options?.includeHidden && !hostEmail) throw new Error('Only hosts can review hidden photos');
    const me = device();
    const personId = db.devices.find(d => d.device === me && d.eventId === eventId)?.personId;
    const rows = db.photos.filter(p => p.eventId === eventId && (options?.includeHidden || !p.hidden) && (!options?.questId || p.questId === options.questId)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
    return Promise.all((options?.preview ? rows.slice(0, 3) : rows).map(async p => ({
      id: p.id, postId: p.postId, postPosition: p.postPosition, uploaderName: p.uploaderName, moment: p.moment, questId: p.questId, caption: p.caption, createdAt: p.createdAt, pinned: p.pinned, hidden: p.hidden, flags: options?.includeHidden ? p.flaggedBy.length : undefined,
      akshate: p.akshateBy.length, mine: p.akshateBy.includes(me),
      uploadedByMe: p.uploadedBy ? p.uploadedBy === me : !!p.personId && p.personId === personId, url: await photoUrl(p.id)
    })));
  },

  async photoQuestSummary(eventId) {
    const db = load();
    requirePhotoGuest(db, eventId);
    const me = device();
    const personId = db.devices.find(d => d.device === me && d.eventId === eventId)?.personId;
    const counts: Record<string, number> = {};
    const completed = new Set<string>();
    let contributions = 0;
    for (const p of db.photos.filter(p => p.eventId === eventId && !p.hidden)) {
      if (p.questId) counts[p.questId] = (counts[p.questId] ?? 0) + 1;
      if (p.uploadedBy ? p.uploadedBy === me : !!p.personId && p.personId === personId) {
        contributions++;
        if (p.questId) completed.add(p.questId);
      }
    }
    return { contributions, completedQuestIds: [...completed], counts };
  },
  async uploadPhoto(eventId, blob, meta) {
    if (meta.questId && !photoQuest(meta.questId)) throw new Error('Choose a valid photo quest');
    const access = load();
    requirePhotoGuest(access, eventId);
    if (!hostEmail) {
      if (meta.personId) {
        if (myDevice(access, eventId).personId !== meta.personId) throw new Error('Upload as the guest linked to this phone');
      } else {
        const visitor = access.visitors.find(v => v.device === device() && v.eventId === eventId);
        if (!visitor?.name || !meta.uploaderName.trim() || meta.uploaderName.trim().length > 80) throw new Error('Add your name before posting');
      }
    }
    const id = 'ph-' + uid();
    await idbSet('photo-' + id, blob);
    const db = load();
    db.photos.push({ id, eventId, personId: meta.personId, uploadedBy: device(), uploaderName: meta.uploaderName, moment: meta.moment ?? null, questId: meta.questId ?? null, caption: meta.caption ?? null,
      createdAt: now(), pinned: false, hidden: false, akshateBy: [], flaggedBy: [] });
    save(db);
  },

  async uploadPhotoPost(eventId, postId, images, meta) {
    if (!images.length || images.length > 10) throw new Error('Choose between 1 and 10 photos.');
    if (meta.questId && !photoQuest(meta.questId)) throw new Error('Choose a valid photo quest');
    const access = load();
    requirePhotoGuest(access, eventId);
    if (!hostEmail && meta.personId && myDevice(access, eventId).personId !== meta.personId) throw new Error('Upload as the guest linked to this phone');
    if (!hostEmail && !meta.personId && !access.visitors.some(v => v.device === device() && v.eventId === eventId && v.name)) throw new Error('Add your name before posting');
    if (images.every(image => access.photos.some(p => p.id === image.id))) return;
    for (const image of images) await idbSet('photo-' + image.id, image.blob);
    const db = load(), createdAt = now();
    images.forEach((image, postPosition) => db.photos.push({ ...meta, id: image.id, postId, postPosition, eventId, uploadedBy: device(),
      createdAt, pinned: false, hidden: false, akshateBy: [], flaggedBy: [] }));
    save(db);
  },

  async toggleAkshate(photoId) {
    const db = load();
    const p = db.photos.find(x => x.id === photoId); if (!p) return;
    requirePhotoGuest(db, p.eventId);
    const me = device();
    p.akshateBy = p.akshateBy.includes(me) ? p.akshateBy.filter(x => x !== me) : [...p.akshateBy, me];
    save(db);
  },

  async flagPhoto(photoId, _reason, _removal) {
    const db = load();
    const p = db.photos.find(x => x.id === photoId);
    if (!p) throw new Error('Photo not found');
    requirePhotoGuest(db, p.eventId);
    if (!p.flaggedBy.includes(device())) p.flaggedBy.push(device());
    // Reports and removal requests wait for a host; guests cannot change visibility.
    save(db);
  },

  async announcements(eventId) {
    const db = load();
    requirePhotoGuest(db, eventId);
    return db.announcements.filter(a => a.eventId === eventId).sort((a, b) => b.at.localeCompare(a.at));
  },

  async markArrived(eventId) {
    const db = load();
    const d = myDevice(db, eventId);
    const h = db.households.find(x => x.id === d.householdId)!;
    for (const p of h.people) if (p.attending.length || p.id === d.personId) p.arrivedAt = p.arrivedAt ?? now();
    save(db);
  },

  // ── hosts (demo: any email, any password) ──
  async hostSignIn(email, password) {
    if (!email.includes('@') || !password) return false;
    hostEmail = email; sessionStorage.setItem('as-wedding-host', email); return true;
  },
  async hostEvents() {
    if (!hostEmail) return [];
    return load().events.map(({ pin: _p, ...e }) => e);
  },
  async adminData(eventId) {
    const db = load();
    const e = db.events.find(x => x.id === eventId)!;
    const { pin: _p, ...event } = e;
    const photos = await Promise.all(db.photos.filter(p => p.eventId === eventId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(async p => ({
      id: p.id, uploaderName: p.uploaderName, moment: p.moment, questId: p.questId, caption: p.caption, createdAt: p.createdAt, pinned: p.pinned, hidden: p.hidden,
      akshate: p.akshateBy.length, mine: false, uploadedByMe: p.uploadedBy === device(), flags: p.flaggedBy.length, url: await photoUrl(p.id)
    })));
    return {
      event,
      pin: e.pin,
      generalToken: e.slug,
      functions: db.functions.filter(f => f.eventId === eventId),
      households: db.households.filter(h => h.eventId === eventId),
      photos,
      announcements: db.announcements.filter(a => a.eventId === eventId).sort((a, b) => b.at.localeCompare(a.at)),
      requests: db.requests.filter(r => r.eventId === eventId)
    } satisfies AdminData;
  },
  async adminAnalytics(eventId) {
    if (!hostEmail) throw new Error('Only hosts can view analytics');
    const db = load();
    if (!db.events.some(e => e.id === eventId)) throw new Error('Event not found');
    const groups = new Map<string, DBPhoto[]>();
    for (const photo of db.photos.filter(p => p.eventId === eventId)) {
      const key = photo.postId ?? photo.id;
      groups.set(key, [...(groups.get(key) ?? []), photo]);
    }
    const photoPosts: (AnalyticsPost & { previewId?: string })[] = [...groups].map(([id, photos]) => {
      photos.sort((a, b) => (a.postPosition ?? 0) - (b.postPosition ?? 0));
      const first = photos[0];
      return { id, kind: 'photo', name: first.uploaderName, text: first.caption ?? null, photos: photos.length,
        createdAt: photos.map(p => p.createdAt).sort().at(-1)!, previewId: first.id,
        status: photos.every(p => p.hidden) ? 'hidden' : photos.some(p => p.hidden) ? 'partly_hidden' : 'shared' };
    });
    const wishes: AnalyticsPost[] = db.wishes.filter(w => w.eventId === eventId).map(w => ({
      id: w.id, kind: 'wish', name: w.name, text: w.message, photos: 0, createdAt: w.createdAt, status: w.status,
    }));
    const recentPosts = await Promise.all([...photoPosts, ...wishes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20)
      .map(async post => { const { previewId, ...row } = post as AnalyticsPost & { previewId?: string }; return { ...row, url: previewId ? await photoUrl(previewId) : undefined }; }));
    return { visitors: demoVisitorCount(), signedIn: 0, photoPosts: groups.size, wishes: wishes.length, recentPosts };
  },
  async saveHousehold(eventId, hh, people) {
    const db = load();
    let h = hh.id ? db.households.find(x => x.id === hh.id) : undefined;
    if (!h) {
      h = { id: 'hh-' + uid(), eventId, name: hh.name, token: uid() + uid(), cap: hh.cap ?? 6, coming: null, travel: null, stay: null, updatedAt: now(),
        side: hh.side ?? null, invitedBy: hh.invitedBy ?? null, inviteStatus: 'not_sent', source: 'list',
        functionIds: hh.functionIds ?? db.functions.filter(f => f.eventId === eventId).map(f => f.id), people: [] };
      db.households.push(h);
    } else {
      Object.assign(h, { name: hh.name, cap: hh.cap ?? h.cap, side: hh.side ?? h.side, invitedBy: hh.invitedBy ?? h.invitedBy, functionIds: hh.functionIds ?? h.functionIds });
    }
    for (const p of people) {
      const ex = p.id ? h.people.find(x => x.id === p.id) : undefined;
      if (ex) Object.assign(ex, p);
      else if (p.name) h.people.push({ id: 'pp-' + uid(), name: p.name, relation: p.relation ?? null, isChild: !!p.isChild, attending: [], addedBy: 'host', phone: p.phone ?? null });
    }
    save(db);
  },
  async deleteHousehold(eventId, householdId) {
    if (!hostEmail) throw new Error('Only hosts can delete families');
    const db = load();
    const h = db.households.find(x => x.id === householdId && x.eventId === eventId);
    if (!h) throw new Error('Family not found. Refresh the list and try again.');
    const people = new Set(h.people.map(p => p.id));
    db.households = db.households.filter(x => x.id !== h.id);
    db.devices = db.devices.filter(x => x.householdId !== h.id);
    db.changes = db.changes.filter(x => x.householdId !== h.id);
    for (const photo of db.photos) if (photo.personId && people.has(photo.personId)) photo.personId = null;
    save(db);
  },
  async importHouseholds(eventId, households) {
    if (!hostEmail) throw new Error('Only hosts can import families');
    const db = load();
    if (!db.events.some(e => e.id === eventId)) throw new Error('Event not found');
    validateHouseholdImport(households, db.functions.filter(f => f.eventId === eventId));
    const existing = new Set(db.households.filter(h => h.eventId === eventId).map(h => familyKey(h.name)));
    let created = 0;
    for (const h of households) {
      if (existing.has(familyKey(h.name))) continue;
      db.households.push({
        ...h, id: 'hh-' + uid(), eventId, token: uid() + uid(), coming: null, travel: null, stay: null,
        updatedAt: now(), inviteStatus: 'not_sent', source: 'list',
        people: h.people.map(p => ({ ...p, id: 'pp-' + uid(), attending: [], addedBy: 'host' }))
      });
      existing.add(familyKey(h.name));
      created++;
    }
    // One write: a validation/storage error cannot leave a partly imported sheet.
    save(db);
    return { created, skipped: households.length - created };
  },
  async setInviteStatus(householdId, status) {
    const db = load();
    const h = db.households.find(x => x.id === householdId);
    if (h && status && (h.inviteStatus === 'not_sent' || status !== 'sent')) h.inviteStatus = status;
    save(db);
  },
  async setPhoto(photoId, patch) {
    requirePhotoHost();
    const db = load();
    const p = db.photos.find(x => x.id === photoId); if (p) Object.assign(p, patch);
    save(db);
  },
  async deletePhoto(photoId) {
    requirePhotoHost();
    const db = load();
    db.photos = db.photos.filter(x => x.id !== photoId);
    await idbDel('photo-' + photoId);
    save(db);
  },
  async postAnnouncement(eventId, body) {
    const db = load();
    db.announcements.push({ id: uid(), eventId, body, at: now() });
    save(db);
  },
  async setPin(eventId, pin) {
    if (!/^\d{6}$/.test(pin)) throw new Error('PIN must be 6 digits');
    const db = load();
    const e = db.events.find(x => x.id === eventId); if (e) e.pin = pin;
    save(db);
  }
};

export function resetDemo() { localStorage.removeItem(KEY); localStorage.removeItem('as-wedding-session'); }
export type { Household };
