/**
 * Theater identifiers and the reserve test.
 *
 * `theaters.ts` also carries each nation's command flavour, which imports every
 * country identity module. Client surfaces that only need to know whether a
 * unit sits in reserve import this file instead, keeping those identities out
 * of the browser bundle.
 */
export const RESERVE_THEATER_ID = "reserve";

/** A unit deployed to a Conflict (any non-reserve theater) is engaged, not garrisoned. */
export function isAtConflict(theaterId: string): boolean {
  return theaterId !== RESERVE_THEATER_ID;
}
