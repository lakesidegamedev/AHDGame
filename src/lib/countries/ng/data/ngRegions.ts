import type { State } from "@/lib/db/types";

/**
 * Nigeria's 6 geopolitical zones as State-compatible documents (aggregated,
 * not the 36 states + FCT). The playable sub-national units.
 *
 * - `houseDistricts` , House seats for the zone (must sum to 360).
 * - `stateSenateSeats` , Senate seats for the zone (must sum to 109).
 * - `votingSystem` , Placeholder; actual system is FPTP by federal
 *     constituency.
 */
export const ngRegions: State[] = [
  // ── North-West ───────────────────────────────────────────────────────────────
  {
    _id: "NORTH_WEST",
    countryId: "NG",
    regionType: "state",
    name: "North-West",
    population: 49_800_000,
    gdp: 111_680_000,
    houseDistricts: 95,
    stateSenateSeats: 21,
    region: "North-West",
    votingSystem: "fptp",
  },

  // ── North-East ───────────────────────────────────────────────────────────────
  {
    _id: "NORTH_EAST",
    countryId: "NG",
    regionType: "state",
    name: "North-East",
    population: 26_300_000,
    gdp: 69_800_000,
    houseDistricts: 50,
    stateSenateSeats: 18,
    region: "North-East",
    votingSystem: "fptp",
  },

  // ── North-Central ────────────────────────────────────────────────────────────
  {
    _id: "NORTH_CENTRAL",
    countryId: "NG",
    regionType: "state",
    name: "North-Central",
    population: 28_100_000,
    gdp: 90_740_000,
    houseDistricts: 53,
    stateSenateSeats: 18,
    region: "North-Central",
    votingSystem: "fptp",
  },

  // ── South-West ───────────────────────────────────────────────────────────────
  {
    _id: "SOUTH_WEST",
    countryId: "NG",
    regionType: "state",
    name: "South-West",
    population: 37_900_000,
    gdp: 181_400_000,
    houseDistricts: 72,
    stateSenateSeats: 18,
    region: "South-West",
    votingSystem: "fptp",
  },

  // ── South-South ──────────────────────────────────────────────────────────────
  {
    _id: "SOUTH_SOUTH",
    countryId: "NG",
    regionType: "state",
    name: "South-South",
    population: 25_700_000,
    gdp: 160_540_000,
    houseDistricts: 47,
    stateSenateSeats: 18,
    region: "South-South",
    votingSystem: "fptp",
  },

  // ── South-East ───────────────────────────────────────────────────────────────
  {
    _id: "SOUTH_EAST",
    countryId: "NG",
    regionType: "state",
    name: "South-East",
    population: 22_400_000,
    gdp: 83_760_000,
    houseDistricts: 43,
    stateSenateSeats: 16,
    region: "South-East",
    votingSystem: "fptp",
  },
];

/**
 * House of Representatives seats per geopolitical zone — denormalized for fast
 * lookup during election spawning. Must agree with `ngRegions[*].houseDistricts`.
 *
 * Total: 360 (zone-scaled to NASS allocation).
 */
export const NG_SEATS_PER_REGION: Record<string, number> = Object.fromEntries(
  ngRegions.map((r) => [r._id, r.houseDistricts])
);
