import type { State } from "@/lib/db/types";

/**
 * The six New England states, as the regions of an independent New England.
 * They keep their state ids when they leave the United States, so these rows
 * mirror the live state documents: population and GDP are the 2027 seed
 * figures, and the 90-seat Assembly is apportioned by population.
 */
export const nenRegions: State[] = [
  {
    _id: "ME",
    countryId: "NEN",
    regionType: "region",
    name: "Maine",
    population: 1_414_874,
    gdp: 102_800,
    houseDistricts: 8,
    stateSenateSeats: 0,
    region: "New England",
    votingSystem: "fptp",
  },
  {
    _id: "NH",
    countryId: "NEN",
    regionType: "region",
    name: "New Hampshire",
    population: 1_415_342,
    gdp: 125_500,
    houseDistricts: 8,
    stateSenateSeats: 0,
    region: "New England",
    votingSystem: "fptp",
  },
  {
    _id: "VT",
    countryId: "NEN",
    regionType: "region",
    name: "Vermont",
    population: 644_663,
    gdp: 48_400,
    houseDistricts: 4,
    stateSenateSeats: 0,
    region: "New England",
    votingSystem: "fptp",
  },
  {
    _id: "MA",
    countryId: "NEN",
    regionType: "region",
    name: "Massachusetts",
    population: 7_154_084,
    gdp: 820_100,
    houseDistricts: 42,
    stateSenateSeats: 0,
    region: "New England",
    votingSystem: "fptp",
  },
  {
    _id: "RI",
    countryId: "NEN",
    regionType: "region",
    name: "Rhode Island",
    population: 1_114_521,
    gdp: 84_000,
    houseDistricts: 6,
    stateSenateSeats: 0,
    region: "New England",
    votingSystem: "fptp",
  },
  {
    _id: "CT",
    countryId: "NEN",
    regionType: "region",
    name: "Connecticut",
    population: 3_688_496,
    gdp: 376_500,
    houseDistricts: 22,
    stateSenateSeats: 0,
    region: "New England",
    votingSystem: "fptp",
  },
];

/** Regional-council seats per region: 60 seats apportioned by population. */
export const NEN_REGIONAL_COUNCIL_SEATS: Readonly<Record<string, number>> = {
  ME: 5,
  NH: 6,
  VT: 3,
  MA: 28,
  RI: 4,
  CT: 14,
};

/** Boston, in Massachusetts, is the capital. */
export const NEN_CAPITAL_REGION = "MA";
