import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/noto-sans-kannada/latin-400.css';
import '@fontsource/noto-sans-kannada/latin-500.css';
import '@fontsource/cormorant-garamond/latin-400.css';
import Invitation from './Invitation';
import InvitationOpening from './InvitationOpening';
import './stationery.css';

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

function App() {
  const [introActive, setIntroActive] = useState(() => !window.location.hash && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [menuOpen, setMenuOpen] = useState(false);
  const [invitationOpen, setInvitationOpen] = useState(false);
  const dialogRef = useRef(null);
  const countdown = useCountdown();
  const finishOpening = useCallback(() => setIntroActive(false), []);
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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (invitationOpen && !dialog.open) dialog.showModal();
    if (!invitationOpen && dialog.open) dialog.close();
    if (invitationOpen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [invitationOpen]);

  return <><div className="invitation-app" inert={introActive ? true : undefined} aria-hidden={introActive ? true : undefined}><Invitation countdown={countdown} menuOpen={menuOpen} setMenuOpen={setMenuOpen} invitationOpen={invitationOpen} setInvitationOpen={setInvitationOpen} dialogRef={dialogRef} mapUrl={MAP_URL} onReplayOpening={replayOpening} /></div>{introActive && <InvitationOpening onComplete={finishOpening} />}</>;
}

createRoot(document.getElementById('root')).render(<App />);
