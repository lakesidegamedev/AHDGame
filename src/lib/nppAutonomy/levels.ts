import type { NppAutonomyLevel } from "@/lib/db/types/gameState";

/**
 * Every NPP autonomy level, lowest first. The one list request schemas, the
 * admin panel and the client-statistics allowlist read. Adding a tier is this
 * list, the union in `gameState.ts` and `NPP_AUTONOMY_LEVEL_RANK`; the rank
 * test fails if the list and the rank map disagree.
 */
export const NPP_AUTONOMY_LEVELS = [
  "off",
  "v0",
  "v1",
  "v2",
  "v3",
  "v4",
  "v5",
  "v6",
] as const satisfies readonly NppAutonomyLevel[];

/**
 * Canonical ordering of the autonomy levels. Lives in this dependency-free
 * module so `countryAccess` (which `featureFlag` imports) can read it without
 * an import cycle. A hand-kept copy there stopped at v4, so every world at v5
 * or v6 read as autonomy off and no country counted as NPP-governed.
 */
export const NPP_AUTONOMY_LEVEL_RANK: Record<NppAutonomyLevel, number> = {
  off: 0,
  v0: 1,
  v1: 2,
  v2: 3,
  v3: 4,
  v4: 5,
  v5: 6,
  v6: 7,
};
