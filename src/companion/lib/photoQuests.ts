export type PhotoQuest = { id: string; title: string; prompt: string; tag: string; mood: 'heartfelt' | 'playful'; easy: boolean };

export const PHOTO_QUESTS: readonly PhotoQuest[] = [
  { id: 'proud-moment', title: 'A Proud Moment', prompt: 'Capture a parent’s smile as they watch the celebration.', tag: 'Proud Moments', mood: 'heartfelt', easy: true },
  { id: 'generations-together', title: 'Generations Together', prompt: 'Bring three generations together in one frame.', tag: 'Generations', mood: 'heartfelt', easy: false },
  { id: 'reunited', title: 'Reunited', prompt: 'Find old friends sharing a smile after time apart.', tag: 'Reunited', mood: 'heartfelt', easy: false },
  { id: 'hug-to-remember', title: 'A Hug to Remember', prompt: 'Save a warm embrace between people who matter to each other.', tag: 'Hugs to Remember', mood: 'heartfelt', easy: false },
  { id: 'behind-celebration', title: 'Behind the Celebration', prompt: 'Notice someone quietly helping make the day special.', tag: 'Behind the Celebration', mood: 'heartfelt', easy: false },
  { id: 'for-the-couple', title: 'For the Couple', prompt: 'Photograph something lovely the couple might otherwise miss.', tag: 'For the Couple', mood: 'heartfelt', easy: true },
  { id: 'dance-floor-hero', title: 'Dance Floor Hero', prompt: 'Catch someone showing off their signature dance move.', tag: 'Dance Floor Heroes', mood: 'playful', easy: false },
  { id: 'outfit-twins', title: 'Outfit Twins', prompt: 'Find matching colours or outfits and strike a pose together.', tag: 'Outfit Twins', mood: 'playful', easy: true },
  { id: 'big-selfie', title: 'The Big Selfie', prompt: 'Gather a group and fit those happy faces into one selfie.', tag: 'Group Selfies', mood: 'playful', easy: false },
  { id: 'then-and-now', title: 'Then & Now', prompt: 'Recreate an old photograph with the same people, today.', tag: 'Then & Now', mood: 'playful', easy: false },
  { id: 'little-scene-stealer', title: 'Little Scene-Stealer', prompt: 'Capture a child’s funniest or most delightful moment.', tag: 'Little Scene-Stealers', mood: 'playful', easy: false },
  { id: 'sweet-tooth', title: 'Sweet Tooth', prompt: 'Give your favourite wedding sweet a little photo moment.', tag: 'Oota Moments', mood: 'playful', easy: true },
];

export const photoQuest = (id: string | null | undefined) => PHOTO_QUESTS.find(q => q.id === id);

// Reserve an easy prompt first so all three can be fresh, even after a shuffle.
export function pickPhotoQuests(previous: readonly string[] = []): PhotoQuest[] {
  const picked: PhotoQuest[] = [];
  const choose = (pool: readonly PhotoQuest[]) => {
    const available = pool.filter(q => !picked.some(p => p.id === q.id));
    const fresh = available.filter(q => !previous.includes(q.id));
    const choices = fresh.length ? fresh : available;
    const quest = choices[Math.floor(Math.random() * choices.length)];
    picked.push(quest);
    return quest;
  };
  const easy = choose(PHOTO_QUESTS.filter(q => q.easy));
  const heartfelt = choose(PHOTO_QUESTS.filter(q => q.mood === 'heartfelt'));
  const playful = choose(PHOTO_QUESTS.filter(q => q.mood === 'playful'));
  return [heartfelt, playful, easy];
}

export function initialPhotoQuests(eventId: string): PhotoQuest[] {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(`as-wedding-photo-quests:${eventId}`) ?? 'null');
    if (Array.isArray(ids) && ids.length === 3 && new Set(ids).size === 3) {
      const quests = ids.map(id => photoQuest(id));
      if (quests.every(q => !!q) && quests[0]!.mood === 'heartfelt' && quests[1]!.mood === 'playful' && quests[2]!.easy) return quests as PhotoQuest[];
    }
  } catch { /* A fresh selection also works when browser storage is unavailable. */ }
  return pickPhotoQuests();
}

type QuestDraft = { eventId: string; questId: string; files: File[]; at: number };
const drafts = new Map<string, QuestDraft>();
// Keep files in memory until the uploader mounts; picking a photo does not post it.
export function stashQuestPhotos(eventId: string, questId: string, files: File[]): string {
  const id = crypto.randomUUID();
  for (const [key, draft] of drafts) if (Date.now() - draft.at > 30 * 60_000) drafts.delete(key);
  if (drafts.size >= 3) drafts.delete(drafts.keys().next().value!);
  drafts.set(id, { eventId, questId, files: files.slice(0, 10), at: Date.now() });
  return id;
}
export function questDraftFiles(id: string | null, eventId: string, questId: string | null): File[] {
  const draft = id ? drafts.get(id) : undefined;
  return draft && draft.eventId === eventId && draft.questId === questId && Date.now() - draft.at < 30 * 60_000 ? draft.files : [];
}
export function clearQuestDraft(id: string | null) { if (id) drafts.delete(id); }
