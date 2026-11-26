import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { isPageZoomed, usePageZoom } from '../lib/usePageZoom';
import { nostalgiaAlbums, nostalgiaMemories, memoryImage, memorySrcSet, type NostalgiaMemory } from './nostalgiaMemories';
import './nostalgia.css';
import './nostalgia-album.css';

type AlbumFilter = NostalgiaMemory['person'];

const closingMemories = ['susmita-terrace', 'anand-birthday']
  .map(id => nostalgiaMemories.find(memory => memory.id === id))
  .filter((memory): memory is NostalgiaMemory => memory !== undefined);

function MemoryPhoto({ memory, sizes, eager = false }: { memory: NostalgiaMemory; sizes: string; eager?: boolean }) {
  return <img src={memoryImage(memory, 960)} srcSet={memorySrcSet(memory)} sizes={sizes}
    width={memory.width} height={memory.height} alt={memory.alt}
    loading={eager ? 'eager' : 'lazy'} decoding="async" />;
}

function MemoryViewer({ memories, initialIndex, onClose }: { memories: NostalgiaMemory[]; initialIndex: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [index, setIndex] = useState(initialIndex);
  const zoomed = usePageZoom();
  const memory = memories[index];
  const move = (direction: number) => setIndex(current => (current + direction + memories.length) % memories.length);

  useEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      opener?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    for (const offset of [-1, 1]) {
      const image = new Image();
      image.src = memoryImage(memories[(index + offset + memories.length) % memories.length]);
    }
    dialog.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [index, memories]);

  return createPortal(<dialog ref={dialog} className={`nostalgia-viewer${zoomed ? ' is-page-zoomed' : ''}`} aria-labelledby="memory-viewer-title" aria-describedby="memory-viewer-description"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={event => {
      if (isPageZoomed()) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
      if (event.key === 'Home') { event.preventDefault(); setIndex(0); }
      if (event.key === 'End') { event.preventDefault(); setIndex(memories.length - 1); }
    }}>
    <div className="nostalgia-viewer-inner">
      <header className="nostalgia-viewer-top">
        <span>FROM OUR FAMILY ALBUMS</span>
        <button type="button" autoFocus onClick={onClose} aria-label="Close photo viewer"><Icon d="M6 6l12 12M6 18L18 6" /></button>
      </header>
      <div className="nostalgia-viewer-stage"
        onTouchStart={event => { touch.current = event.touches.length === 1 && !isPageZoomed() ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; }}
        onTouchMove={event => { if (event.touches.length !== 1 || isPageZoomed()) touch.current = null; }}
        onTouchEnd={event => {
          const start = touch.current;
          touch.current = null;
          if (!start || isPageZoomed() || event.touches.length || event.changedTouches.length !== 1) return;
          const dx = event.changedTouches[0].clientX - start.x;
          const dy = event.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) move(dx < 0 ? 1 : -1);
        }} onTouchCancel={() => { touch.current = null; }}>
        <img key={memory.id} src={memoryImage(memory)} width={memory.width} height={memory.height} alt={memory.alt} />
      </div>
      <div className="nostalgia-viewer-details">
        <button type="button" onClick={() => move(-1)} aria-label="Previous photo"><Icon d="M15 5l-7 7 7 7" /></button>
        <div aria-live="polite" aria-atomic="true">
          <p className="nostalgia-viewer-count">{memory.person}’s album · {index + 1} of {memories.length}</p>
          <h2 id="memory-viewer-title">{memory.title}</h2>
          <p id="memory-viewer-description">{memory.caption}</p>
        </div>
        <button type="button" onClick={() => move(1)} aria-label="Next photo"><Icon d="M9 5l7 7-7 7" /></button>
      </div>
      <div className="nostalgia-filmstrip" role="group" aria-label="Choose a memory">
        {memories.map((item, itemIndex) => <button type="button" key={item.id} aria-label={`View ${item.person}: ${item.title}`}
          aria-pressed={itemIndex === index} onClick={() => setIndex(itemIndex)}>
          <img src={memoryImage(item, 480)} width={item.width} height={item.height} alt="" loading="lazy" />
        </button>)}
      </div>
    </div>
  </dialog>, document.body);
}

export default function NostalgiaPage({ base }: { base: string }) {
  const [filter, setFilter] = useState<AlbumFilter>('Anand');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const visibleMemories = nostalgiaMemories.filter(memory => memory.person === filter);
  const selectedIndex = visibleMemories.findIndex(memory => memory.id === selectedId);

  return <section className="nostalgia-page nostalgia-album-page" lang="en" aria-labelledby="nostalgia-title">
    <header className="nostalgia-head">
      <h1 id="nostalgia-title">Before we <i>said yes</i></h1>
      <p>Birthday candles, family portraits and little adventures. Where Anand and Susmita began.</p>
      <div className="nostalgia-switch" role="group" aria-label="Show">
        {nostalgiaAlbums.map(({ person }) => <button type="button" key={person} aria-pressed={filter === person} onClick={() => setFilter(person)}>{person}</button>)}
      </div>
    </header>

    {nostalgiaAlbums.filter(album => album.person === filter).map(album => {
      const memories = visibleMemories.filter(memory => memory.person === album.person);
      return <section key={album.person} className="nostalgia-set" aria-labelledby={`nostalgia-${album.person.toLowerCase()}-title`}>
        <div className="nostalgia-set-head"><h2 id={`nostalgia-${album.person.toLowerCase()}-title`}>{album.person}’s little world</h2><span>{memories.length} photos</span></div>
        {/* Each frame takes the photo's own shape, so nothing is cropped. */}
        <div className="nostalgia-masonry">
          {memories.map(memory => <button type="button" className="nostalgia-tile" key={memory.id}
            aria-label={`Open ${memory.person}: ${memory.title}`} onClick={() => setSelectedId(memory.id)}>
            <span className="nostalgia-tile-frame" style={{ aspectRatio: `${memory.width} / ${memory.height}` }}>
              <MemoryPhoto memory={memory} sizes="(max-width: 767px) calc(50vw - 30px), 240px" />
            </span>
            <span className="nostalgia-tile-title">{memory.title}</span>
          </button>)}
        </div>
      </section>;
    })}

    <footer className="nostalgia-end">
      <p className="nostalgia-end-eyebrow">Two little worlds</p>
      <div className="nostalgia-together">
        {closingMemories.map(memory => <figure key={memory.id} className={`nostalgia-together-${memory.person.toLowerCase()}`}>
          <MemoryPhoto memory={memory} sizes="(max-width: 655px) calc(50vw - 24px), 304px" />
          <figcaption>Little {memory.person}</figcaption>
        </figure>)}
      </div>
      <h2>The next chapter? <i>Ours.</i></h2>
      <p>Her sunny afternoons. His birthday candles. Two childhoods full of family, laughter and love, now becoming one story.</p>
      <p className="nostalgia-end-note">We’re so happy you’re part of what comes next.</p>
      <Link to={base}>Back to the invitation <Icon size={16} d="M5 12h14M13 6l6 6-6 6" /></Link>
    </footer>
    {selectedIndex >= 0 && <MemoryViewer memories={visibleMemories} initialIndex={selectedIndex} onClose={() => setSelectedId(null)} />}
  </section>;
}
