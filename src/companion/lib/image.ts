// Resize on the phone before upload: longest side 1600px, WebP ~0.8 (JPEG fallback on old Safari).
export async function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  const webp = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/webp', quality));
  if (webp && webp.type === 'image/webp') return webp;
  return (await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', quality))) ?? file;
}

// Burn the wedding frame band into a copy for sharing/downloading (Scene keeps the clean photo).
export async function framedCopy(url: string, names: string, date: string, colours: { deep: string; paper: string }): Promise<Blob | null> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode().catch(() => null);
  if (!img.naturalWidth) return null;
  const band = Math.round(img.naturalWidth * 0.1);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight + band;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = colours.deep;
  ctx.fillRect(0, img.naturalHeight, canvas.width, band);
  ctx.fillStyle = colours.paper;
  ctx.font = `700 ${Math.round(band * 0.42)}px "Cormorant Garamond", serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(names, band * 0.4, img.naturalHeight + band / 2);
  ctx.font = `600 ${Math.round(band * 0.26)}px "Noto Sans", sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText(date, canvas.width - band * 0.4, img.naturalHeight + band / 2);
  return new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
}
