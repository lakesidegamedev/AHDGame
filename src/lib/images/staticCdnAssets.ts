/**
 * Heavy static assets served from Cloudflare R2 (`cdn.ahousedividedgame.com`)
 * instead of `public/`, keeping bandwidth off the Railway container (free
 * egress, edge-cached) and avoiding per-request `/_next/image` re-encode.
 *
 * These URLs are matched by `bypassNextImageOptimization`, so any
 * `next/image` using them MUST pass `unoptimized`. The CDN host is
 * intentionally absent from `next.config.ts` `remotePatterns` so the
 * optimizer can never proxy (and re-bill egress for) them.
 */

import { getActionImage } from "./actionImages";
import { CDN_HERO_LINCOLN_URL, CDN_STATIC_BASE } from "./cdnStaticUrls";

export { CDN_HERO_LINCOLN_URL, CDN_LOGO_URL } from "./cdnStaticUrls";

/**
 * THE era to hero-image source of truth. Every surface that shows an era hero
 * (login, register) resolves through {@link getLoginImage}; there is no second
 * era-to-image map.
 *
 * Every era below IS uploaded and live on R2, including the two wireframe eras:
 * `/login` renders it ghosted behind scanlines and `/register` uses it as the
 * hero backdrop.
 *
 * To add an era: upload the WebP to R2 at the path shown, then add the key.
 * Attribution for each source image is on the line below it. All sources are
 * public domain / CC-licensed from Wikimedia Commons.
 */
export const CDN_LOGIN_IMAGES: Record<string, string> = {
  "1953": `${CDN_STATIC_BASE}/login/login-1953.webp`, // Korean War Armistice signing — CC BY 2.0, USMC Archives
  "1979": `${CDN_STATIC_BASE}/login/login-1979.webp`, // Carter at Three Mile Island — PD (federal gov)
  "1991": `${CDN_STATIC_BASE}/login/login-1991.webp`, // Brandenburg Gate NYE — CC BY-SA 3.0 DE, Bundesarchiv
  "1999": `${CDN_STATIC_BASE}/login/login-1999.webp`, // WTO Seattle protests — CC BY-SA 2.0, Steve Kaiser
  "2007": `${CDN_STATIC_BASE}/login/login-2007.webp`, // G8 Heiligendamm — GODL, PM Office India
  "2019": `${CDN_STATIC_BASE}/login/login-2019.webp`, // House of Commons Brexit — CC BY 3.0, UK Parliament
  "2023": `${CDN_STATIC_BASE}/login/login-2023.webp`, // NATO Vilnius summit — CC BY 2.0, No 10 Downing St
};

/**
 * Hero image for an era. Used by both `/login` and `/register`. Unknown eras
 * (worlds seeded before the era system) fall back to the era-neutral Lincoln
 * memorial rather than rendering a broken image.
 */
export function getLoginImage(era: string | number): string {
  return CDN_LOGIN_IMAGES[String(era)] ?? CDN_HERO_LINCOLN_URL;
}

/**
 * Era-specific character-creation page hero images.
 *
 * None of these have ever been sourced/uploaded (every `create-<year>.webp` key
 * 404s on R2) — the map is intentionally empty so every era falls back to the
 * Lincoln Memorial hero below instead of rendering a broken image. To add a real one: source + optimize the WebP, upload it to
 * R2 at `static/create-character/create-<year>.webp` via
 * `scripts/upload-create-character-images-to-r2.mjs`, then re-add the entry
 * here.
 *
 * Suggested dimensions: ~1600×900, WebP, ~150–250 KB.
 * Sourcing guidance is in `scripts/create-character-images/README.md`.
 */
export const CDN_CREATE_CHARACTER_IMAGES: Record<string, string> = {};

/**
 * Era-neutral action card + actions-page hero images (WebP on R2). Used by
 * surfaces that are not tied to a world's era; era-aware surfaces go through
 * `getActionImage`. Resolved through it too, so a replaced neutral image keeps
 * its versioned URL in one place.
 */
export const CDN_ACTION_IMAGE_URLS = {
  campaign: getActionImage("campaign"),
  advertise: getActionImage("advertise"),
  fundraise: getActionImage("fundraise"),
  flipflop: getActionImage("flipflop"),
  debatePrep: getActionImage("debatePrep"),
  canvass: getActionImage("canvass"),
  convertCash: getActionImage("convertCash"),
  buildDonorBase: getActionImage("buildDonorBase"),
  poll: getActionImage("poll"),
  pollLarge: getActionImage("pollLarge"),
  hero: getActionImage("hero"),
} as const;

export const CDN_HERO_ACTIONS_URL = CDN_ACTION_IMAGE_URLS.hero;
