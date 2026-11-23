import React from 'react';
import './wedding-links.css';

export default function WeddingLinks() {
  return <section className="wedding-links" aria-labelledby="wedding-links-title">
    <p className="eyebrow">Anand &amp; Susmita</p>
    <h2 id="wedding-links-title">Celebrate with us</h2>
    <p>Share your favourite moments, leave a blessing, and plan your family's visit.</p>
    <nav aria-label="Wedding companion">
      <a className="button button-primary" href="/invitation/feed">Feed</a>
      <a className="button button-outline" href="/rsvp">Family RSVP &amp; travel</a>
    </nav>
    <a className="wedding-host-link" href="/admin">Host sign in</a>
  </section>;
}
