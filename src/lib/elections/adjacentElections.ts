import type { Election } from "@/lib/db/types";

/** Regular and snap races of one chamber share a seat's history. */
const ADJACENT_ELECTION_TYPE_FAMILIES: Readonly<Record<string, readonly string[]>> = {
  commons: ["commons", "snap_commons"],
  snap_commons: ["commons", "snap_commons"],
  bundestag: ["bundestag", "snap_bundestag"],
  snap_bundestag: ["bundestag", "snap_bundestag"],
  shugiin: ["shugiin", "snap_shugiin"],
  snap_shugiin: ["shugiin", "snap_shugiin"],
};

/**
 * Every non-cancelled cycle of the same seat as `election`: by `seatId`, or for
 * legacy docs without one, by country, region, type family and Senate class.
 */
export function adjacentElectionsQuery(
  election: Pick<Election, "seatId" | "countryId" | "state" | "electionType" | "senateClass">
): Record<string, unknown> {
  if (election.seatId) return { seatId: election.seatId, status: { $ne: "cancelled" } };
  const adjacentTypes = ADJACENT_ELECTION_TYPE_FAMILIES[election.electionType];
  return {
    ...(election.countryId ? { countryId: election.countryId } : {}),
    state: election.state,
    electionType: adjacentTypes ? { $in: adjacentTypes } : election.electionType,
    status: { $ne: "cancelled" },
    ...(election.senateClass != null ? { senateClass: election.senateClass } : {}),
  };
}
