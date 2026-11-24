export const daysUntil = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

export function ago(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).toUpperCase();
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' }).replace(/\//g, '·');

// WhatsApp click-to-chat (no Business API needed).
export const waLink = (phone: string | undefined, text: string) =>
  `https://wa.me/${(phone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

export function inviteMessage(name: string, event: { coupleA: string; coupleB: string; startsAt: string; venue: string }, link: string, individual = false) {
  const greeting = individual || /\bfamily\b/i.test(name) ? name.trim() : `${name.trim()} and family`;
  const date = new Date(event.startsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  return `Dear ${greeting},\n\n*Your invitation to ${event.coupleA} & ${event.coupleB}’s wedding is here! ❤️*\n\n👇 *Tap the link below to open your invitation and RSVP*\n\n${link}\n\nWe’d love to celebrate with you. Your presence and blessings would make our day special.\n\n🗓 ${date} · ${fmtTime(event.startsAt)} IST\n📍 ${event.venue}`;
}
