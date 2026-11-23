import { fmtDate, fmtTime } from '../lib/format';
import type { GeneralInvitationSettings, GeneralInviteBundle } from '../lib/types';

export async function makeInvitationCard(bundle: GeneralInviteBundle, settings: GeneralInvitationSettings, link: string): Promise<Blob> {
  await Promise.all([
    document.fonts.load('700 84px "Cormorant Garamond"'),
    document.fonts.load('400 32px "Noto Sans"'),
    document.fonts.load('400 32px "Noto Sans Kannada"')
  ]);
  const { event, functions } = bundle;
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not create the invitation card.');
  const maxWidth = 940;
  const sans = '"Noto Sans", "Noto Sans Kannada", sans-serif';
  const serif = '"Cormorant Garamond", "Noto Sans Kannada", serif';
  const wrap = (text: string, font: string): string[] => {
    ctx.font = font;
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (ctx.measureText(line ? `${line} ${word}` : word).width <= maxWidth) { line = line ? `${line} ${word}` : word; continue; }
        if (line) { lines.push(line); line = ''; }
        // A long URL or name must also stay inside the printable card.
        for (const char of word) {
          if (ctx.measureText(line + char).width > maxWidth) { lines.push(line); line = ''; }
          line += char;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  type Block = { lines: string[]; font: string; height: number; gap: number; color: string };
  const primary = event.theme.primary ?? '#A53051';
  const ink = event.theme.ink ?? '#2A2320';
  const blocks: Block[] = [];
  const add = (text: string, size: number, weight = 400, display = false, color = ink, gap = 26) => {
    const font = `${weight} ${size}px ${display ? serif : sans}`;
    blocks.push({ lines: wrap(text, font), font, height: size * 1.45, gap, color });
  };
  add('WITH LOVE & BLESSINGS', 25, 600, false, primary, 30);
  const cover = settings.sections.cover ? settings.coverUrl ?? event.theme.portrait : null;
  let image: HTMLImageElement | null = null;
  if (cover) {
    image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = cover;
    try { await image.decode(); } catch { throw new Error('Could not load the cover photo for the card. Refresh the invitation and try again.'); }
  }
  add(`${event.coupleA} & ${event.coupleB}`, 84, 700, true, event.theme.deep ?? '#283A2D', 26);
  add(settings.welcomeMessage, 32, 400, false, ink, 40);
  add(fmtDate(event.startsAt), 36, 600, false, primary, 10);
  add(`${fmtTime(event.startsAt)} IST`, 32, 600, false, primary, 24);
  add(event.venue, 34, 400, false, ink, 42);
  if (settings.sections.schedule && functions.length > 1) {
    for (const f of functions) add(`${f.nameEn}\n${fmtDate(f.startsAt)} · ${fmtTime(f.startsAt)} IST${f.venue ? `\n${f.venue}` : ''}`, 27, 400, false, ink, 22);
  }
  add(`Open your invitation\n${link}`, 22, 400, false, '#6B5E57', 0);
  canvas.height = Math.ceil(180 + blocks.reduce((sum, b) => sum + b.lines.length * b.height + b.gap, 0) + (image ? 520 : 0));
  ctx.fillStyle = event.theme.paper ?? '#FFF7EB';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = primary;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(34, 34, 1132, canvas.height - 68, 45); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let y = 90;
  blocks.forEach((b, index) => {
    ctx.font = b.font; ctx.fillStyle = b.color;
    b.lines.forEach(line => { ctx.fillText(line, 600, y); y += b.height; });
    y += b.gap;
    if (index === 0 && image) {
      const width = 520, height = 460;
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      ctx.save();
      ctx.beginPath(); ctx.roundRect(340, y, width, height, 30); ctx.clip();
      ctx.drawImage(image, 600 - image.naturalWidth * scale / 2, y + (height - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
      ctx.restore();
      y += 520;
    }
  });
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not download the invitation card.')), 'image/png'));
}
