import type { GeneralInvitationSettings, GeneralSections } from './types';

export const DEFAULT_WELCOME = 'Warmly invite you to celebrate their wedding.';
export const DEFAULT_SECTIONS: GeneralSections = { cover: true, schedule: true, photos: true, uploads: true, updates: true, guestbook: true, download: true, quests: true, nostalgia: true, playground: true };
export const defaultGeneralSettings = (): GeneralInvitationSettings => ({ welcomeMessage: DEFAULT_WELCOME, coverPath: null, coverUrl: null, previewPhotos: [], sections: { ...DEFAULT_SECTIONS } });
export function normalizeGeneralSettings(settings?: Partial<GeneralInvitationSettings> | null): GeneralInvitationSettings {
  return { ...defaultGeneralSettings(), ...settings, previewPhotos: settings?.previewPhotos ?? [], sections: { ...DEFAULT_SECTIONS, ...settings?.sections } };
}

export function validateGeneralSettings(settings: GeneralInvitationSettings) {
  if (settings.previewPhotos.length > 3) throw new Error('Choose up to three preview photos.');
  if (!settings.welcomeMessage.trim() || settings.welcomeMessage.trim().length > 500) throw new Error('The welcome message must contain 1–500 characters.');
  if (Object.keys(settings.sections).length !== Object.keys(DEFAULT_SECTIONS).length || Object.keys(DEFAULT_SECTIONS).some(k => typeof settings.sections[k as keyof GeneralSections] !== 'boolean')) throw new Error('Choose a valid visibility setting for every section.');
}

export function validateWish(name: string, message: string) {
  if (!name.trim() || name.trim().length > 80) throw new Error('Enter a name between 1 and 80 characters.');
  if (!message.trim() || message.trim().length > 1000) throw new Error('Enter a wish between 1 and 1,000 characters.');
}

// Resize before uploading, so both the page and printable card stay quick to load.
export const prepareInvitationCover = (file: File) => prepareInvitationImage(file, 1600, .85);
export const prepareInvitationPreview = (file: File) => prepareInvitationImage(file, 1200, .8);
async function prepareInvitationImage(file: File, maxSide: number, quality: number): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose a cover photo smaller than 5 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not prepare the cover photo.');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not prepare the photo.')), 'image/webp', quality));
  } catch { throw new Error('Could not read the photo. Choose a valid JPG, PNG or WebP image.'); }
  finally { URL.revokeObjectURL(url); }
}
