/**
 * Pre-rendered posters of the landing globe, keyed by era id and by three-hour
 * UTC bucket, so the poster's day and night sides sit within a few hours of the
 * live globe's real sun. Each is a capture of the real renderer; regenerate
 * them with scripts/landing/capture-globe-poster.mjs after the look changes.
 * Files are `<base>-h<bucket>-960.{avif,webp}`.
 */
const GLOBE_POSTERS: Readonly<Record<string, string>> = {
  "2027": "/landing/globe-2027",
};

export const POSTER_BUCKET_HOURS = 3;

export function posterBucket(at: Date): number {
  return Math.floor(at.getUTCHours() / POSTER_BUCKET_HOURS);
}

export function globePosterBase(eraId: string, at: Date): string | null {
  return Object.hasOwn(GLOBE_POSTERS, eraId)
    ? `${GLOBE_POSTERS[eraId]}-h${posterBucket(at)}`
    : null;
}
