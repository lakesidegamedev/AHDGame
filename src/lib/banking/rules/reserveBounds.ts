/**
 * Reserve-requirement bounds and era defaults, in a module a CLIENT component
 * can import.
 *
 * Nothing here may import anything that touches the database, the filesystem or
 * the turn engine. Values only. Pulling those into a client import graph breaks
 * the browser bundle build.
 *
 * `reserves.ts` re-exports these, so there is still one definition of each
 * number.
 */

/**
 * Provisional era default reserve ratio for historical worlds (era unit scale > 1).
 * Flagged for user review.
 */
export const RESERVE_REQUIREMENT_HISTORICAL_DEFAULT = 0.2;

/**
 * Provisional era default reserve ratio for modern worlds (era unit scale <= 1).
 * Flagged for user review.
 */
export const RESERVE_REQUIREMENT_MODERN_DEFAULT = 0.1;

/** Provisional floor on settable reserve ratios. Flagged for user review. */
export const RESERVE_REQUIREMENT_MIN = 0.05;

/** Provisional ceiling on settable reserve ratios. Flagged for user review. */
export const RESERVE_REQUIREMENT_MAX = 0.95;
