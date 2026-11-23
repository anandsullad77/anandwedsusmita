import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { initialPhotoQuests, PHOTO_QUESTS, pickPhotoQuests, stashQuestPhotos, type PhotoQuest } from '../lib/photoQuests';
import { Icon } from './Icon';
import MomentTag from './MomentTag';
import { usePhotoQuestSummary } from './usePhotoQuestSummary';
import './photo-quests.css';
import { useGuestAuth } from '../lib/useGuestAuth';

export default function PhotoQuests({ eventId, base, showCollections }: { eventId: string; base: string; showCollections: boolean }) {
  const { canAccess } = useGuestAuth();
  const [featured, setFeatured] = useState(() => initialPhotoQuests(eventId));
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'heartfelt' | 'playful' | 'easy'>('all');
  const { summary, pending, error, refresh } = usePhotoQuestSummary(eventId);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const selected = useRef<PhotoQuest | null>(null);
  const nav = useNavigate();
  useEffect(() => {
    try { localStorage.setItem(`as-wedding-photo-quests:${eventId}`, JSON.stringify(featured.map(q => q.id))); } catch { /* The quests remain usable without storage. */ }
  }, [eventId, featured]);
  const pick = (quest: PhotoQuest, source: 'camera' | 'gallery') => {
    if (!canAccess) { nav(`${base}/create?type=photos&quest=${encodeURIComponent(quest.id)}`); return; }
    selected.current = quest;
    (source === 'camera' ? camera : gallery).current?.click();
  };
  const continueUpload = (files: FileList | null) => {
    const quest = selected.current;
    const images = Array.from(files ?? []).filter(f => f.type.startsWith('image/'));
    if (!quest || !images.length) return;
    const draft = stashQuestPhotos(eventId, quest.id, images);
    nav(`${base}/create?type=photos&quest=${encodeURIComponent(quest.id)}&draft=${encodeURIComponent(draft)}`);
  };
  const card = (quest: PhotoQuest, compact = false) => <article className={`photo-quest-card ${compact ? 'quest-card-compact' : ''}`} key={quest.id} data-quest-id={quest.id} aria-label={quest.title}>
    <div className="quest-card-top"><span className={`quest-mood ${quest.mood}`}><Icon size={14} d={quest.mood === 'heartfelt' ? 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z' : 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3z'} />{quest.mood === 'heartfelt' ? 'Heartfelt' : 'Playful'}{quest.easy && ' · Easy'}</span>{summary?.completedQuestIds.includes(quest.id) && <span className="quest-complete"><Icon size={13} d="M5 12l4 4L19 6" />Memory added</span>}</div>
    <h3>{quest.title}</h3><p>{quest.prompt}</p><MomentTag label={quest.tag} />
    <div className="quest-card-actions"><button className="btn btn-deep" onClick={() => pick(quest, 'camera')}><Icon size={16} d="M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />Take photo</button><button className="btn btn-ghost" onClick={() => pick(quest, 'gallery')}>Choose from gallery</button></div>
    {showCollections && <Link className="quest-collection-link" to={`${base}/feed?quest=${quest.id}`}>View collection{summary?.counts[quest.id] ? ` · ${summary.counts[quest.id]}` : ''}<Icon size={14} d="M5 12h14m-6-6l6 6-6 6" /></Link>}
  </article>;
  const all = PHOTO_QUESTS.filter(q => filter === 'all' || (filter === 'easy' ? q.easy : q.mood === filter));
  return <section id="photo-quests" tabIndex={-1} className="general-section photo-quests" aria-labelledby="photo-quests-title" lang="en">
    <div className="photo-quests-heading"><div className="general-section-heading"><p className="general-eyebrow">A little heart. A little fun.</p><h2 id="photo-quests-title">Your next little memory</h2><p>Choose a photo quest and help tell the story of the day.</p></div><button className="btn btn-ghost quest-surprise" onClick={() => { setFeatured(pickPhotoQuests(featured.map(q => q.id))); setNotice('Three fresh quests: one heartfelt, one playful, and one easy.'); }}><Icon size={18} d="M4 7h3l10 10h3M16 4l4 3-4 3M4 17h3l4-4M14 7h6M16 14l4 3-4 3" />Surprise me</button></div>
    <div className="quest-personal-progress" aria-live="polite">{summary ? summary.contributions > 0 ? <><Icon size={18} d="M5 12l4 4L19 6" /><span>You’ve added <b>{summary.contributions} {summary.contributions === 1 ? 'memory' : 'memories'}</b> to their story.</span></> : <span>Your first memory could be someone’s favourite.</span> : <span>{!canAccess ? 'Sign in to keep track of your photo quests.' : error ? 'Your contribution count is temporarily unavailable.' : 'Gathering your memories…'}</span>}{error && <button onClick={() => void refresh()}>Retry count</button>}</div>
    {pending > 0 && <p className="quest-pending" role="status">{pending} {pending === 1 ? 'photo is' : 'photos are'} saved on this device, waiting to share.</p>}
    <p className="quest-swipe-hint">Three ideas to start · swipe to explore</p>
    <div className="photo-quest-featured">{featured.map(q => card(q))}</div>
    {notice && <p className="quest-shuffle-notice" role="status">{notice}</p>}
    <details className="quest-catalog"><summary>Browse all 12 quests <Icon size={16} d="M6 9l6 6 6-6" /></summary><div className="quest-catalog-filters" role="group" aria-label="Quest moods">{(['all', 'heartfelt', 'playful', 'easy'] as const).map(mood => <button key={mood} className="chip" aria-pressed={filter === mood} onClick={() => setFilter(mood)}>{mood === 'all' ? 'All quests' : mood === 'heartfelt' ? 'Heartfelt' : mood === 'playful' ? 'Playful' : 'Easy'}</button>)}</div><div className="photo-quest-catalog-grid">{all.map(q => card(q, true))}</div></details>
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label="Take a quest photo" onChange={e => { continueUpload(e.target.files); e.target.value = ''; }} />
    <input ref={gallery} type="file" accept="image/*" multiple hidden aria-label="Choose quest photos" onChange={e => { continueUpload(e.target.files); e.target.value = ''; }} />
  </section>;
}
