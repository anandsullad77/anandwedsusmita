import type { ReactionKind } from '../lib/types';
import { REACTIONS } from '../lib/reactions';

export default function ReactionSymbol({ kind }: { kind: ReactionKind }) {
  if (kind !== 'akshate') return <>{REACTIONS.find(reaction => reaction.id === kind)?.emoji}</>;
  return <svg className="akshate-rice-icon" width="1em" height="1em" viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
    <g fill="#F4C34D" stroke="#B97A12" strokeWidth=".65">
      <ellipse cx="9" cy="10" rx="2.6" ry="6.2" transform="rotate(-32 9 10)" />
      <ellipse cx="22" cy="9" rx="2.5" ry="6" transform="rotate(28 22 9)" />
      <ellipse cx="16" cy="23" rx="2.7" ry="6.3" transform="rotate(12 16 23)" />
      <ellipse cx="26" cy="24" rx="2.1" ry="4.8" transform="rotate(42 26 24)" />
      <ellipse cx="5" cy="23" rx="2" ry="4.6" transform="rotate(-22 5 23)" />
    </g>
    <g stroke="#FFF2C4" strokeWidth=".9" strokeLinecap="round">
      <path d="M7.5 7.5 10 12M22.8 6.5 21 10M16.2 20 15.4 24.5" />
    </g>
  </svg>;
}
