import { seedPresetsFrom } from "@/lib/constants/turnTime";

/**
 * Which Japanese parties seed as Major, and in which eras.
 *
 * An entry with no `presets` applies to EVERY ERA. The LDP lists its presets
 * because it did not exist before November 1955: in `1953-default` the major
 * conservative force is the Liberal Party (RYO). Dropping the LDP list
 * would back-date it and leave 1953 with two major conservative parties.
 *
 * This is only the STARTING tier; the `partyTierTurn` phase recomputes tier
 * from live Org every turn.
 */
export const JP_PARTY_TIERS: Array<{ abbr: string; presets?: string[] }> = [
  // LDP formed Nov 1955; in 1953 the Liberal Party (RYO) was the major conservative force.
  // LDP is Major for all eras except 1953-default.
  {
    abbr: "LDP",
    presets: seedPresetsFrom("1979-default"),
  },
  { abbr: "RYO", presets: ["1953-default"] },
  { abbr: "JSP" },
  { abbr: "CDP" },
];
