import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/noto-sans-kannada/latin-400.css';
import '@fontsource/noto-sans-kannada/latin-500.css';
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-400-italic.css';
import Invitation from './Invitation';
import InvitationOpening from './InvitationOpening';
import './stationery.css';
import WeddingLinks from './WeddingLinks';
import './registerSW';

const WEDDING_DATE = new Date('2026-11-29T12:28:00+05:30');
const MAP_URL = 'https://maps.app.goo.gl/CzVGfb7yyeYVoxam6';

function useCountdown() {
  const calculate = () => {
    const total = Math.max(0, WEDDING_DATE.getTime() - Date.now());
    return { total, days: Math.floor(total / 86400000), hours: Math.floor(total / 3600000) % 24, minutes: Math.floor(total / 60000) % 60, seconds: Math.floor(total / 1000) % 60 };
  };
  const [remaining, setRemaining] = useState(calculate);
  useEffect(() => {
    const interval = setInterval(() => setRemaining(calculate()), 1000);
    return () => clearInterval(interval);
  }, []);
  return remaining;
}

// The opening plays once per browser; the footer button can still replay it.
const OPENING_KEY = 'as-wedding-opening-seen';
function openingSeen() { try { return localStorage.getItem(OPENING_KEY) === '1'; } catch { return false; } }
function markOpeningSeen() { try { localStorage.setItem(OPENING_KEY, '1'); } catch { /* Private mode: replay next time. */ } }

function savedFamily() {
  try {
    const session = JSON.parse(localStorage.getItem('as-wedding-session') || 'null');
    return session?.slug === 'anand-susmita' && session.householdToken ? session : null;
  } catch { return null; }
}

function WelcomeBack() {
  const [family] = useState(savedFamily);
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem('as-wedding-welcome-hidden') === '1'; } catch { return false; } });
  if (!family || hidden) return null;
  const individual = family.invitationType === 'individual';
  return <aside className="welcome-back" aria-label="Continue in the wedding app">
    <div><p className="welcome-back-title">Welcome back</p><p>{individual ? 'Your RSVP, photos and wishes are in the app.' : 'Your family’s RSVP, photos and wishes are in the app.'}</p></div>
    <a className="welcome-back-open" href="/start">Open</a>
    <button type="button" className="welcome-back-close" aria-label="Hide" onClick={() => { try { sessionStorage.setItem('as-wedding-welcome-hidden', '1'); } catch { /* ignore */ } setHidden(true); }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  </aside>;
}

function App() {
  const [introActive, setIntroActive] = useState(() => !window.location.hash && !openingSeen() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [menuOpen, setMenuOpen] = useState(false);
  const countdown = useCountdown();
  const finishOpening = useCallback(() => { markOpeningSeen(); setIntroActive(false); }, []);
  const replayOpening = useCallback(() => {
    setMenuOpen(false);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    setIntroActive(true);
  }, []);

  useEffect(() => {
    const header = document.querySelector('.site-header');
    const updateHeaderHeight = () => document.documentElement.style.setProperty('--header-height', `${header.getBoundingClientRect().height}px`);
    updateHeaderHeight();
    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return <><div className="invitation-app" inert={introActive ? true : undefined} aria-hidden={introActive ? true : undefined}><Invitation countdown={countdown} menuOpen={menuOpen} setMenuOpen={setMenuOpen} mapUrl={MAP_URL} onReplayOpening={replayOpening} /><WeddingLinks /></div>{!introActive && <WelcomeBack />}{introActive && <InvitationOpening onComplete={finishOpening} />}</>;
}

createRoot(document.getElementById('root')).render(<App />);
