import type { State } from "@/lib/db/types";

/**
 * California's six successor regions, each a group of whole counties.
 * Independence inserts them and apportions the live CA state across them, so
 * population and GDP are weights that sum to the CA 2027 seed. Seats: the
 * 80-seat Assembly apportioned by population.
 */
export const rcaRegions: State[] = [
  {
    _id: "RCA_LAX",
    countryId: "RCA",
    regionType: "region",
    name: "Los Angeles",
    population: 12_600_000,
    gdp: 1_450_000,
    houseDistricts: 26,
    stateSenateSeats: 0,
    region: "Los Angeles",
    votingSystem: "fptp",
  },
  {
    _id: "RCA_BAY",
    countryId: "RCA",
    regionType: "region",
    name: "San Francisco Bay Area",
    population: 7_600_000,
    gdp: 1_300_000,
    houseDistricts: 15,
    stateSenateSeats: 0,
    region: "Bay Area",
    votingSystem: "fptp",
  },
  {
    _id: "RCA_SAN",
    countryId: "RCA",
    regionType: "region",
    name: "San Diego and Orange",
    population: 6_200_000,
    gdp: 700_000,
    houseDistricts: 13,
    stateSenateSeats: 0,
    region: "South Coast",
    votingSystem: "fptp",
  },
  {
    _id: "RCA_INL",
    countryId: "RCA",
    regionType: "region",
    name: "Inland Empire",
    population: 4_500_000,
    gdp: 320_000,
    houseDistricts: 9,
    stateSenateSeats: 0,
    region: "Inland",
    votingSystem: "fptp",
  },
  {
    _id: "RCA_CVY",
    countryId: "RCA",
    regionType: "region",
    name: "Central Valley",
    population: 4_100_000,
    gdp: 230_000,
    houseDistricts: 8,
    stateSenateSeats: 0,
    region: "Central Valley",
    votingSystem: "fptp",
  },
  {
    _id: "RCA_NOR",
    countryId: "RCA",
    regionType: "region",
    name: "Sacramento and the North",
    population: 4_355_309,
    gdp: 250_800,
    houseDistricts: 9,
    stateSenateSeats: 0,
    region: "North",
    votingSystem: "fptp",
  },
];

/** Regional-council seats per region: 60 seats apportioned by population. */
export const RCA_REGIONAL_COUNCIL_SEATS: Readonly<Record<string, number>> = {
  RCA_LAX: 19,
  RCA_BAY: 12,
  RCA_SAN: 9,
  RCA_INL: 7,
  RCA_CVY: 6,
  RCA_NOR: 7,
};

/** Sacramento, in the north, is the capital. */
export const RCA_CAPITAL_REGION = "RCA_NOR";
