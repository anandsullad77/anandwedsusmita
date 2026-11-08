import React from 'react';
import { Divider, Ganesha, Icon, Kolam, Monogram, Temple, TextileBorder } from './Ornaments';

export default function Invitation({ countdown, menuOpen, setMenuOpen, invitationOpen, setInvitationOpen, dialogRef, mapUrl, onReplayOpening }) {
  const closeMenu = () => setMenuOpen(false);

  return <>
    <a href="#main" className="skip-link">Skip to content</a>
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="#home" aria-label="Anand and Sushmita — home" onClick={closeMenu}><Monogram /></a>
        <nav className={menuOpen ? 'navigation is-open' : 'navigation'} aria-label="Main navigation" id="main-navigation">
          <div className="nav-group"><a href="#couple" onClick={closeMenu}>The Couple</a><a href="#muhurtha" onClick={closeMenu}>The Muhurta</a></div>
          <div className="nav-group"><a href="#venue" onClick={closeMenu}>The Venue</a><button className="nav-invitation" onClick={() => { setInvitationOpen(true); closeMenu(); }}>Invitation Card <Icon name="download" size={16} /></button></div>
        </nav>
        <div className="header-actions"><a className="header-directions" href={mapUrl} target="_blank" rel="noreferrer"><Icon name="pin" size={17} /><span>Get Directions</span></a><button className="menu-toggle" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? 'close' : 'menu'} size={25} /></button></div>
      </div>
    </header>

    <main id="main" tabIndex={-1}>
      <section className="hero" id="home" aria-labelledby="couple-names">
        <div className="hero-inset" aria-hidden="true" />
        <Kolam className="hero-corner corner-left" /><Kolam className="hero-corner corner-right" />
        <div className="hero-copy">
          <div className="blessings"><Ganesha /><p><span>With Lord Ganesha’s blessings</span></p></div>
          <p className="eyebrow hero-eyebrow">A Wedding Invitation</p>
          <h1 id="couple-names"><span>Anand</span><span className="names-join"><i />and<i /></span><span>Sushmita</span></h1>
          <p className="hero-message">Two hearts. One sacred bond.</p>
          <div className="hero-date"><span>29 November 2026</span><i /><span>Sunday</span><i /><span>12:28 PM</span></div>
          <a className="button button-primary" href="#muhurtha">View Wedding Details <Icon name="arrow" size={19} /></a>
        </div>
        <TextileBorder className="hero-border" />
      </section>

      <section className="invitation-section section-shell" id="couple" aria-labelledby="invitation-title">
        <div className="section-heading reveal"><Kolam className="heading-ornament" /><p className="eyebrow">With the blessings of our elders</p><h2 id="invitation-title">A Union Rooted in Love</h2><p className="invitation-intro">Kartika Krishna Paksha · Shaka 1948 · Parabhava Samvatsara</p></div>
        <div className="couple-details reveal">
          <article className="person person-groom"><span className="person-label">The Groom</span><h3><small>Chi.</small> Anand</h3><p>Mrs. Hema and<br />Mr. Vishnu Lakkappa Sullad</p><p className="person-detail">Their beloved son</p><Kolam className="person-ornament" /></article>
          <article className="person person-bride"><span className="person-label">The Bride</span><h3><small>Chi. Sou. Kan.</small> Sushmita</h3><p>Mrs. Poornima and<br />Mr. Ramaling Ramappa Pitagi</p><p className="person-detail">Their third daughter</p><Kolam className="person-ornament" /></article>
          <figure className="couple-portrait"><div className="portrait-window"><div className="portrait-frame"><img src="/images/wedding-couple-pink-green.png" alt="A South Indian bride and groom in traditional attire, holding hands among flowers" width="1254" height="1254" loading="lazy" decoding="async" /></div></div></figure>
        </div>
        <p className="invitation-note reveal">Join us with your family and bless our new beginning.</p>
        <Divider />
      </section>

      <section className="muhurtha-section" id="muhurtha" aria-labelledby="muhurtha-title">
        <div className="section-shell muhurtha-layout reveal">
          <div className="date-composition"><p className="eyebrow">Our Wedding Day</p><time className="wedding-date" dateTime="2026-11-29"><span className="date-day">Sunday</span><span className="big-date">29</span><span className="date-month"><span>November</span><span className="date-year">2026</span></span></time></div>
          <div className="ceremony-copy"><h2 id="muhurtha-title">The Wedding Muhurta</h2><div className="ceremony-time"><Icon name="clock" size={22} /><time dateTime="2026-11-29T12:28:00+05:30">12:28 PM</time></div><p className="muhurtha-caption">A beautiful beginning, blessed by your presence.</p></div>
          <div className="countdown-card" aria-labelledby="countdown-title"><div className="countdown-heading"><h3 id="countdown-title">{countdown.total > 0 ? 'Counting down' : 'Our journey has begun'}</h3></div>{countdown.total > 0 ? <div className="countdown" role="timer" aria-label="Time until our wedding">{[['days', 'Days'], ['hours', 'Hours'], ['minutes', 'Minutes'], ['seconds', 'Seconds']].map(([key, label]) => <div className="countdown-unit" key={key}><span className="countdown-number">{String(countdown[key]).padStart(2, '0')}</span><span className="countdown-label">{label}</span></div>)}</div> : <p className="married-message">May your love and blessings always be with us.</p>}</div>
        </div>
      </section>

      <section className="venue-section" id="venue" aria-labelledby="venue-title">
        <div className="section-shell venue-inner">
          <div className="venue-aside reveal"><p className="eyebrow">The Venue</p><span /><Kolam /></div>
          <div className="venue-copy reveal"><p className="eyebrow">Wedding Venue</p><h2 id="venue-title">Shri Shakambari<br />Mangal Karyalaya</h2><p className="venue-address">Hosakeri Galli, Sulebhavi,<br />Belagavi, Karnataka.</p><a href={mapUrl} target="_blank" rel="noreferrer" className="button button-outline">Get Directions <Icon name="external" size={17} /></a><p className="venue-hint">Opens in Google Maps</p></div>
          <div className="venue-illustration reveal"><Kolam className="venue-corner" /><Temple /></div>
        </div>
      </section>

    </main>

    <footer className="site-footer"><a href="#home" aria-label="Back to home"><Monogram className="footer-monogram" /></a><p className="footer-welcome">Your presence is our happiness.</p><a href="#home" className="footer-names">Anand <span>and</span> Sushmita</a><button className="replay-opening" onClick={onReplayOpening}><Icon name="arrow" size={14} />Open the invitation again</button><TextileBorder /></footer>

    <dialog className="invitation-dialog" ref={dialogRef} onCancel={() => setInvitationOpen(false)} onClose={() => setInvitationOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setInvitationOpen(false); }} aria-labelledby="dialog-title"><div className="dialog-content"><div className="dialog-header"><h2 id="dialog-title">Original Invitation · Kannada</h2><button className="icon-button" aria-label="Close invitation card" onClick={() => setInvitationOpen(false)}><Icon name="close" /></button></div>{invitationOpen && <img src="/images/original-invitation.jpeg" alt="The original printed Kannada wedding invitation for Anand and Sushmita" width="1204" height="1600" />}<a href="/images/original-invitation.jpeg" download="anand-sushmita-invitation.jpeg" className="button button-primary"><Icon name="download" size={18} />Download Invitation</a></div></dialog>
  </>;
}
