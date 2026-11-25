export const POLL_CATEGORIES = [
  { id: 'duel', title: 'Anand vs Susmita', short: 'Who is more likely?', icon: 'M5 3l14 18M19 3L5 21M3 7l4-4M17 3l4 4' },
  { id: 'prediction', title: 'Predict Our Future', short: 'A little glimpse ahead', icon: 'M12 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M8 21h8M12 7v6m-3-3h6' },
  { id: 'quiz', title: 'Know the Couple', short: 'How well do you know us?', icon: 'M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0l-1 2H9z' },
  { id: 'photo', title: 'Photo Awards', short: 'Give your favourite a vote', icon: 'M3 6h18v14H3zM7 6l2-3h6l2 3M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8' },
] as const;
// Existing databases can still return retired categories. Only the four entries
// above are available in the app; keep their historical records compatible.
export type PollCategory = typeof POLL_CATEGORIES[number]['id'] | 'live' | 'secret' | 'words';
export const isPlaygroundCategory = (category: string) => POLL_CATEGORIES.some(item => item.id === category);
export type Poll = {
  id: string; category: PollCategory; kind: 'single' | 'multiple' | 'rating' | 'text';
  question: string; options: string[]; photoIds: string[]; photoPaths?: (string | null)[]; photoUrls?: (string | null)[];
  status: 'draft' | 'open' | 'closed'; startsAt: string | null; closesAt: string | null;
  revealAt: string | null; results: 'after_vote' | 'always' | 'closed'; pinned: boolean;
  mine: string[] | null; counts: number[] | null; total: number | null; words: { word: string; count: number }[];
  correct: number | null; coupleAnswers: string[] | null; provisional: boolean;
};
export type PollDraft = Omit<Poll, 'mine' | 'counts' | 'total' | 'words' | 'photoPaths' | 'photoUrls'>;
export type Team = { id: 'a' | 'b' | 'both'; members: number; points: number };
export type Playground = {
  polls: Poll[]; teams: Team[]; myTeam: Team['id'] | null;
  stats: { votes: number; voters: number; completed: number };
  pendingWords: { pollId: string; userId: string; question: string; word: string }[];
};
export const emptyPlayground = (): Playground => ({ polls: [], teams: [], myTeam: null, stats: { votes: 0, voters: 0, completed: 0 }, pendingWords: [] });
export function quizTitle(percent: number) {
  return percent >= 90 ? 'The Relationship Insider' : percent >= 70 ? 'The Certified Bestie' : percent >= 50 ? 'The Close Observer' : percent >= 25 ? 'The Professional Guesser' : 'Here for the Wedding Food';
}
