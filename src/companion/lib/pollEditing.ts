import type { PollDraft } from './celebrationTypes';

export type PollSaveResult = { id: string; revised: boolean };

export function preparePollDraft(poll: PollDraft): PollDraft {
  return {
    id: poll.id, category: poll.category, kind: poll.kind, question: poll.question.trim(),
    options: poll.options.map(option => option.trim()).filter(Boolean),
    photoIds: poll.category === 'photo' ? [...poll.photoIds] : [],
    correct: poll.category === 'quiz' ? poll.correct : null,
    coupleAnswers: poll.category === 'secret' ? poll.coupleAnswers : null,
    status: poll.status, startsAt: poll.startsAt, closesAt: poll.closesAt, revealAt: poll.revealAt,
    results: poll.results, pinned: poll.pinned, provisional: poll.provisional,
  };
}

export function pollContentChanged(original: PollDraft, edited: PollDraft): boolean {
  const before = preparePollDraft(original), after = preparePollDraft(edited);
  return (['question', 'options', 'category', 'kind', 'photoIds', 'correct', 'coupleAnswers'] as const)
    .some(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}
