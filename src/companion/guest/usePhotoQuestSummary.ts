import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/backend';
import type { PhotoQuestSummary } from '../lib/types';
import { onQueueChange, pendingCount } from '../lib/uploadQueue';

export function usePhotoQuestSummary(eventId: string) {
  const [summary, setSummary] = useState<PhotoQuestSummary | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState(false);
  const alive = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    const [stats, queue] = await Promise.allSettled([api.photoQuestSummary(eventId), pendingCount(eventId)]);
    if (!alive.current || generation.current !== request) return;
    if (stats.status === 'fulfilled') { setSummary(stats.value); setError(false); } else setError(true);
    if (queue.status === 'fulfilled') setPending(queue.value);
  }, [eventId]);
  useEffect(() => {
    alive.current = true;
    let debounce: ReturnType<typeof setTimeout>;
    const update = () => { clearTimeout(debounce); debounce = setTimeout(() => void refresh(), 150); };
    void refresh();
    const off = onQueueChange(update);
    window.addEventListener('as-wedding-db', update);
    window.addEventListener('online', update);
    window.addEventListener('focus', update);
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 30_000);
    return () => { alive.current = false; generation.current++; off(); clearTimeout(debounce); clearInterval(timer); window.removeEventListener('as-wedding-db', update); window.removeEventListener('online', update); window.removeEventListener('focus', update); };
  }, [refresh]);
  return { summary, pending, error, refresh };
}
