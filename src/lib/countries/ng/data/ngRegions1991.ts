import type { State } from "@/lib/db/types";
import { allocateRegionalGdp } from "@/lib/seeds/reference/rules/allocateRegionalGdp";
import { NG_1991_NOMINAL_GDP_NGN } from "./ngGdp1991";
import { allocatePopulationTotal } from "@/lib/seeds/rules/populationAllocation";
import { POPULATION_TOTALS_1991 } from "@/lib/seeds/reference/populationTotals1991";

/**
 * Zone shares and relative GDP are model estimates, not observed regional data;
 * zone counts are normalized to the 1991 census total (populationTotals1991.ts)
 * and GDP is scaled to the WDI national total (ngGdp1991.ts). Zones postdate
 * 1991 and are a game construct. Seat allocation (360/109) is unchanged.
 */
const ngRegionPopulationWeights1991: State[] = [
  // ── North-West ───────────────────────────────────────────────────────────────
  {
    _id: "NORTH_WEST",
    countryId: "NG",
    regionType: "state",
    name: "North-West",
    population: 22_913_412,
    gdp: 35_000_000,
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
    population: 11_900_913,
    gdp: 22_000_000,
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
    population: 12_554_912,
    gdp: 28_000_000,
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
    population: 17_455_043,
    gdp: 72_000_000,
    houseDistricts: 72,
    stateSenateSeats: 18,
    region: "South-West",
    votingSystem: "fptp",
  },

  // ── South-South ───────────────────────────────────────────────────────────────
  {
    _id: "SOUTH_SOUTH",
    countryId: "NG",
    regionType: "state",
    name: "South-South",
    population: 13_392_943,
    gdp: 58_000_000,
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
    population: 10_774_977,
    gdp: 26_000_000,
    houseDistricts: 43,
    stateSenateSeats: 16,
    region: "South-East",
    votingSystem: "fptp",
  },
];

/** Regional counts are estimates normalized to the dated national anchor, not census observations. */
const populatedRegions = allocatePopulationTotal(
  ngRegionPopulationWeights1991,
  POPULATION_TOTALS_1991.NG.population
);
const populations = Object.fromEntries(populatedRegions.map((row) => [row._id, row.population]));
// The original GDP amounts were mis-scaled, but their relative output shares
// remain the model proxy. Express that proxy per resident for the allocator.
const outputPerResident = Object.fromEntries(
  populatedRegions.map((row) => [row._id, row.gdp / row.population])
);
const allocatedGdp = allocateRegionalGdp(NG_1991_NOMINAL_GDP_NGN, populations, outputPerResident);
export const ngRegions1991: State[] = populatedRegions.map((row) => ({
  ...row,
  gdp: allocatedGdp[row._id] / 1_000_000,
}));
