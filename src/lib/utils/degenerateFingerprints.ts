/**
 * Low-entropy / fallback fingerprint values that collide across unrelated
 * browsers (SSR fallback, blocked-API sentinels). A fingerprint shared only via
 * one of these is NOT evidence that two accounts are related.
 *
 * Hoisted here so `altDetection/signals.ts`, `altDetection/run.ts`,
 * `turn/suspiciousDetection.ts` and `auth/identitySignals.ts` share ONE
 * definition. This module deliberately has no imports: the auth layer consumes
 * it, and importing `altDetection/signals.ts` from there would pull
 * `turn/suspiciousDetection` and `altDetection/behavior` in as value imports.
 *
 * Extend this set as production surfaces real degenerate ThumbmarkJS hashes.
 */
export const DEGENERATE_FINGERPRINTS: ReadonlySet<string> = new Set([
  "",
  "server-side",
  "unknown",
  "error",
  "not-supported",
]);

/** True when `fingerprint` is absent or a known low-entropy placeholder. */
export function isDegenerateFingerprint(fingerprint: string | null | undefined): boolean {
  return !fingerprint || DEGENERATE_FINGERPRINTS.has(fingerprint);
}

/**
 * A fingerprint held by more than this many accounts identifies nobody. Mobile
 * browsers are the usual cause: same handset model, OS and browser build
 * produce an identical ThumbmarkJS hash across unrelated people, and unlike the
 * literal sentinels in DEGENERATE_FINGERPRINTS these are real-looking hashes.
 * The alt-detection engine, the turn's suspicious-player pass and the
 * moderator duplicate panel all use this one ceiling.
 */
export const FINGERPRINT_COMMONNESS_CEILING = 8;
