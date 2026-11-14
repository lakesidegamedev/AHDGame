/**
 * Pre-rendered posters of the landing globe, keyed by era id. A poster is a
 * real capture of the globe's first frame; see
 * scripts/landing/capture-globe-poster.mjs to regenerate after the look changes.
 * Files are `<base>-640.{avif,webp}` and `<base>-1200.{avif,webp}`.
 */
const GLOBE_POSTERS: Readonly<Record<string, string>> = {
  "2027": "/landing/globe-2027",
};

export function globePosterBase(eraId: string): string | null {
  return Object.hasOwn(GLOBE_POSTERS, eraId) ? GLOBE_POSTERS[eraId] : null;
}
