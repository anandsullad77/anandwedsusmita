import './moment-tag.css';

export default function MomentTag({ label }: { label: string }) {
  return <span className="moment-tag"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 13l-7 7a2 2 0 0 1-3 0l-8-8V3h9l9 8a2 2 0 0 1 0 2z" /><circle cx="7" cy="7" r="1" /></svg><span>{label}</span></span>;
}
