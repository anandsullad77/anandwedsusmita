import type { Photo, ReactionCounts, ReactionKind } from './types';

export const REACTIONS: { id: ReactionKind; label: string; emoji: string; color: string }[] = [
  { id: 'akshate', label: 'Blessings', emoji: '', color: '#9b6200' },
  { id: 'love', label: 'Love', emoji: '❤️', color: '#a53051' },
  { id: 'wow', label: 'Wow', emoji: '😮', color: '#8c620c' },
  { id: 'celebrate', label: 'Celebrate', emoji: '🎉', color: '#6850a1' },
];
export const emptyReactions = (): ReactionCounts => ({ akshate: 0, love: 0, wow: 0, celebrate: 0 });
export const isReaction = (value: unknown): value is ReactionKind => REACTIONS.some(r => r.id === value);

export function withReaction(photo: Photo, selected: ReactionKind | null): Photo {
  const counts = { ...photo.reactionCounts };
  if (photo.myReaction) counts[photo.myReaction] = Math.max(0, counts[photo.myReaction] - 1);
  if (selected) counts[selected]++;
  return { ...photo, myReaction: selected, reactionCounts: counts, mine: selected === 'akshate', akshate: counts.akshate };
}

export function reactionFields(reactions: Record<string, ReactionKind>, userId: string) {
  const counts = emptyReactions();
  for (const reaction of Object.values(reactions)) if (isReaction(reaction)) counts[reaction]++;
  const mine = reactions[userId] ?? null;
  return { reactionCounts: counts, myReaction: mine, akshate: counts.akshate, mine: mine === 'akshate' };
}
