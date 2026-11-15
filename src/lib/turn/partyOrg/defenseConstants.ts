import type { StatePartyOrg, PoliticalParty } from "@/lib/db/types";

/**
 * Defense constants for default-party anti-decay protection.
 *
 * NOTE, no per-party Org floor is enforced at runtime: any party can be
 * chipped from any Org level to 0 via the Build Org rival-poach. The tier
 * bands and helpers below are inert scaffolding for analytics / future
 * re-introduction of a tunable defense system; nothing on action paths
 * reads them. The pool-sum invariant + 0-clamp at action time are the only
 * structural ceilings.
 */

/** Tier classification of a state by the home-default party's Org%. */
export type DefenseTier = "strong" | "solid" | "lean" | "competitive";

/**
 * Tier-scaled minimum Org% floor. INERT: not read by any action path.
 * Kept to document the historical band thresholds; analytics may use it to
 * surface a state's tier.
 */
export const DEFENSE_ORG_FLOOR: Record<DefenseTier, number> = {
  strong: 18,
  solid: 14,
  lean: 10,
  competitive: 0,
} as const;

/**
 * Capture-rate multiplier applied to rival actions when the targeted
 * default party has no active human chair. Restored to `1.0` once a human
 * chair is seated.
 *
 * Applies to Org capture, Reg poach, GOTV, Suppression — every external
 * action whose primary effect is reducing the targeted party's metrics.
 * Does NOT apply to non-targeted effects (e.g. building Org for self by
 * pulling from `Unaffiliated Org`).
 */
export const DEFENSE_UNMANNED_CAPTURE_MULTIPLIER = 0.5 as const;

/**
 * Derive the defense tier for a state from the home default party's Org%.
 *
 * Bands are inclusive on the lower bound (28, 32, 36 belong to the higher
 * tier each: Lean ≥ 28, Solid ≥ 32, Strong ≥ 36).
 */
export function deriveDefenseTier(homeDefaultOrgPct: number): DefenseTier {
  if (homeDefaultOrgPct >= 36) return "strong";
  if (homeDefaultOrgPct >= 32) return "solid";
  if (homeDefaultOrgPct >= 28) return "lean";
  return "competitive";
}

/**
 * Resolve the home default party for a state: the highest-Org party in that
 * state with `politicalParties.isDefault === true`, or `null` if no default
 * party has presence in the state.
 *
 * Where multiple default parties exist, picks whichever default has the
 * highest Org% in this specific state. Ties break to the alphabetically lowest
 * `partyId` (deterministic).
 *
 * NOTE: `StatePartyOrg.partyId` is the party's `sequentialId` cast to string,
 * NOT `_id`; matches `getRegionPartyOrg` / `getRegionOfficials`.
 */
export function resolveHomeDefaultParty(
  parties: PoliticalParty[],
  rows: StatePartyOrg[]
): { partyId: string; orgPct: number } | null {
  const defaults = new Set(parties.filter((p) => p.isDefault).map((p) => String(p.sequentialId)));
  let best: { partyId: string; orgPct: number } | null = null;
  for (const r of rows) {
    if (!defaults.has(r.partyId)) continue;
    const orgPct = r.organization ?? 0;
    if (
      best === null ||
      orgPct > best.orgPct ||
      (orgPct === best.orgPct && r.partyId < best.partyId)
    ) {
      best = { partyId: r.partyId, orgPct };
    }
  }
  return best;
}

/** Convenience: resolve tier + floor in one call. */
export function resolveDefenseFloor(
  parties: PoliticalParty[],
  rows: StatePartyOrg[]
): { partyId: string; tier: DefenseTier; floor: number } | null {
  const home = resolveHomeDefaultParty(parties, rows);
  if (home === null) return null;
  const tier = deriveDefenseTier(home.orgPct);
  return { partyId: home.partyId, tier, floor: DEFENSE_ORG_FLOOR[tier] };
}

/**
 * Predicate: is the targeted party an unmanned default?
 *
 * "Unmanned" means the chair seat is not held by an active human player
 * (vacant, NPP-held, or banned/inactive user). The `isActiveHumanChair`
 * callback abstracts the chairId → user lookup so this constants module
 * doesn't depend on Character / User collection access patterns.
 */
export async function isUnmannedDefault(
  party: PoliticalParty,
  isActiveHumanChair: (chairId: PoliticalParty["chairId"]) => Promise<boolean>
): Promise<boolean> {
  if (!party.isDefault) return false;
  return !(await isActiveHumanChair(party.chairId));
}
