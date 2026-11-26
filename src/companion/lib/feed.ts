import type { Photo, Wish } from './types';

export type FeedPost = { id: string; createdAt: string } & (
  { kind: 'photos'; photos: Photo[] } | { kind: 'wish'; wish: Wish }
);

export function weddingFeed(photos: Photo[], wishes: Wish[]): FeedPost[] {
  const groups = new Map<string, Photo[]>();
  for (const photo of photos) {
    if (photo.hidden || (photo.status && photo.status !== 'approved')) continue;
    const key = photo.postId ? `post:${photo.postId}` : `photo:${photo.id}`;
    const group = groups.get(key) ?? [];
    group.push(photo); groups.set(key, group);
  }
  const posts: FeedPost[] = [...groups].map(([id, group]) => {
    group.sort((a, b) => (a.postPosition ?? 0) - (b.postPosition ?? 0) || a.id.localeCompare(b.id));
    return { kind: 'photos', id, photos: group, createdAt: group[0].createdAt };
  });
  for (const wish of wishes) if (wish.status === 'approved') posts.push({ kind: 'wish', id: `wish:${wish.id}`, wish, createdAt: wish.createdAt });
  return posts.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
}
