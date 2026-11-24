import type { CSSProperties } from 'react';
import type { ReactionKind } from '../lib/types';
import { REACTIONS } from '../lib/reactions';
import './reactions.css';

export default function ReactionEffect({ kind }: { kind: ReactionKind }) {
  const reaction = REACTIONS.find(r => r.id === kind)!;
  return <div className={`reaction-effect effect-${kind}`} data-reaction={kind} aria-hidden="true">
    <span className="reaction-center">{reaction.emoji}</span>
    {Array.from({ length: kind === 'love' ? 9 : 18 }, (_, i) => <span key={i} className="reaction-particle" style={{
      '--x': `${4 + i * (kind === 'love' ? 11 : 5.3)}%`, '--delay': `${(i % 6) * .045}s`,
      '--dx': `${Math.cos(i * 2.4) * (70 + i * 4)}px`, '--dy': `${Math.sin(i * 2.4) * (70 + i * 4)}px`, '--rotate': `${i * 47}deg`,
      '--particle-color': ['#e9a21b', '#a53051', '#6c956f', '#ad8ed1'][i % 4],
    } as CSSProperties}>{kind === 'love' ? '♥' : kind === 'wow' ? '✦' : ''}</span>)}
  </div>;
}
