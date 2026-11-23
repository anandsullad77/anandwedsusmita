import { useEffect, type RefObject } from 'react';

// Keyboards can shrink the visible area without changing CSS viewport units.
export function useVisibleViewport(ref: RefObject<HTMLElement | null>, restingBottom = 0, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const measure = () => {
      const zoomed = viewport && Math.abs(viewport.scale - 1) > .01;
      const height = !zoomed && viewport ? viewport.height : window.innerHeight;
      const bottom = !zoomed && viewport ? Math.max(0, window.innerHeight - height - viewport.offsetTop) : 0;
      ref.current?.style.setProperty('--visible-height', `${Math.round(height)}px`);
      ref.current?.style.setProperty('--keyboard-bottom', `${Math.round(bottom)}px`);
      ref.current?.style.setProperty('--controls-bottom', `${Math.round(bottom > 0 ? bottom : restingBottom)}px`);
    };
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ref, restingBottom, enabled]);
}
