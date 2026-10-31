/**
 * R2-hosted static URLs that the app shell needs on first paint. Kept separate
 * from `staticCdnAssets` so importing the logo does not pull the era and action
 * image catalogues into the client graph.
 */

export const CDN_STATIC_BASE = "https://cdn.ahousedividedgame.com/static";

export const CDN_LOGO_URL = `${CDN_STATIC_BASE}/ahd-logo.png`;
export const CDN_HERO_LINCOLN_URL = `${CDN_STATIC_BASE}/lincoln-memorial.webp`;
