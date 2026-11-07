import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/noto-serif-kannada/400.css';
import '@fontsource/noto-sans-kannada/400.css';
import '@fontsource/noto-sans-kannada/500.css';
import '@fontsource/cormorant-garamond/400.css';
import Invitation from './Invitation';
import './stationery.css';

const WEDDING_DATE = new Date('2026-11-29T12:28:00+05:30');
const MAP_URL = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Shri Sharadamba Mangal Karyalaya, Hosapete Galli, Sulebhavi, Belagavi, Karnataka');

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [calendarSaved, setCalendarSaved] = useState(false);
  const [invitationOpen, setInvitationOpen] = useState(false);
  const dialogRef = useRef(null);
  const countdown = useCountdown();

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

  function saveCalendar() {
    const escape = (text) => text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Anand Sushmita//Wedding Invitation//KN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:anand-sushmita-20261129@wedding.invitation', 'DTSTAMP:20261107T000000Z',
      'DTSTART:20261129T065800Z',
      'SUMMARY:' + escape('ಆನಂದ ಮತ್ತು ಸುಶ್ಮಿತಾ — ಶುಭ ವಿವಾಹ'),
      'DESCRIPTION:' + escape('ಮಧ್ಯಾಹ್ನ 12:28ಕ್ಕೆ, ಅಭಿಜಿತ್ ಶುಭ ಲಗ್ನದ ಮುಹೂರ್ತದಲ್ಲಿ. ಸಹಕುಟುಂಬ ಸಮೇತರಾಗಿ ಆಗಮಿಸಿ ಆಶೀರ್ವದಿಸಿ.'),
      'LOCATION:' + escape('ಶ್ರೀ ಶಾರ್ದಾಂಬಾ ಮಂಗಲ ಕಾರ್ಯಾಲಯ, ಹೊಸಪೇಟೆ ಗಲ್ಲಿ, ಸುಳೇಭಾವಿ, ಬೆಳಗಾವಿ, ಕರ್ನಾಟಕ'),
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:ನಾಳೆ ಆನಂದ ಮತ್ತು ಸುಶ್ಮಿತಾ ಅವರ ಶುಭ ವಿವಾಹ', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ];
    // RFC 5545 folds calendar lines at 75 UTF-8 octets; Kannada uses multibyte characters.
    const encoder = new TextEncoder();
    const fold = (line) => {
      let result = '', part = '', length = 0;
      for (const character of line) {
        const bytes = encoder.encode(character).length;
        if (length + bytes > 75) { result += part + '\r\n'; part = ' '; length = 1; }
        part += character; length += bytes;
      }
      return result + part;
    };
    const url = URL.createObjectURL(new Blob([lines.map(fold).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ಆನಂದ-ಸುಶ್ಮಿತಾ-ವಿವಾಹ.ics';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setCalendarSaved(true);
    setTimeout(() => setCalendarSaved(false), 5000);
  }

  return <Invitation countdown={countdown} menuOpen={menuOpen} setMenuOpen={setMenuOpen} calendarSaved={calendarSaved} saveCalendar={saveCalendar} invitationOpen={invitationOpen} setInvitationOpen={setInvitationOpen} dialogRef={dialogRef} mapUrl={MAP_URL} />;
}

createRoot(document.getElementById('root')).render(<App />);
