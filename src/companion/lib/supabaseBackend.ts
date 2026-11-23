// Supabase backend — talks to the schema in supabase/migrations/0001_init.sql.
// Guests use anonymous auth (a silent device session). Hosts use email/password.
import { supabase as sb } from './supabaseClient';
import type { AdminData, AdminHousehold, Backend, EventInfo, GeneralInviteBundle, GeneralInvitationSettings, Household, Person, Photo, PhotoQuestSummary, Wish } from './types';
import { defaultGeneralSettings, normalizeGeneralSettings, validateGeneralSettings, validateWish } from './generalInvitation';
import { photoQuest } from './photoQuests';

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

async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!paths.length) return m;
  const { data } = await sb().storage.from('photos').createSignedUrls(paths, 5 * 60);
  for (const d of data ?? []) if (d.path && d.signedUrl) m.set(d.path, d.signedUrl);
  return m;
}

async function photosFor(eventId: string, includeHidden: boolean, questId?: string): Promise<Photo[]> {
  let q = sb().from('photos').select('*').eq('event_id', eventId);
  if (!includeHidden) q = q.eq('hidden', false);
  if (questId) q = q.eq('quest_id', questId);
  const rows = must(await q.order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(200)) as any[];
  const ids = rows.map(r => r.id);
  const ak = ids.length ? must(await sb().from('akshate').select('photo_id,user_id').in('photo_id', ids)) as any[] : [];
  const flags = includeHidden && ids.length ? must(await sb().from('photo_flags').select('photo_id').in('photo_id', ids)) as any[] : [];
  const me = (await sb().auth.getUser()).data.user?.id;
  const device = me ? must(await sb().from('devices').select('person_id').eq('event_id', eventId).eq('user_id', me).maybeSingle()) as { person_id: string } | null : null;
  const urls = await signedUrls(rows.map(r => r.storage_path));
  return rows.map(r => ({
    id: r.id, uploaderName: r.uploader_name, moment: r.moment, questId: r.quest_id, caption: r.caption, createdAt: r.created_at, pinned: r.pinned, hidden: r.hidden, flags: includeHidden ? flags.filter(f => f.photo_id === r.id).length : undefined,
    akshate: ak.filter(a => a.photo_id === r.id).length, mine: ak.some(a => a.photo_id === r.id && a.user_id === me),
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
    const settings = normalizeGeneralSettings({ welcomeMessage: data.welcome_message, coverPath: data.cover_path, coverUrl: null, sections: data.sections });
    if (settings.coverPath) {
      const signed = must(await sb().storage.from('invitation-covers').createSignedUrl(settings.coverPath, 7 * 86400));
      if (!signed) throw new Error('Could not load the invitation cover.');
      settings.coverUrl = signed.signedUrl;
    }
    return settings;
  },
  async saveGeneralSettings(eventId, settings, cover) {
    validateGeneralSettings(settings);
    let coverPath = settings.coverPath;
    let uploaded: string | null = null;
    if (cover) {
      if (cover.size > 2 * 1024 * 1024 || !['image/webp', 'image/png', 'image/jpeg'].includes(cover.type)) throw new Error('Use a JPG, PNG or WebP cover smaller than 2 MB.');
      const extension = cover.type === 'image/jpeg' ? 'jpg' : cover.type === 'image/png' ? 'png' : 'webp';
      uploaded = `${eventId}/${crypto.randomUUID()}.${extension}`;
      must(await sb().storage.from('invitation-covers').upload(uploaded, cover, { contentType: cover.type }));
      coverPath = uploaded;
    }
    try {
      must(await sb().rpc('save_general_invitation_settings', { p_event: eventId, p_welcome: settings.welcomeMessage.trim(), p_cover: coverPath, p_sections: settings.sections }));
    } catch (e) {
      if (uploaded) await sb().storage.from('invitation-covers').remove([uploaded]);
      throw e;
    }
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
  async listPhotos(eventId, options) { return photosFor(eventId, !!options?.includeHidden, options?.questId); },
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
  async toggleAkshate(photoId) {
    const me = (await sb().auth.getUser()).data.user?.id;
    const existing = must(await sb().from('akshate').select('photo_id').eq('photo_id', photoId).eq('user_id', me!)) as any[];
    if (existing.length) must(await sb().from('akshate').delete().eq('photo_id', photoId).eq('user_id', me!));
    else must(await sb().from('akshate').insert({ photo_id: photoId, user_id: me }));
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
  async importHouseholds(eventId, households) {
    const { data, error } = await sb().rpc('import_households', { p_event: eventId, p_households: households });
    if (error) {
      if (error.code === 'PGRST202') throw new Error('Excel import is not set up yet. Apply the 0004_import_households.sql database migration, then try again.');
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
