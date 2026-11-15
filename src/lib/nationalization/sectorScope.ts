/**
 * Pure, client-safe definitions for sector-wide taking scope. Kept free of any
 * server-only imports (e.g. mongodb) so client components — the bill proposal
 * editor — can import the labels without pulling Node modules into the browser
 * bundle. The engine in `nationalizeSectorWide.ts` re-exports these.
 */

/** Which holders a sector-wide taking sweeps. `unowned` only survives on already-enacted laws and sweeps nothing. */
export type SectorScope = "all" | "corporations" | "unowned" | "npp_unowned";

/** Human-friendly labels for each sweep scope (SSOT for editor + bill view). */
export const SECTOR_SCOPE_LABELS: Record<SectorScope, string> = {
  all: "All holders",
  corporations: "Corporations only",
  unowned: "Unowned market (retired, takes nothing)",
  // Sweeps NPP-run corporations only; player-run (ceoType "character")
  // corporations stay untouched.
  npp_unowned: "NPP-run corps only (keeps player corps)",
};
