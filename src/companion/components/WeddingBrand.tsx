import './wedding-brand.css';

// Use the invitation's existing SVG artwork everywhere, rather than drawing
// another version of the AS mark in text or introducing a second logo.
export function WeddingMark({ className = '', size = 64 }: { className?: string; size?: number }) {
  return <img className={`wedding-mark ${className}`} src="/images/as-monogram.svg" alt="" aria-hidden="true" width={size} height={size} />;
}

export default function WeddingBrand({ className = '', tagline, title = 'Anand & Susmita' }: { className?: string; tagline?: string; title?: string }) {
  return <a href="/" className={`wedding-brand ${className}`} aria-label="Anand and Susmita — wedding invitation">
    <WeddingMark />
    <span className="wedding-brand-copy">{tagline && <small>{tagline}</small>}<b>{title}</b></span>
  </a>;
}

export function WeddingTextile() {
  return <div className="wedding-textile" aria-hidden="true" />;
}

export function WeddingSignoff() {
  return <footer className="wedding-signoff">
    <p>With love,</p>
    <a href="/" aria-label="Back to wedding invitation"><WeddingMark /></a>
    <WeddingTextile />
  </footer>;
}
