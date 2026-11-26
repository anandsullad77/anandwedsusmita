import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { WeddingMark } from '../components/WeddingBrand';
import '../styles/base.css';
import './legal.css';

const UPDATED = '26 November 2026';
const CONTACT = 'admin@prashanthatejas1997.com';

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => { document.title = `${title} · Anand & Susmita`; window.scrollTo(0, 0); }, [title]);
  return <div className="legal" lang="en">
    <header className="legal-top">
      <a href="/" aria-label="Anand and Susmita — wedding invitation"><WeddingMark size={36} /></a>
      <nav aria-label="Legal"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></nav>
    </header>
    <main className="legal-body">
      <h1>{title}</h1>
      <p className="legal-updated">Last updated {UPDATED}</p>
      {children}
      <p className="legal-contact">Questions? Write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
      <p><a href="/">Back to the wedding invitation</a></p>
    </main>
  </div>;
}

export function PrivacyPolicy() {
  return <LegalLayout title="Privacy Policy">
    <p>This policy explains what the wedding website for Anand and Susmita (<b>anandwedsusmita.in</b>) collects, why, who can see it and how long it is kept. The site is run by the couple and their families, with technical help from the Jothe Jotheyali team.</p>

    <h2>What we collect</h2>
    <ul>
      <li><b>Google sign-in:</b> your name, email address and profile picture, only if you choose to sign in with Google. We do not see your Google password or anything else in your Google account.</li>
      <li><b>Invitation and RSVP details:</b> names, phone numbers and relationships the hosts add for each family, and your RSVP answers: who is coming, to which functions, travel and arrival details, and whether you need a stay.</li>
      <li><b>What you share:</b> photos, captions, wishes, reactions and Playground votes or predictions.</li>
      <li><b>Basic visit counts:</b> a random ID stored in your browser so we can count visitors. We do not record your IP address, location or the pages you browse.</li>
    </ul>

    <h2>Why we use it</h2>
    <p>Only to run the wedding: sending invitations, planning seats, food, travel and stays, showing the shared photo album and wishes, and sending you wedding memories afterwards. We do not show ads, and we never sell or rent your information.</p>

    <h2>Who can see it</h2>
    <ul>
      <li><b>Other guests</b> see the photos, wishes and names you post, and totals from the Playground. They never see your phone number, email address or individual votes.</li>
      <li><b>The wedding hosts</b> (the couple and the family members helping them) see RSVP answers, guest names and email addresses, and can remove any photo or wish.</li>
      <li><b>Service providers</b> that store and deliver the site: Supabase (database and photo storage), Vercel (website hosting) and Google (sign-in). They process data only to provide these services.</li>
    </ul>

    <h2>How long we keep it</h2>
    <p>Contact, RSVP, travel and stay details are deleted within 30 days after the wedding. Photos and wishes are kept for up to 90 days so the couple can save an album; after that they are deleted from the site. You can ask for your data to be deleted sooner at any time.</p>

    <h2>Your choices</h2>
    <ul>
      <li>You can view the invitation without signing in.</li>
      <li>You can ask the hosts to remove anything you posted, or any photo you appear in.</li>
      <li>You can ask us to show, correct or delete the information we hold about you by writing to the address below. We will reply as soon as we can.</li>
    </ul>

    <h2>Photos of other people</h2>
    <p>Please share only photos the people in them would be happy to see in the album. Anyone can ask the hosts to remove a photo, including photos of children, using the photo’s “Request removal” option or by email.</p>

    <h2>Changes</h2>
    <p>If this policy changes, we will update this page and the date above.</p>
  </LegalLayout>;
}

export function TermsOfService() {
  return <LegalLayout title="Terms of Service">
    <p>These terms apply to anyone using the wedding website for Anand and Susmita (<b>anandwedsusmita.in</b>). By signing in or posting, you agree to them.</p>

    <h2>Who it is for</h2>
    <p>The site is for invited guests, their families and the wedding hosts, to view the invitation, RSVP and share memories of the wedding.</p>

    <h2>What you post</h2>
    <ul>
      <li>You keep ownership of your photos and wishes.</li>
      <li>By posting, you allow the hosts to show them in the wedding album and to share them with the couple and their families, including in a keepsake album after the wedding.</li>
      <li>Post only content you have the right to share, that respects the people in it, and that is not offensive, unlawful or spam.</li>
    </ul>

    <h2>Moderation</h2>
    <p>The hosts may hide or remove any photo, wish or vote, and may block anyone who misuses the site.</p>

    <h2>Availability</h2>
    <p>The site is offered free of charge, as it is, for the wedding period. It may be unavailable at times, and it will close after the wedding once the album has been saved. We are not responsible for any loss caused by the site being unavailable.</p>

    <h2>Your data</h2>
    <p>How we handle your information is explained in our <Link to="/privacy">Privacy Policy</Link>.</p>

    <h2>Law</h2>
    <p>These terms are governed by the laws of India.</p>
  </LegalLayout>;
}
