import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { nostalgiaAlbums, nostalgiaMemories, memoryImage, memorySrcSet, type NostalgiaMemory } from './nostalgiaMemories';
import './nostalgia.css';

type AlbumFilter = 'all' | NostalgiaMemory['person'];

function MemoryPhoto({ memory, sizes, eager = false }: { memory: NostalgiaMemory; sizes: string; eager?: boolean }) {
  return <img src={memoryImage(memory, 960)} srcSet={memorySrcSet(memory)} sizes={sizes}
    width={memory.width} height={memory.height} alt={memory.alt}
    loading={eager ? 'eager' : 'lazy'} decoding="async" />;
}

function MemoryViewer({ memories, initialIndex, onClose }: { memories: NostalgiaMemory[]; initialIndex: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [index, setIndex] = useState(initialIndex);
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

  return createPortal(<dialog ref={dialog} className="nostalgia-viewer" aria-labelledby="memory-viewer-title" aria-describedby="memory-viewer-description"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={event => {
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
        onTouchStart={event => { touch.current = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; }}
        onTouchEnd={event => {
          if (!touch.current || event.touches.length || !event.changedTouches.length) return;
          const dx = event.changedTouches[0].clientX - touch.current.x;
          const dy = event.changedTouches[0].clientY - touch.current.y;
          touch.current = null;
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
  const [filter, setFilter] = useState<AlbumFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const visibleMemories = nostalgiaMemories.filter(memory => filter === 'all' || memory.person === filter);
  const selectedIndex = visibleMemories.findIndex(memory => memory.id === selectedId);
  const heroMemories = [nostalgiaMemories[0], nostalgiaMemories.find(memory => memory.id === 'susmita-flowers')!];

  return <section className="nostalgia-page" lang="en" aria-labelledby="nostalgia-title">
    <header className="nostalgia-intro">
      <div className="nostalgia-intro-copy">
        <p className="general-eyebrow">Nostalgia · From our family albums</p>
        <h1 id="nostalgia-title">Before We <i>Said Yes</i></h1>
        <p className="nostalgia-intro-note">Two little worlds.<br />One story waiting to happen.</p>
        <p className="nostalgia-intro-description">Before the wedding outfits and the big day, there were birthday candles, family portraits and little adventures. Come take a look at where we began.</p>
        <a className="nostalgia-open-album" href="#nostalgia-album">Open the album <Icon size={17} d="M12 4v16M6 14l6 6 6-6" /></a>
      </div>
      <div className="nostalgia-cover" aria-label="A peek inside our childhood albums">
        <span className="nostalgia-cover-arc" aria-hidden="true" />
        {heroMemories.map(memory => <button type="button" className={`nostalgia-cover-photo nostalgia-cover-${memory.person.toLowerCase()}`} key={memory.id}
          aria-label={`Open ${memory.person}’s childhood portrait`} onClick={() => { setFilter('all'); setSelectedId(memory.id); }}>
          <MemoryPhoto memory={memory} sizes="(max-width: 560px) 42vw, (max-width: 900px) 24vw, 240px" eager />
          <span>Little {memory.person}</span>
        </button>)}
        <span className="nostalgia-cover-ampersand" aria-hidden="true">&amp;</span>
        <p className="nostalgia-cover-note">A little trip down memory lane</p>
      </div>
    </header>

    <div className="nostalgia-album" id="nostalgia-album">
      <div className="nostalgia-album-toolbar">
        <div><p className="general-eyebrow">The early chapters</p><h2>Small days. <i>Big memories.</i></h2></div>
        <div className="nostalgia-album-picker">
          <div className="nostalgia-filters" role="group" aria-label="Filter childhood albums">
            {(['all', 'Anand', 'Susmita'] as const).map(person => <button type="button" key={person} aria-pressed={filter === person} onClick={() => setFilter(person)}>{person === 'all' ? 'Both of us' : person}</button>)}
          </div>
          <p className="nostalgia-album-count" role="status">{visibleMemories.length} memories to wander through · Tap a photo to open</p>
        </div>
      </div>

      {nostalgiaAlbums.filter(album => filter === 'all' || album.person === filter).map(album => <section key={album.person} className="nostalgia-chapter" aria-labelledby={`nostalgia-${album.person.toLowerCase()}-title`}>
        <header className="nostalgia-chapter-heading">
          <span className="nostalgia-chapter-number" aria-hidden="true">{album.number}</span>
          <div><p className="general-eyebrow">{album.eyebrow}</p><h3 id={`nostalgia-${album.person.toLowerCase()}-title`}>{album.person}’s little world</h3><p>{album.description}</p></div>
          <span className="nostalgia-chapter-count">{nostalgiaMemories.filter(memory => memory.person === album.person).length} photographs</span>
        </header>
        <div className="nostalgia-memory-grid">
          {visibleMemories.filter(memory => memory.person === album.person).map((memory, index) => <button type="button" className="nostalgia-memory" key={memory.id}
            aria-label={`Open ${memory.person}: ${memory.title}`} onClick={() => setSelectedId(memory.id)}>
            <span className="nostalgia-memory-image"><MemoryPhoto memory={memory} sizes="(max-width: 560px) calc(100vw - 64px), (max-width: 900px) 43vw, 345px" />
              <span className="nostalgia-memory-expand" aria-hidden="true"><Icon size={17} d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" /></span>
            </span>
            <span className="nostalgia-memory-copy"><span className="nostalgia-memory-number">{String(index + 1).padStart(2, '0')}</span><span><strong>{memory.title}</strong><span>{memory.caption}</span></span></span>
          </button>)}
        </div>
      </section>)}
    </div>

    <footer className="nostalgia-closing">
      <span className="nostalgia-closing-line" aria-hidden="true" />
      <img src="/images/anand-susmita-invitation.jpg" width="112" height="140" alt="Anand and Susmita together" loading="lazy" />
      <p className="general-eyebrow">And then, our paths found each other</p>
      <h2>The next chapter? <i>Ours.</i></h2>
      <p>All those little moments brought us here.<br />We’re so happy you’re part of what comes next.</p>
      <Link to={base}>Back to the invitation <Icon size={16} d="M5 12h14M13 6l6 6-6 6" /></Link>
      <span className="nostalgia-signature">With love, Anand &amp; Susmita</span>
    </footer>
    {selectedIndex >= 0 && <MemoryViewer memories={visibleMemories} initialIndex={selectedIndex} onClose={() => setSelectedId(null)} />}
  </section>;
}
