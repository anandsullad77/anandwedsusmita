import React, { useEffect, useRef, useState } from 'react';
import { Kolam } from './Ornaments';
import './opening.css';

const PETALS = [
  [-28, 28, -145], [24, 36, 130], [-19, 43, -220], [32, 19, 195],
  [-34, 12, -100], [17, 47, 260], [-9, 49, -180], [29, 42, 155],
  [-36, 24, -235], [36, 30, 215], [-24, 38, -165], [12, 34, 290],
  [-14, 27, -275], [27, 16, 175], [-31, 46, -125], [7, 51, 245],
  [-5, 36, -205], [34, 48, 320], [-38, 18, -185], [20, 25, 140],
  [-22, 52, -310], [39, 39, 270], [-12, 44, -150], [15, 54, 190],
  [-30, 34, -260], [31, 25, 235], [-3, 53, -195], [23, 49, 305],
];

export default function InvitationOpening({ onComplete }) {
  const [phase, setPhase] = useState('sealed');
  const openingRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const timers = [];
    let cancelled = false;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (scrollbarWidth > 0) {
      const currentPadding = parseFloat(getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';
    openingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });

    const finishOnReducedMotion = () => { if (motion.matches) onComplete(); };
    const handleKeys = (event) => {
      if (event.key === 'Escape') onComplete();
      if (event.key === 'Tab') {
        event.preventDefault();
        openingRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', handleKeys);
    motion.addEventListener('change', finishOnReducedMotion);

    // Let the invitation fonts settle, with a short ceiling so this never blocks entry.
    const ready = Promise.race([
      document.fonts?.ready ?? Promise.resolve(),
      new Promise((resolve) => timers.push(setTimeout(resolve, 600))),
    ]);
    ready.then(() => {
      if (cancelled) return;
      timers.push(setTimeout(() => setPhase('opening'), 600));
      timers.push(setTimeout(() => setPhase('revealing'), 2150));
      timers.push(setTimeout(onComplete, 2850));
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.removeEventListener('keydown', handleKeys);
      motion.removeEventListener('change', finishOnReducedMotion);
      document.getElementById('main')?.focus({ preventScroll: true });
    };
  }, [onComplete]);

  return <div ref={openingRef} className={`invitation-opening is-${phase}`} role="dialog" aria-modal="true" aria-labelledby="opening-label" tabIndex={-1}>
    <div className="opening-scene">
      <p className="opening-kicker" id="opening-label">With love, for you</p>
      <div className="opening-perspective" aria-hidden="true">
        <div className="opening-card">
          <div className="opening-cover opening-cover-left"><div className="opening-cover-rule" /><Kolam className="opening-cover-ornament" /><div className="opening-cover-border" /></div>
          <div className="opening-cover opening-cover-right"><div className="opening-cover-rule" /><Kolam className="opening-cover-ornament" /><div className="opening-cover-border" /></div>
          <p className="opening-cover-title">A Wedding Invitation</p>
          <p className="opening-cover-date">29 November 2026</p>
          <div className="opening-seal"><span className="opening-seal-ring" /><span className="opening-seal-monogram" /></div>

          <div className="opening-petals">{PETALS.map(([x, y, rotation], index) => <span key={index} style={{ '--petal-x': `${x}vmin`, '--petal-y': `${y}vmin`, '--petal-rotation': `${rotation}deg`, '--petal-delay': `${160 + index * 245 / (PETALS.length - 1)}ms` }} />)}</div>
        </div>
      </div>
      <div className="opening-message"><div className="opening-progress" aria-hidden="true"><span /></div><p className="opening-status" role="status">Opening your invitation…</p></div>
    </div>
  </div>;
}
