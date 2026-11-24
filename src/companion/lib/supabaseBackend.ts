// Supabase backend — talks to the schema in supabase/migrations/0001_init.sql.
// Guests use anonymous auth (a silent device session). Hosts use email/password.
import { supabase as sb } from './supabaseClient';
import type { AdminAnalytics, AdminData, AdminHousehold, Backend, EventInfo, GeneralInviteBundle, GeneralInvitationSettings, GuestDirectory, GuestMemoryPosts, HostTeam, HostTeamResult, Household, Person, Photo, PhotoQuestSummary, ReactionCounts, ReactionKind, Wish } from './types';
import { defaultGeneralSettings, normalizeGeneralSettings, validateGeneralSettings, validateWish } from './generalInvitation';
import { photoQuest } from './photoQuests';
import { emptyReactions, reactionFields } from './reactions';
import { siteOrigin } from '../../siteOrigin';

type PhotoReactionSummary = { photoId: string; counts: ReactionCounts; mine: ReactionKind | null };
async function photoReactionSummary(ids: string[], userId: string): Promise<PhotoReactionSummary[]> {
  if (ids.length > 500) return (await Promise.all(Array.from({ length: Math.ceil(ids.length / 500) }, (_, i) => photoReactionSummary(ids.slice(i * 500, (i + 1) * 500), userId)))).flat();
  const { data, error } = await sb().rpc('photo_reaction_summary', { p_photos: ids });
  if (error?.code === 'PGRST202') {
    // Show existing blessings while the additive migration is pending.
    const rows = must(await sb().from('akshate').select('photo_id,user_id').in('photo_id', ids)) as { photo_id: string; user_id: string }[];
    return ids.map(photoId => ({ photoId, counts: reactionFields(Object.fromEntries(rows.filter(r => r.photo_id === photoId).map(r => [r.user_id, 'akshate' as const])), userId).reactionCounts,
      mine: rows.some(r => r.photo_id === photoId && r.user_id === userId) ? 'akshate' as const : null }));
  }
  if (error) throw new Error(error.message);
  return data as PhotoReactionSummary[];
}

async function ensureDevice() {
  const { data } = await sb().auth.getSession();
  if (!data.session) {
    const { error } = await sb().auth.signInAnonymously();
    if (error) throw error;
  }
}

function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw new Error((r.error as { message?: string }).message ?? 'Something went wrong');
  return r.data;
}

const toEvent = (e: Record<string, any>): EventInfo => ({
  id: e.id, slug: e.slug, title: e.title, coupleA: e.couple_a, coupleB: e.couple_b, startsAt: e.starts_at,
  venue: e.venue, mapUrl: e.map_url, hostWhatsapp: e.host_whatsapp, theme: e.theme ?? {}
});
const toPerson = (p: Record<string, any>): Person => ({
  id: p.id, name: p.name, relation: p.relation, isChild: p.is_child, attending: p.attending ?? [], phone: p.phone,
  addedBy: p.added_by, arrivedAt: p.arrived_at
});
const toHousehold = (h: Record<string, any>): Household => ({
  id: h.id, name: h.name, token: h.token, cap: h.cap ?? 6, coming: h.coming, travel: h.travel, stay: h.stay, blessing: h.blessing,
  updatedAt: h.updated_at, side: h.side, invitedBy: h.invited_by, inviteStatus: h.invite_status, source: h.source, functionIds: h.function_ids
});

// Keep URLs stable across feed refreshes so the browser can reuse downloaded photos.
// Memory only, scoped to the account, and never kept beyond their five-minute expiry.
const photoUrlCache = new Map<string, { url: string; expiresAt: number }>();
const photoUrlRequests = new Map<string, Promise<Map<string, string>>>();
async function signedUrls(paths: string[], userId: string): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!paths.length) return m;
  const now = Date.now();
  for (const [key, entry] of photoUrlCache) if (entry.expiresAt <= now) photoUrlCache.delete(key);
  const missing: string[] = [];
  for (const path of new Set(paths)) {
    const cached = photoUrlCache.get(`${userId}:${path}`);
    if (cached) m.set(path, cached.url);
    else missing.push(path);
  }
  if (missing.length) {
    const requestKey = JSON.stringify([userId, [...missing].sort()]);
    let request = photoUrlRequests.get(requestKey);
    if (!request) {
      request = (async () => {
        const expiresAt = Date.now() + (5 * 60 - 30) * 1000;
        const data = must(await sb().storage.from('photos').createSignedUrls(missing, 5 * 60));
        const urls = new Map<string, string>();
        for (const d of data ?? []) if (d.path && d.signedUrl) {
          urls.set(d.path, d.signedUrl);
          photoUrlCache.set(`${userId}:${d.path}`, { url: d.signedUrl, expiresAt });
        }
        // Bound memory when a host browses several collections.
        while (photoUrlCache.size > 1000) photoUrlCache.delete(photoUrlCache.keys().next().value!);
        return urls;
      })();
      photoUrlRequests.set(requestKey, request);
    }
    try { for (const [path, url] of await request) m.set(path, url); }
    finally { if (photoUrlRequests.get(requestKey) === request) photoUrlRequests.delete(requestKey); }
  }
  return m;
}

async function photosFor(eventId: string, includeHidden: boolean, questId?: string, preview = false): Promise<Photo[]> {
  let q = sb().from('photos').select('*').eq('event_id', eventId);
  if (!includeHidden) q = q.eq('hidden', false);
  if (questId) q = q.eq('quest_id', questId);
  if (includeHidden) q = q.order('pinned', { ascending: false });
  const [result, session] = await Promise.all([
    q.order('created_at', { ascending: false }).limit(preview ? 3 : 200),
    sb().auth.getSession(),
  ]);
  const rows = must(result) as any[];
  // Complete carousels even when a post straddles the latest-photo limit.
  const postIds = !preview && rows.length === 200 ? [...new Set(rows.map(r => r.post_id).filter(Boolean))] : [];
  if (postIds.length) {
    let grouped = sb().from('photos').select('*').eq('event_id', eventId).in('post_id', postIds);
    if (!includeHidden) grouped = grouped.eq('hidden', false);
    if (questId) grouped = grouped.eq('quest_id', questId);
    for (const row of must(await grouped) as any[]) if (!rows.some(r => r.id === row.id)) rows.push(row);
  }
  const ids = rows.map(r => r.id);
  // The local session identifies "my photos"; database and Storage RLS still enforce access.
  const me = session.data.session?.user.id;
  const needsDevice = !preview && me && rows.some(r => !r.uploaded_by && r.person_id);
  const [reactions, flags, device, urls] = await Promise.all([
    !preview && ids.length ? photoReactionSummary(ids, me ?? '') : [],
    includeHidden && ids.length ? sb().from('photo_flags').select('photo_id').in('photo_id', ids).then(r => must(r) as any[]) : [],
    needsDevice ? sb().from('devices').select('person_id').eq('event_id', eventId).eq('user_id', me!).maybeSingle().then(r => must(r) as { person_id: string } | null) : null,
    signedUrls(rows.map(r => r.storage_path), me ?? ''),
  ]);
  const reactionsById = new Map(reactions.map(reaction => [reaction.photoId, reaction]));
  return rows.map(r => ({
    id: r.id, postId: r.post_id, postPosition: r.post_position, uploaderName: r.uploader_name, moment: r.moment, questId: r.quest_id, caption: r.caption, createdAt: r.created_at, pinned: r.pinned, hidden: r.hidden, flags: includeHidden ? flags.filter(f => f.photo_id === r.id).length : undefined,
    reactionCounts: reactionsById.get(r.id)?.counts ?? emptyReactions(), myReaction: reactionsById.get(r.id)?.mine ?? null,
    akshate: reactionsById.get(r.id)?.counts.akshate ?? 0, mine: reactionsById.get(r.id)?.mine === 'akshate',
    uploadedByMe: r.uploaded_by ? r.uploaded_by === me : !!r.person_id && r.person_id === device?.person_id,
    url: urls.get(r.storage_path) ?? ''
  }));
}

export const supabaseBackend: Backend = {
  kind: 'supabase',

  async weddingInvite(name) {
    await ensureDevice();
    const { data, error } = await sb().rpc('open_wedding_invite', { p_name: name ?? null });
    if (error) throw new Error(error.code === 'PGRST202'
      ? 'The wedding album is being prepared. Please try again later.' : error.message);
    const result = data as { token: string; bundle: GeneralInviteBundle } | null;
    return result ? { ...result, bundle: { ...result.bundle, settings: await supabaseBackend.generalSettings(result.bundle.event.id) } } : null;
  },

  async inviteBundle(token) {
    const data = must(await sb().rpc('invite_bundle', { p_token: token }));
    return (data as any) ?? null;
  },
  async generalInvite(token, name) {
    await ensureDevice();
    const bundle = must(await sb().rpc('open_general_invite', { p_token: token, p_name: name ?? null })) as GeneralInviteBundle | null;
    return bundle ? { ...bundle, settings: await supabaseBackend.generalSettings(bundle.event.id) } : null;
  },
  async generalSettings(eventId) {
    const { data, error } = await sb().from('general_invitation_settings').select('*').eq('event_id', eventId).maybeSingle();
    if (error) throw new Error(error.code === 'PGRST205' ? 'Apply the 0005_general_invitation_extras.sql database migration to enable invitation settings and the guestbook.' : error.message);
    if (!data) return defaultGeneralSettings();
    const settings = normalizeGeneralSettings({ welcomeMessage: data.welcome_message, coverPath: data.cover_path, coverUrl: null,
      previewPhotos: (data.preview_photo_paths ?? []).map((path: string) => ({ path, url: null })), sections: data.sections });
    await Promise.all([
      (async () => {
        if (!settings.coverPath) return;
        const signed = must(await sb().storage.from('invitation-covers').createSignedUrl(settings.coverPath, 7 * 86400));
        if (!signed) throw new Error('Could not load the invitation cover.');
        settings.coverUrl = signed.signedUrl;
      })(),
      (async () => {
        if (!settings.previewPhotos.length) return;
        const signed = must(await sb().storage.from('invitation-previews').createSignedUrls(settings.previewPhotos.map(photo => photo.path!), 3600));
        settings.previewPhotos = settings.previewPhotos.map(photo => ({ ...photo, url: signed?.find(item => item.path === photo.path)?.signedUrl || null }));
      })(),
    ]);
    return settings;
  },
  async saveGeneralSettings(eventId, settings, cover, previews = []) {
    validateGeneralSettings(settings);
    if (previews.length > 3) throw new Error('Choose up to three preview photos.');
    const previous = must(await sb().from('general_invitation_settings').select('*').eq('event_id', eventId).maybeSingle());
    let coverPath = settings.coverPath;
    const previewPaths: string[] = [];
    const uploaded: { bucket: string; path: string }[] = [];
    const upload = async (bucket: string, blob: Blob) => {
      if (blob.size > 2 * 1024 * 1024 || !['image/webp', 'image/png', 'image/jpeg'].includes(blob.type)) throw new Error('Use a JPG, PNG or WebP photo smaller than 2 MB.');
      const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/png' ? 'png' : 'webp';
      const path = `${eventId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await sb().storage.from(bucket).upload(path, blob, { contentType: blob.type });
      if (error) throw new Error(bucket === 'invitation-previews' && String(error.message).toLowerCase().includes('bucket')
        ? 'Apply the 0011_invitation_preview_photos.sql migration before uploading preview photos.' : error.message);
      uploaded.push({ bucket, path });
      return path;
    };
    try {
      if (cover) coverPath = await upload('invitation-covers', cover);
      for (let index = 0; index < 3; index++) {
        const blob = previews[index];
        const path = blob ? await upload('invitation-previews', blob) : settings.previewPhotos[index]?.path;
        if (path) previewPaths.push(path);
      }
      const args = { p_event: eventId, p_welcome: settings.welcomeMessage.trim(), p_cover: coverPath, p_sections: settings.sections };
      const { error } = await sb().rpc('save_general_invitation_with_previews', { ...args, p_preview_paths: previewPaths });
      if (error?.code === 'PGRST202' && !previewPaths.length && !settings.previewPhotos.length && !previews.some(Boolean)) {
        must(await sb().rpc('save_general_invitation_settings', args));
      } else if (error) {
        throw new Error(error.code === 'PGRST202' ? 'Apply the 0011_invitation_preview_photos.sql migration before saving preview photos.' : error.message);
      }
    } catch (e) {
      await Promise.allSettled(uploaded.map(file => sb().storage.from(file.bucket).remove([file.path])));
      throw e;
    }
    // Replaced previews no longer need to consume storage. RLS prevents deleting
    // a photo that another host has selected again during a concurrent save.
    const retired = ((previous?.preview_photo_paths ?? []) as string[]).filter(path => !previewPaths.includes(path));
    if (retired.length) await sb().storage.from('invitation-previews').remove(retired).catch(() => {});
  },
  async listWishes(eventId, moderation = false) {
    let query = sb().from('guestbook_messages').select('id,name,message,status,created_at').eq('event_id', eventId);
    if (!moderation) query = query.eq('status', 'approved');
    const rows = must(await query.order('created_at', { ascending: false }).limit(moderation ? 200 : 50)) as any[];
    return rows.map(r => ({ id: r.id, name: r.name, message: r.message, status: r.status, createdAt: r.created_at })) as Wish[];
  },
  async submitWish(token, name, message, requestId) {
    validateWish(name, message);
    await ensureDevice();
    must(await sb().rpc('submit_guestbook_wish', { p_token: token, p_name: name.trim(), p_message: message.trim(), p_request: requestId }));
  },
  async moderateWish(eventId, wishId, status) {
    must(await sb().rpc('moderate_guestbook_wish', { p_event: eventId, p_wish: wishId, p_status: status }));
  },
  async claimPerson(token, personId, newName, relation) {
    await ensureDevice();
    return must(await sb().rpc('claim_person', { p_token: token, p_person: personId, p_new_name: newName ?? null, p_relation: relation ?? null })) as string;
  },
  async findOnList(slug, pin, query, phone) {
    await ensureDevice();
    return must(await sb().rpc('find_on_list', { p_slug: slug, p_pin: pin, p_query: query, p_phone: phone ?? null })) as any;
  },
  async openJoin(slug, pin, householdName, people, phone) {
    await ensureDevice();
    return must(await sb().rpc('open_join', { p_slug: slug, p_pin: pin, p_household: householdName, p_people: people, p_phone: phone ?? null })) as any;
  },
  async requestAccess(slug, name, phone, note) {
    await ensureDevice();
    must(await sb().rpc('request_access', { p_slug: slug, p_name: name, p_phone: phone, p_note: note }));
  },
  async saveRsvp(eventId, payload) {
    must(await sb().rpc('save_rsvp', { p_event: eventId, p_payload: payload }));
  },
  async changes(householdId) {
    const rows = must(await sb().from('household_changes').select('*').eq('household_id', householdId).order('created_at', { ascending: false }).limit(20)) as any[];
    return rows.map(r => ({ byName: r.by_name, summary: r.summary, at: r.created_at }));
  },
  async listPhotos(eventId, options) { return photosFor(eventId, !!options?.includeHidden, options?.questId, !!options?.preview); },
  async photoQuestSummary(eventId) {
    const { data, error } = await sb().rpc('photo_quest_summary', { p_event: eventId });
    if (error) throw new Error(error.message);
    return data as PhotoQuestSummary;
  },
  async uploadPhoto(eventId, blob, meta) {
    if (meta.questId && !photoQuest(meta.questId)) throw new Error('Choose a valid photo quest');
    const path = `${eventId}/${crypto.randomUUID()}.webp`;
    must(await sb().storage.from('photos').upload(path, blob, { contentType: blob.type || 'image/webp' }));
    must(await sb().from('photos').insert({ event_id: eventId, person_id: meta.personId, uploader_name: meta.uploaderName, storage_path: path,
      moment: meta.moment ?? null, ...(meta.questId ? { quest_id: meta.questId } : {}), caption: meta.caption ?? null }));
  },
  async uploadPhotoPost(eventId, postId, images, meta) {
    if (!images.length || images.length > 10) throw new Error('Choose between 1 and 10 photos.');
    if (meta.questId && !photoQuest(meta.questId)) throw new Error('Choose a valid photo quest');
    // Stable IDs make a retry safe after a lost response or interrupted upload.
    const existing = must(await sb().from('photos').select('id').eq('event_id', eventId).eq('post_id', postId)) as { id: string }[];
    if (images.every(image => existing.some(row => row.id === image.id))) return;
    const rows = [];
    for (const [position, image] of images.entries()) {
      const path = `${eventId}/${postId}/${image.id}.webp`;
      const { error } = await sb().storage.from('photos').upload(path, image.blob, { contentType: image.blob.type || 'image/webp' });
      if (error && !('statusCode' in error && String(error.statusCode) === '409')) throw error;
      rows.push({ id: image.id, event_id: eventId, post_id: postId, post_position: position, person_id: meta.personId,
        uploader_name: meta.uploaderName, storage_path: path, moment: meta.moment ?? null,
        quest_id: meta.questId ?? null, caption: meta.caption ?? null });
    }
    // A single database statement publishes every image together.
    must(await sb().from('photos').insert(rows));
  },
  async toggleAkshate(photoId) {
    const me = (await sb().auth.getSession()).data.session?.user.id;
    const current = (await photoReactionSummary([photoId], me ?? ''))[0]?.mine;
    await supabaseBackend.setPhotoReaction(photoId, current === 'akshate' ? null : 'akshate');
  },
  async setPhotoReaction(photoId, reaction) {
    const { error } = await sb().rpc('set_photo_reaction', { p_photo: photoId, p_reaction: reaction });
    if (error) throw new Error(error.code === 'PGRST202' ? 'The new reactions are not enabled yet. Please ask the hosts to finish the update.' : error.message);
  },
  async flagPhoto(photoId, reason, removal) {
    must(await sb().rpc('flag_photo', { p_photo: photoId, p_reason: reason, p_removal: removal }));
  },
  async announcements(eventId) {
    const rows = must(await sb().from('announcements').select('*').eq('event_id', eventId).order('created_at', { ascending: false }).limit(20)) as any[];
    return rows.map(r => ({ id: String(r.id), body: r.body, at: r.created_at }));
  },
  async markArrived(eventId) { must(await sb().rpc('mark_arrived', { p_event: eventId })); },

  async hostSignIn(email, password) {
    const { error } = await sb().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return true;
  },
  async hostEvents() {
    const rows = must(await sb().from('hosts').select('events(*)')) as any[];
    return rows.map(r => toEvent(r.events));
  },
  async hostTeam(eventId) {
    const { data, error } = await sb().rpc('admin_host_team', { p_event: eventId });
    if (error) throw new Error(error.code === 'PGRST202' ? 'Host management is not enabled yet. Apply the 0017_host_team_management.sql migration, then refresh.' : error.message);
    return data as HostTeam;
  },
  async manageHostTeam(eventId, action) {
    const { data: { session } } = await sb().auth.getSession();
    if (!session) throw new Error('Sign in as an owner to manage hosts.');
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/host-team`, {
      method: 'POST', headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...action, eventId, redirectTo: siteOrigin() + '/admin/reset-password' }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.message || 'Host management is unavailable. Check that the host-team email function is deployed.');
    return result as HostTeamResult;
  },
  async adminData(eventId) {
    const ev = must(await sb().from('events').select('*').eq('id', eventId).single()) as any;
    const fns = must(await sb().from('event_functions').select('*').eq('event_id', eventId).order('sort')) as any[];
    const hhs = must(await sb().from('households').select('*, people(*)').eq('event_id', eventId).order('name')) as any[];
    const ann = must(await sb().from('announcements').select('*').eq('event_id', eventId).order('created_at', { ascending: false })) as any[];
    const req = must(await sb().from('access_requests').select('*').eq('event_id', eventId).order('created_at', { ascending: false })) as any[];
    const secret = must(await sb().from('event_secrets').select('pin').eq('event_id', eventId).maybeSingle()) as any;
    const generalToken = must(await sb().rpc('general_invite_token', { p_event: eventId })) as string;
    const photos = await photosFor(eventId, true);
    return {
      event: toEvent(ev),
      pin: secret?.pin ?? '',
      generalToken,
      functions: fns.map(f => ({ id: f.id, nameEn: f.name_en, nameKn: f.name_kn, startsAt: f.starts_at, venue: f.venue })),
      households: hhs.map(h => ({ ...toHousehold(h), people: (h.people ?? []).map(toPerson) })) as AdminHousehold[],
      photos,
      announcements: ann.map(a => ({ id: String(a.id), body: a.body, at: a.created_at })),
      requests: req.map(r => ({ id: String(r.id), name: r.name, phone: r.phone, note: r.note, status: r.status, at: r.created_at }))
    } satisfies AdminData;
  },
  async adminAnalytics(eventId) {
    const { data, error } = await sb().rpc('admin_wedding_analytics', { p_event: eventId });
    if (error) throw new Error(error.code === 'PGRST202'
      ? 'Analytics is not enabled yet. Apply the 0013_wedding_analytics.sql database migration, then refresh.' : error.message);
    const result = data as Omit<AdminAnalytics, 'recentPosts'> & { recentPosts: (AdminAnalytics['recentPosts'][number] & { photoPath?: string })[] };
    const { data: { session } } = await sb().auth.getSession();
    const paths = result.recentPosts.flatMap(post => post.photoPath ? [post.photoPath] : []);
    // A temporary thumbnail failure should not hide the counts or post text.
    const urls = await signedUrls(paths, session?.user.id ?? '').catch(() => new Map<string, string>());
    return { ...result, recentPosts: result.recentPosts.map(({ photoPath, ...post }) => ({ ...post, url: photoPath ? urls.get(photoPath) : undefined })) };
  },
  async adminGuests(eventId, options = {}) {
    const { data, error } = await sb().rpc('admin_wedding_guests', { p_event: eventId, p_query: options.query ?? '', p_limit: options.limit ?? 50, p_offset: options.offset ?? 0 });
    if (error) throw new Error(error.code === 'PGRST202' ? 'Guest contacts are not enabled yet. Apply the 0015_guest_memory_directory.sql database migration, then refresh.' : error.message);
    return data as GuestDirectory;
  },
  async adminGuestPosts(eventId, options = {}) {
    const { data, error } = await sb().rpc('admin_wedding_guest_posts', { p_event: eventId, p_user: options.guestId ?? null, p_limit: options.limit ?? 50, p_offset: options.offset ?? 0 });
    if (error) throw new Error(error.code === 'PGRST202' ? 'Guest activities are not enabled yet. Apply the 0015_guest_memory_directory.sql database migration, then refresh.' : error.message);
    const result = data as GuestMemoryPosts;
    if (options.includeUrls === false) return result;
    const { data: { session } } = await sb().auth.getSession();
    const urls = await signedUrls(result.posts.flatMap(post => post.photos.map(photo => photo.path)), session?.user.id ?? '').catch(() => new Map<string, string>());
    return { ...result, posts: result.posts.map(post => ({ ...post, photos: post.photos.map(photo => ({ ...photo, url: urls.get(photo.path) })) })) };
  },
  async saveHousehold(eventId, hh, people) {
    const row = { event_id: eventId, name: hh.name, cap: hh.cap ?? null, side: hh.side ?? null, invited_by: hh.invitedBy ?? null,
      ...(hh.functionIds ? { function_ids: hh.functionIds } : {}) };
    const saved = hh.id
      ? must(await sb().from('households').update(row).eq('id', hh.id).select().single()) as any
      : must(await sb().from('households').insert(row).select().single()) as any;
    for (const p of people) {
      const pr = { event_id: eventId, household_id: saved.id, name: p.name, relation: p.relation ?? null, phone: p.phone ?? null, is_child: !!p.isChild };
      if (p.id) must(await sb().from('people').update(pr).eq('id', p.id));
      else if (p.name) must(await sb().from('people').insert({ ...pr, added_by: 'host' }));
    }
  },
  async deleteHousehold(eventId, householdId) {
    // Host-only RLS and foreign keys remove people, device links and RSVP history
    // atomically. Shared photos survive with their person_id cleared.
    const deleted = must(await sb().from('households').delete().eq('event_id', eventId).eq('id', householdId).select('id').maybeSingle());
    if (!deleted) throw new Error('Family not found or you do not have permission to delete it. Refresh the list and try again.');
  },
  async importHouseholds(eventId, households) {
    const { data, error } = await sb().rpc('import_households', { p_event: eventId, p_households: households });
    if (error) {
      if (error.code === 'PGRST202') throw new Error('Family import is not set up yet. Apply the 0004_import_households.sql database migration, then try again.');
      throw new Error(error.message);
    }
    return data as { created: number; skipped: number };
  },
  async setInviteStatus(householdId, status) {
    must(await sb().from('households').update({ invite_status: status }).eq('id', householdId).eq('invite_status', 'not_sent'));
  },
  async setPhoto(photoId, patch) { must(await sb().from('photos').update(patch).eq('id', photoId)); },
  async deletePhoto(photoId) {
    const row = must(await sb().from('photos').select('storage_path').eq('id', photoId).single()) as any;
    must(await sb().storage.from('photos').remove([row.storage_path]));
    must(await sb().from('photos').delete().eq('id', photoId));
  },
  async postAnnouncement(eventId, body) { must(await sb().from('announcements').insert({ event_id: eventId, body })); },
  async setPin(eventId, pin) { must(await sb().rpc('set_event_pin', { p_event: eventId, p_pin: pin })); }
};
