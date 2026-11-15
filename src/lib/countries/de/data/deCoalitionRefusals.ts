import type { CoalitionRefusalSeed } from "@/lib/government/rules/coalitionRefusals";

/**
 * 2027 coalition refusals in the Bundestag.
 *
 * Every party that sat in a federal government refuses to govern with the
 * AfD, so the Union's natural partner by distance on the policy map is off
 * the table and a Union-led cabinet has to reach for the SPD instead. The
 * refusal can lapse if the refusers keep losing while the AfD leads; see
 * `advanceRefusalsAfterElection`.
 */
export const DE_COALITION_REFUSALS_2027: readonly CoalitionRefusalSeed[] = [
  { party: "AFD", shunnedBy: ["CDU", "CSU", "SPD", "GRN", "LNK", "FDP"] },
];
