import type { State } from "@/lib/db/types";

/**
 * Texas's six successor regions, each a group of whole counties.
 * Independence inserts them and apportions the live TX state across them, so
 * population and GDP are weights that sum to the TX 2027 seed. Seats: the
 * 150-seat House apportioned by population.
 */
export const rtxRegions: State[] = [
  {
    _id: "RTX_DFW",
    countryId: "RTX",
    regionType: "region",
    name: "North Texas",
    population: 7_900_000,
    gdp: 900_000,
    houseDistricts: 37,
    stateSenateSeats: 0,
    region: "North Texas",
    votingSystem: "fptp",
  },
  {
    _id: "RTX_HOU",
    countryId: "RTX",
    regionType: "region",
    name: "Houston and the Gulf Coast",
    population: 7_400_000,
    gdp: 950_000,
    houseDistricts: 35,
    stateSenateSeats: 0,
    region: "Gulf Coast",
    votingSystem: "fptp",
  },
  {
    _id: "RTX_CEN",
    countryId: "RTX",
    regionType: "region",
    name: "Central Texas",
    population: 7_100_000,
    gdp: 480_000,
    houseDistricts: 34,
    stateSenateSeats: 0,
    region: "Central",
    votingSystem: "fptp",
  },
  {
    _id: "RTX_SOU",
    countryId: "RTX",
    regionType: "region",
    name: "South Texas",
    population: 3_800_000,
    gdp: 220_000,
    houseDistricts: 18,
    stateSenateSeats: 0,
    region: "South",
    votingSystem: "fptp",
  },
  {
    _id: "RTX_WES",
    countryId: "RTX",
    regionType: "region",
    name: "West Texas and the Panhandle",
    population: 3_200_000,
    gdp: 230_000,
    houseDistricts: 15,
    stateSenateSeats: 0,
    region: "West",
    votingSystem: "fptp",
  },
  {
    _id: "RTX_EAS",
    countryId: "RTX",
    regionType: "region",
    name: "East Texas",
    population: 2_309_821,
    gdp: 124_400,
    houseDistricts: 11,
    stateSenateSeats: 0,
    region: "East",
    votingSystem: "fptp",
  },
];

/** Regional-council seats per region: 60 seats apportioned by population. */
export const RTX_REGIONAL_COUNCIL_SEATS: Readonly<Record<string, number>> = {
  RTX_DFW: 15,
  RTX_HOU: 14,
  RTX_CEN: 13,
  RTX_SOU: 7,
  RTX_WES: 6,
  RTX_EAS: 5,
};

/** Austin, in Central Texas, is the capital. */
export const RTX_CAPITAL_REGION = "RTX_CEN";
