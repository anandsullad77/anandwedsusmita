import React from 'react';
import { Divider, Ganesha, Icon, Kolam, Monogram, Temple, TextileBorder } from './Ornaments';

export default function Invitation({ countdown, menuOpen, setMenuOpen, calendarSaved, saveCalendar, invitationOpen, setInvitationOpen, dialogRef, mapUrl, onReplayOpening }) {
  const closeMenu = () => setMenuOpen(false);

  return <>
    <a href="#main" className="skip-link">ಮುಖ್ಯ ವಿಷಯಕ್ಕೆ ಹೋಗಿ</a>
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="#home" aria-label="ಆನಂದ ಮತ್ತು ಸುಶ್ಮಿತಾ — ಮುಖ್ಯಪುಟ" onClick={closeMenu}><Monogram /></a>
        <nav className={menuOpen ? 'navigation is-open' : 'navigation'} aria-label="ಮುಖ್ಯ ಸಂಚರಣೆ" id="main-navigation">
          <div className="nav-group"><a href="#couple" onClick={closeMenu}>ವಧು–ವರ</a><a href="#muhurtha" onClick={closeMenu}>ಶುಭ ಮುಹೂರ್ತ</a></div>
          <div className="nav-group"><a href="#venue" onClick={closeMenu}>ವಿವಾಹ ಸ್ಥಳ</a><button className="nav-invitation" onClick={() => { setInvitationOpen(true); closeMenu(); }}>ಆಮಂತ್ರಣ ಪತ್ರಿಕೆ <Icon name="download" size={16} /></button></div>
        </nav>
        <button className="menu-toggle" aria-label={menuOpen ? 'ಮೆನು ಮುಚ್ಚಿ' : 'ಮೆನು ತೆರೆಯಿರಿ'} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? 'close' : 'menu'} size={25} /></button>
      </div>
    </header>

    <main id="main" tabIndex={-1}>
      <section className="hero" id="home" aria-labelledby="couple-names">
        <div className="hero-inset" aria-hidden="true" />
        <Kolam className="hero-corner corner-left" /><Kolam className="hero-corner corner-right" />
        <div className="hero-copy">
          <div className="blessings"><Ganesha /><p><span>॥ ಶ್ರೀ ಗಣೇಶ ಪ್ರಸನ್ನ ॥</span><span>॥ ಶ್ರೀ ಶಾಂತಾದೇವಿ ಪ್ರಸನ್ನ ॥</span></p></div>
          <p className="eyebrow hero-eyebrow">ಶುಭ ವಿವಾಹ ಆಮಂತ್ರಣ</p>
          <h1 id="couple-names"><span>ಆನಂದ</span><span className="names-join"><i />ಮತ್ತು<i /></span><span>ಸುಶ್ಮಿತಾ</span></h1>
          <p className="hero-message">ಎರಡು ಮನಗಳು. ಒಂದು ಮಂಗಲ ಬಂಧನ.</p>
          <p className="hero-subtitle">ನಮ್ಮ ಬದುಕಿನ ಹೊಸ ಪಯಣಕ್ಕೆ ನಿಮ್ಮ ಪ್ರೀತಿ, ಆಶೀರ್ವಾದವೇ ಶುಭಾರಂಭ.</p>
          <div className="hero-date"><span>29 ನವೆಂಬರ್ 2026</span><i /><span>ರವಿವಾರ</span><i /><span>ಮಧ್ಯಾಹ್ನ 12:28ಕ್ಕೆ</span></div>
          <a className="button button-primary" href="#couple">ಪ್ರೀತಿಯ ಆಮಂತ್ರಣ <Icon name="arrow" size={19} /></a>
          <p className="hero-welcome">ನಿಮ್ಮ ಆಗಮನವೇ ನಮಗೆ ಸಂತಸದ ಸಂಭ್ರಮ</p>
        </div>
        <TextileBorder className="hero-border" />
      </section>

      <section className="invitation-section section-shell" id="couple" aria-labelledby="invitation-title">
        <div className="section-heading reveal"><Kolam className="heading-ornament" /><p className="eyebrow">ಗುರುಹಿರಿಯರ ಆಶೀರ್ವಾದದೊಂದಿಗೆ</p><h2 id="invitation-title">ಪ್ರೀತಿ ಬೆಸೆದ ಮಂಗಲ ಬಂಧನ</h2><p className="invitation-intro">ಶ್ರೀ ಶಾಲಿವಾಹನ ಶಕೆ 1948 ಪರಾಭವನಾಮ ಸಂವತ್ಸರದ ಕಾರ್ತಿಕ ಮಾಸ ಕೃಷ್ಣಪಕ್ಷದ ಶುಭ ದಿನದಂದು…</p></div>
        <div className="couple-details reveal">
          <article className="person person-groom"><span className="person-label">ವರ</span><h3><small>ಚಿ.</small> ಆನಂದ</h3><p>ಸೌ. ಹೇಮಾ ಮತ್ತು<br />ಶ್ರೀ ವಿಷ್ಣು ಲಕ್ಷ್ಮಣ ಸುಳ್ಕರ</p><p className="person-detail">ಇವರ ಸುಪುತ್ರ</p><Kolam className="person-ornament" /></article>
          <article className="person person-bride"><span className="person-label">ವಧು</span><h3><small>ಚಿ.ಸೌ.ಕಾಂ.</small> ಸುಶ್ಮಿತಾ</h3><p>ಸೌ. ಪೂರ್ಣಿಮಾ ಮತ್ತು<br />ಶ್ರೀ ರಾಮಲಿಂಗ ರಾಮಪ್ಪ ಓಟಗಿ</p><p className="person-detail">ಇವರ ತೃತೀಯ ಸುಪುತ್ರಿ</p><Kolam className="person-ornament" /></article>
          <figure className="couple-portrait"><div className="portrait-window"><div className="portrait-frame"><img src="/images/wedding-couple-pink-green.png" alt="ಕೈ ಹಿಡಿದು ಜೊತೆಯಾಗಿ ನಿಂತಿರುವ ಸಾಂಪ್ರದಾಯಿಕ ಉಡುಗೆಯ ವಧು ಮತ್ತು ವರರ ಚಿತ್ರಣ" width="1254" height="1254" /></div></div><figcaption>ಸಂಪ್ರದಾಯದ ಸೊಬಗು · ಪ್ರೀತಿಯ ಹೊಸ ಪಯಣ</figcaption></figure>
        </div>
        <p className="invitation-note reveal">ಇವರ ಶುಭ ವಿವಾಹವನ್ನು ನೆರವೇರಿಸಲು ಗುರುಹಿರಿಯರು ನಿಶ್ಚಯಿಸಿರುತ್ತಾರೆ.<br />ತಾವು ಈ ಮಂಗಲ ಕಾರ್ಯಕ್ಕೆ ಸಹಕುಟುಂಬ ಸಮೇತರಾಗಿ ಆಗಮಿಸಿ<br className="desktop-break" /> ವಧು–ವರರಿಗೆ ಆಶೀರ್ವದಿಸಬೇಕಾಗಿ ಪ್ರೀತಿಪೂರ್ವಕ ವಿನಂತಿ.</p>
        <Divider />
      </section>

      <section className="muhurtha-section" id="muhurtha" aria-labelledby="muhurtha-title">
        <div className="section-shell muhurtha-layout reveal">
          <div className="date-composition"><p className="eyebrow">ಶುಭ ದಿನಾಂಕ</p><span className="big-date">29</span><div className="date-side date-month"><p>ನವೆಂಬರ್</p><span>2026</span></div><span className="date-day">ರವಿವಾರ</span></div>
          <div className="ceremony-copy"><p className="eyebrow">ಒಂದು ದಿನ · ಜೀವನವಿಡೀ ನೆನಪು</p><h2 id="muhurtha-title">ಶುಭ ವಿವಾಹ ಮುಹೂರ್ತ</h2><div className="date-side ceremony-time"><Icon name="clock" size={22} /><p>ಮಧ್ಯಾಹ್ನ</p><span>12:28ಕ್ಕೆ</span></div><p className="muhurtha-caption">ಅಭಿಜಿತ್ ಶುಭ ಲಗ್ನದ ಮುಹೂರ್ತದಲ್ಲಿ</p><p className="ceremony-message">ನಿಮ್ಮ ದಿನಚರಿಯಲ್ಲಿ ಈ ದಿನ ನಮಗಾಗಿ ಮೀಸಲಿರಲಿ.<br />ನಿಮ್ಮ ಉಪಸ್ಥಿತಿಯಲ್ಲಿ ಈ ಕ್ಷಣ ಇನ್ನಷ್ಟು ಮಂಗಲಮಯ.</p><div className="muhurtha-bottom"><button className="button button-outline" onClick={saveCalendar}><Icon name={calendarSaved ? 'check' : 'calendar'} size={18} />{calendarSaved ? 'ಕ್ಯಾಲೆಂಡರ್ ಕಡತ ಉಳಿಸಲಾಗಿದೆ' : 'ದಿನಾಂಕ ಉಳಿಸಿಕೊಳ್ಳಿ'}</button><p className="calendar-hint" aria-live="polite">{calendarSaved ? 'ಡೌನ್‌ಲೋಡ್ ಆದ ಕಡತವನ್ನು ನಿಮ್ಮ ಕ್ಯಾಲೆಂಡರ್‌ನಲ್ಲಿ ತೆರೆಯಿರಿ.' : 'ನಿಮ್ಮ ಕ್ಯಾಲೆಂಡರ್‌ಗೆ ಸೇರಿಸಿಕೊಳ್ಳಿ'}</p></div></div>
        </div>
        <div className="countdown-section" aria-labelledby="countdown-title"><div className="section-shell countdown-layout reveal"><div className="countdown-heading"><p className="eyebrow">ಮಂಗಲ ಕ್ಷಣಗಳ ನಿರೀಕ್ಷೆಯಲ್ಲಿ</p><h2 id="countdown-title">{countdown.total > 0 ? 'ಆ ಶುಭ ದಿನಕ್ಕೆ ಇನ್ನೂ…' : 'ಮಂಗಲ ಪಯಣ ಆರಂಭವಾಗಿದೆ'}</h2></div>{countdown.total > 0 ? <div className="countdown" role="timer" aria-label="ವಿವಾಹದವರೆಗೆ ಉಳಿದ ಸಮಯ">{[['days', 'ದಿನಗಳು'], ['hours', 'ಗಂಟೆಗಳು'], ['minutes', 'ನಿಮಿಷಗಳು'], ['seconds', 'ಕ್ಷಣಗಳು']].map(([key, label]) => <div className="countdown-unit" key={key}><span className="countdown-number">{String(countdown[key]).padStart(2, '0')}</span><span className="countdown-label">{label}</span></div>)}</div> : <p className="married-message">ನಿಮ್ಮ ಪ್ರೀತಿ ಮತ್ತು ಆಶೀರ್ವಾದ ಸದಾ ನಮ್ಮೊಂದಿಗಿರಲಿ.</p>}</div></div>
      </section>

      <section className="venue-section" id="venue" aria-labelledby="venue-title">
        <div className="section-shell venue-inner">
          <div className="venue-aside reveal"><p className="eyebrow">ವಿವಾಹ ಸ್ಥಳ</p><span /><Kolam /></div>
          <div className="venue-copy reveal"><p className="eyebrow">ನಮ್ಮ ಮಂಗಲ ಸಂಭ್ರಮ ಇಲ್ಲಿ</p><h2 id="venue-title">ಶ್ರೀ ಶಾರ್ದಾಂಬಾ<br />ಮಂಗಲ ಕಾರ್ಯಾಲಯ</h2><p className="venue-address">ಹೊಸಪೇಟೆ ಗಲ್ಲಿ, ಸುಳೇಭಾವಿ,<br />ತಾ.ಜಿ. ಬೆಳಗಾವಿ, ಕರ್ನಾಟಕ.</p><a href={mapUrl} target="_blank" rel="noreferrer" className="button button-outline">ದಾರಿ ತಿಳಿಯಿರಿ <Icon name="external" size={17} /></a><p className="venue-hint">ಗೂಗಲ್ ನಕ್ಷೆಯಲ್ಲಿ ಸ್ಥಳವನ್ನು ವೀಕ್ಷಿಸಿ</p></div>
          <div className="venue-illustration reveal"><Kolam className="venue-corner" /><Temple /><p>ಶುಭ ಮಂಗಲ</p></div>
        </div>
      </section>

      <section className="family-section section-shell" aria-labelledby="family-title">
        <div className="family-card"><Kolam className="family-corner family-corner-left" /><Kolam className="family-corner family-corner-right" /><div className="section-heading reveal"><p className="eyebrow">ಪ್ರೀತಿಯಿಂದ ಕಾಯುತ್ತಿರುವವರು</p><h2 id="family-title">ತಮ್ಮ ಆಗಮನಾಭಿಲಾಷಿಗಳು</h2></div>
          <div className="hosts reveal"><p><span>ಸೌ. ವತ್ಸಲಾ ಮತ್ತು</span><span>ಶ್ರೀ ರಾಮಚಂದ್ರ ಲಕ್ಷ್ಮಣ ಸುಳ್ಕರ</span></p><p><span>ಸೌ. ಹೇಮಾ ಮತ್ತು</span><span>ಶ್ರೀ ವಿಷ್ಣು ಲಕ್ಷ್ಮಣ ಸುಳ್ಕರ</span></p><p><span>ಸೌ. ಲಕ್ಷ್ಮೀ ಮತ್ತು</span><span>ಶ್ರೀ ಮಹಾಂತೇಶ ಬಸಪ್ಪ ಹುಲ್ಯಾಳ</span></p></div>
          <Divider />
          <div className="extended-family reveal"><h3>ತಮ್ಮ ಸುಭಾಗಮನ ಬಯಸುವವರು</h3><p>ಸಮಸ್ತ ಸುಳ್ಕರ, ಓಟಗಿ, ಯಂಡೊಳ್ಳಿ, ಹುನಶ್ಯಾಳ,<br className="desktop-break" /> ಬಂಡಗಣೆ, ಪಾಟೀಲ, ತುಗಲಟ್ಟಿ ಬಂಧುಗಳು.</p><p>ಮತ್ತು ಸುಳೇಭಾವಿ ಗ್ರಾಮದ ದೇವಾಂಗ ಸಮಾಜದ<br className="desktop-break" /> ಗುರುಹಿರಿಯರು, ಆಪ್ತರು ಮತ್ತು ಮಿತ್ರರು.</p><p className="younger-hosts">ಬೀಳಗಿ ಆಮಂತ್ರಣ: ರೋಹಿತ್ ಮತ್ತು ರಾಘವೇಂದ್ರ</p></div>
        </div>
      </section>
    </main>

    <footer className="site-footer"><a href="#home" aria-label="ಮುಖ್ಯಪುಟಕ್ಕೆ ಮರಳಿ"><Monogram className="footer-monogram" /></a><p className="footer-welcome">ನಿಮ್ಮ ಉಪಸ್ಥಿತಿಯೇ ನಮ್ಮ ಸಂತೋಷ.</p><a href="#home" className="footer-names">ಆನಂದ <span>ಮತ್ತು</span> ಸುಶ್ಮಿತಾ</a><span className="footer-date">29 · 11 · 2026</span><button className="replay-opening" onClick={onReplayOpening}><Icon name="arrow" size={14} />ಆಮಂತ್ರಣವನ್ನು ಮತ್ತೆ ತೆರೆಯಿರಿ</button><p className="footer-blessing">ಪ್ರೀತಿ, ಸಂಪ್ರದಾಯ ಮತ್ತು ನಿಮ್ಮ ಆಶೀರ್ವಾದದೊಂದಿಗೆ</p><TextileBorder /></footer>

    <dialog className="invitation-dialog" ref={dialogRef} onCancel={() => setInvitationOpen(false)} onClose={() => setInvitationOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setInvitationOpen(false); }} aria-labelledby="dialog-title"><div className="dialog-content"><div className="dialog-header"><h2 id="dialog-title">ನಮ್ಮ ಆಮಂತ್ರಣ ಪತ್ರಿಕೆ</h2><button className="icon-button" aria-label="ಆಮಂತ್ರಣ ಪತ್ರಿಕೆ ಮುಚ್ಚಿ" onClick={() => setInvitationOpen(false)}><Icon name="close" /></button></div>{invitationOpen && <img src="/images/original-invitation.jpeg" alt="ಆನಂದ ಮತ್ತು ಸುಶ್ಮಿತಾ ಅವರ ಮೂಲ ಕನ್ನಡ ವಿವಾಹ ಆಮಂತ್ರಣ ಪತ್ರಿಕೆ" width="1204" height="1600" />}<a href="/images/original-invitation.jpeg" download="ಆನಂದ-ಸುಶ್ಮಿತಾ-ಆಮಂತ್ರಣ.jpeg" className="button button-primary"><Icon name="download" size={18} />ಪತ್ರಿಕೆ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ</a></div></dialog>
  </>;
}
