/**
 * Policy-domain mapping and the shift-impact calculation.
 *
 * The affinities themselves are Layer-1 census BUCKET tables, one per country,
 * in `bucketAffinities.ts`. This module keeps the two pieces every caller needs
 * around them: mapping a legislation type's policy domain onto the shared domain
 * vocabulary, and turning a policy shift into per-bucket approval impacts.
 *
 * At bill enactment: impact = (newPosition - oldPosition) × affinity × scale
 */

import { bucketAffinitiesFor } from "./bucketAffinities";

export type PolicyDomain =
  | "education"
  | "healthcare"
  | "environment"
  | "immigration"
  | "criminal_justice"
  | "defense"
  | "economic"
  | "welfare"
  | "infrastructure"
  | "governance"
  | "foreign_policy"
  | "tax"
  | "mediaInformation"
  | "technology"
  | "agriculture";

/**
 * Map legislation type policyDomain to our domain categories
 */
export function getDomainForPolicyDomain(policyDomain: string): PolicyDomain {
  const domainMap: Record<string, PolicyDomain> = {
    education: "education",
    healthcare: "healthcare",
    environment: "environment",
    publicSafety: "criminal_justice",
    criminal_justice: "criminal_justice",
    defense: "defense",
    economic: "economic",
    social: "welfare",
    welfare: "welfare",
    labor: "economic",
    /** IE/UK British spelling, same routing as `labor` (US). */
    labour: "economic",
    /** IE/UK housing-domain types, closest semantic match is infrastructure. */
    housing: "infrastructure",
    infrastructure: "infrastructure",
    governance: "governance",
    foreign_policy: "foreign_policy",
    immigration: "immigration",
    tax: "tax",
    technology: "technology",
    agriculture: "agriculture",
    law_justice: "criminal_justice",
    mediaInformation: "mediaInformation",
  };
  return domainMap[policyDomain] ?? "economic";
}

/** Scale factor: shift × affinity gives raw impact, then we scale down */
export const SHIFT_IMPACT_SCALE = 0.15;

/**
 * Calculate approval impacts based on policy shift.
 *
 * Impacts are keyed on Layer-1 census BUCKETS (`"education:no_college"`), and
 * the affinities they are multiplied by live in `src/lib/bucketAffinities.ts`.
 *
 * @param policyDomain - The policy domain (e.g., "education", "healthcare")
 * @param oldIndex - Previous policy option index (0-6, lower = more left)
 * @param newIndex - New policy option index (0-6, lower = more left)
 * @param billCountry - Optional country ID; selects that country's bucket table
 * @returns Record of bucket id → approval change
 */
export function calculateShiftImpacts(
  policyDomain: string,
  oldIndex: number,
  newIndex: number,
  billCountry?: string,
  /**
   * Per-option combined position score (`economic + social`), indexed like the
   * options array. When supplied, the shift DIRECTION and extremeness are derived
   * from these curated scores (negative = left, positive = right) instead of the
   * array index. This is the SSOT for left-right and is robust to option ordering:
   * tax brackets (and some CN/DE/JP types) are authored right→left (index 0 = the
   * most market-friendly option), so the bare index runs opposite the affinity
   * convention and flips every approval sign. Falls back to index-based direction
   * when omitted (legacy callers / options without position scores).
   */
  optionScores?: number[]
): Record<string, number> {
  const domain = getDomainForPolicyDomain(policyDomain);
  // Country-specific BUCKET table, with the US fallback inside the lookup. A
  // domain missing from both resolves to `{}` rather than undefined, so a
  // domain added to the type but not yet to every table means "no impacts"
  // instead of a crash in the Propose modal or in turn enactment.
  const affinities: Record<string, number | undefined> = bucketAffinitiesFor(billCountry, domain);

  // Direction + extremeness. Prefer the curated position scores (robust to option
  // ordering); fall back to the array index when scores aren't supplied.
  const useScores =
    optionScores !== undefined &&
    Number.isFinite(optionScores[oldIndex]) &&
    Number.isFinite(optionScores[newIndex]);

  let shift: number;
  let positionMultiplier: number;
  if (useScores) {
    // shift > 0 = rightward (higher position score = more right).
    shift = optionScores![newIndex] - optionScores![oldIndex];
    // |score| 0 (center) → 0.5×; 5 (single-axis extreme) → 1.5×; clamp for "both"-axis types.
    positionMultiplier = Math.max(0.5, Math.min(1.5, 0.5 + Math.abs(optionScores![newIndex]) / 5));
  } else {
    // Legacy: shift > 0 means rightward movement by array index.
    shift = newIndex - oldIndex;
    const positionMultipliers = [1.5, 1.25, 1.0, 0.5, 1.0, 1.25, 1.5];
    positionMultiplier = positionMultipliers[newIndex] ?? 1.0;
  }
  if (shift === 0) return {};

  const impacts: Record<string, number> = {};

  for (const [bucketId, affinity] of Object.entries(affinities)) {
    if (affinity === undefined || affinity === 0) continue;

    // Impact = shift direction × affinity × scale × position multiplier
    // If shift is +2 (rightward) and affinity is +30 (likes right), impact is positive
    // If shift is +2 (rightward) and affinity is -30 (likes left), impact is negative
    const rawImpact = shift * affinity * SHIFT_IMPACT_SCALE * positionMultiplier;
    const clampedImpact = Math.max(-10, Math.min(10, Math.round(rawImpact)));

    if (clampedImpact !== 0) {
      impacts[bucketId] = clampedImpact;
    }
  }

  return impacts;
}
