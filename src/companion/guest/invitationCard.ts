import { fmtDate, fmtTime } from '../lib/format';
import type { GeneralInvitationSettings, GeneralInviteBundle } from '../lib/types';

const WIDTH = 1200;
const EXPORT_SCALE = 1080 / WIDTH;
const HEIGHT = WIDTH * 16 / 9;
const MAIN_PHOTO = '/images/anand-susmita-portrait.jpg';
const INVITATION_PHOTO = '/images/anand-susmita-invitation.jpg';
const sans = '"Noto Sans", "Noto Sans Kannada", sans-serif';
const serif = '"Cormorant Garamond", "Noto Sans Kannada", serif';

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = src;
  try { await image.decode(); }
  catch { throw new Error('Could not load a photo for your invitation. Refresh the page and try again.'); }
  return image;
}

type TextBlock = { kind: 'text'; lines: string[]; font: string; lineHeight: number; color: string; gap: number; tracking: number; names?: boolean };
type Block = TextBlock | { kind: 'photos'; height: number; gap: number } | { kind: 'divider'; height: number; gap: number };

// Always export a 1080 × 1920 story, independently of screen size or copy length.
export async function makeInvitationCard(bundle: GeneralInviteBundle, settings: GeneralInvitationSettings): Promise<Blob> {
  const { event, functions } = bundle;
  const showPhotos = settings.sections.cover;
  const [, photos, monogram, mandala, textile, floral] = await Promise.all([
    Promise.all([
      document.fonts.load('700 94px "Cormorant Garamond"'),
      document.fonts.load('600 44px "Cormorant Garamond"'),
      document.fonts.load('italic 500 34px "Cormorant Garamond"'),
      document.fonts.load('400 24px "Noto Sans"'),
      document.fonts.load('600 24px "Noto Sans"'),
      document.fonts.load('400 24px "Noto Sans Kannada"'),
    ]),
    showPhotos ? Promise.all([loadImage(MAIN_PHOTO), loadImage(settings.coverUrl ?? INVITATION_PHOTO)]) : [],
    loadImage('/images/as-monogram.svg').catch(() => null),
    loadImage('/images/name-mandala.svg').catch(() => null),
    loadImage('/images/textile-border.svg').catch(() => null),
    loadImage('/images/invitation-floral-corner.svg').catch(() => null),
  ]);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not create the invitation card.');
  const primary = event.theme.primary ?? '#A53051';
  const deep = event.theme.deep ?? '#283A2D';
  const paper = event.theme.paper ?? '#FFF7EB';
  const muted = '#686B5C';
  const blocks: Block[] = [];

  const wrap = (text: string, font: string, maxWidth: number, tracking: number): string[] => {
    ctx.font = font;
    const measure = (line: string) => ctx.measureText(line).width + Math.max(0, [...line].length - 1) * tracking;
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (measure(next) <= maxWidth) { line = next; continue; }
        if (line) { lines.push(line); line = ''; }
        for (const char of word) {
          if (measure(line + char) > maxWidth && line) { lines.push(line); line = ''; }
          line += char;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  const text = (value: string, size: number, options: { display?: boolean; italic?: boolean; weight?: number; color?: string; gap?: number; width?: number; tracking?: number; names?: boolean } = {}) => {
    const font = `${options.italic ? 'italic ' : ''}${options.weight ?? 400} ${size}px ${options.display ? serif : sans}`;
    const tracking = options.tracking ?? 0;
    blocks.push({ kind: 'text', lines: wrap(value, font, options.width ?? 936, tracking), font, lineHeight: size * (options.display ? 1.16 : 1.5), color: options.color ?? deep, gap: options.gap ?? 20, tracking, names: options.names });
  };
  const label = (value: string, gap = 12) => text(value, 15, { weight: 600, color: primary, tracking: 3, gap });

  label('WITH LOVE AND OUR ELDERS’ BLESSINGS', 20);
  text(`${event.coupleA} & ${event.coupleB}`, 94, { display: true, weight: 700, gap: 18, names: true });
  text(settings.welcomeMessage, 23, { color: muted, width: 850, gap: 36 });
  if (showPhotos) blocks.push({ kind: 'photos', height: 600, gap: 46 });
  blocks.push({ kind: 'divider', height: 24, gap: 20 });
  label('OUR WEDDING DAY');
  text(fmtDate(event.startsAt), 44, { display: true, weight: 600, gap: 10 });
  text(`Muhurta · ${fmtTime(event.startsAt)} IST`, 25, { weight: 600, color: primary, gap: 38 });
  label('THE VENUE');
  const [venueName, ...address] = event.venue.split(',').map(part => part.trim()).filter(Boolean);
  text(venueName ?? event.venue, 41, { display: true, weight: 600, width: 910, gap: address.length ? 9 : 35 });
  if (address.length) text(address.join(', '), 23, { color: muted, width: 830, gap: 35 });
  if (settings.sections.schedule && functions.length > 1) {
    label('THE CELEBRATIONS', 16);
    for (const fn of functions) {
      text(fn.nameEn, 31, { display: true, weight: 600, gap: 5 });
      text(`${fmtDate(fn.startsAt)} · ${fmtTime(fn.startsAt)} IST${fn.venue ? `\n${fn.venue}` : ''}`, 21, { color: muted, gap: 24 });
    }
  }
  text('Your presence is our happiness.', 36, { display: true, italic: true, weight: 500, color: primary, gap: 0 });

  const top = 280;
  const contentHeight = blocks.reduce((sum, block) => sum + (block.kind === 'text' ? block.lines.length * block.lineHeight : block.height) + block.gap, 0);
  const height = HEIGHT;
  const availableHeight = height - top - 300;
  const contentScale = Math.min(1.06, availableHeight / contentHeight);
  canvas.width = WIDTH * EXPORT_SCALE;
  canvas.height = 1920;
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, WIDTH, height);

  if (mandala) {
    ctx.save(); ctx.globalAlpha = .07;
    ctx.drawImage(mandala, 340, 180, 520, 520);
    ctx.restore();
  }
  ctx.strokeStyle = primary;
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.roundRect(32, 32, WIDTH - 64, height - 64, 26); ctx.stroke();
  ctx.save(); ctx.globalAlpha = .3; ctx.strokeStyle = deep;
  ctx.beginPath(); ctx.roundRect(44, 44, WIDTH - 88, height - 88, 19); ctx.stroke(); ctx.restore();
  if (monogram) ctx.drawImage(monogram, 548, 100, 104, 104);

  const floralCorner = (x: number, y: number, size: number, flipX: boolean, flipY: boolean) => {
    if (!floral) return;
    ctx.save();
    ctx.translate(x + (flipX ? size : 0), y + (flipY ? size : 0));
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(floral, 0, 0, size, size);
    ctx.restore();
  };
  floralCorner(20, 48, 370, false, true);
  floralCorner(WIDTH - 390, 48, 370, true, true);

  const arch = (x: number, y: number, width: number, photoHeight: number) => {
    const radius = width / 2;
    ctx.beginPath();
    ctx.moveTo(x, y + photoHeight - 12);
    ctx.lineTo(x, y + radius);
    ctx.arc(x + radius, y + radius, radius, Math.PI, 0);
    ctx.lineTo(x + width, y + photoHeight - 12);
    ctx.quadraticCurveTo(x + width, y + photoHeight, x + width - 12, y + photoHeight);
    ctx.lineTo(x + 12, y + photoHeight);
    ctx.quadraticCurveTo(x, y + photoHeight, x, y + photoHeight - 12);
    ctx.closePath();
  };
  const portrait = (image: HTMLImageElement, x: number, y: number) => {
    const width = 434, photoHeight = 584;
    ctx.save();
    arch(x - 8, y - 8, width + 16, photoHeight + 16);
    ctx.strokeStyle = primary; ctx.globalAlpha = .4; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
    ctx.save(); arch(x, y, width, photoHeight); ctx.clip();
    const scale = Math.max(width / image.naturalWidth, photoHeight / image.naturalHeight) * 1.07;
    const drawnWidth = image.naturalWidth * scale, drawnHeight = image.naturalHeight * scale;
    ctx.drawImage(image, x + (width - drawnWidth) / 2, y + (photoHeight - drawnHeight) * .34, drawnWidth, drawnHeight);
    ctx.restore();
  };
  ctx.textBaseline = 'top';
  ctx.save();
  ctx.translate((WIDTH - WIDTH * contentScale) / 2, top + Math.max(0, (availableHeight - contentHeight * contentScale) / 2));
  ctx.scale(contentScale, contentScale);
  let y = 0;
  for (const block of blocks) {
    if (block.kind === 'photos') {
      portrait(photos[0], 142, y + 8);
      portrait(photos[1], 624, y + 8);
      y += block.height + block.gap;
      continue;
    }
    if (block.kind === 'divider') {
      ctx.save(); ctx.strokeStyle = primary; ctx.globalAlpha = .4; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(360, y + 12); ctx.lineTo(565, y + 12); ctx.moveTo(635, y + 12); ctx.lineTo(840, y + 12); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = primary;
      ctx.beginPath(); ctx.moveTo(600, y + 5); ctx.lineTo(607, y + 12); ctx.lineTo(600, y + 19); ctx.lineTo(593, y + 12); ctx.closePath(); ctx.fill();
      ctx.restore(); y += block.height + block.gap;
      continue;
    }
    ctx.font = block.font;
    ctx.fillStyle = block.color;
    for (const line of block.lines) {
      const letters = [...line];
      const lineWidth = ctx.measureText(line).width + Math.max(0, letters.length - 1) * block.tracking;
      let x = (WIDTH - lineWidth) / 2;
      ctx.textAlign = 'left';
      if (block.tracking) {
        for (const letter of letters) { ctx.fillText(letter, x, y); x += ctx.measureText(letter).width + block.tracking; }
      } else if (block.names && line.includes('&')) {
        const [first, second] = line.split('&');
        ctx.fillText(first, x, y); x += ctx.measureText(first).width;
        ctx.fillStyle = primary; ctx.fillText('&', x, y); x += ctx.measureText('&').width;
        ctx.fillStyle = block.color; ctx.fillText(second, x, y);
      } else ctx.fillText(line, x, y);
      y += block.lineHeight;
    }
    y += block.gap;
  }
  ctx.restore();
  if (textile) {
    ctx.save(); ctx.beginPath(); ctx.rect(48, height - 132, WIDTH - 96, 84); ctx.clip();
    for (let x = 48; x < WIDTH - 48; x += 140) ctx.drawImage(textile, x, height - 132, 140, 84);
    ctx.restore();
  }
  floralCorner(20, height - 505, 440, false, false);
  floralCorner(WIDTH - 460, height - 505, 440, true, false);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not download the invitation card.')), 'image/png'));
}
