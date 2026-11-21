import type { State } from "@/lib/db/types";

/**
 * Alberta's six successor regions, each a group of whole census divisions.
 * Independence inserts them and apportions the live CA_AB province across
 * them, so population and GDP are weights that sum to the CA_AB 2027 seed.
 * Population: provincial estimates scaled to the province. GDP: rounded
 * regional shares, with the oil sands in the north. Seats: the 87-seat
 * Assembly apportioned by population.
 */
export const abRegions: State[] = [
  {
    _id: "AB_CAL",
    countryId: "AB",
    regionType: "region",
    name: "Calgary",
    population: 1_850_000,
    gdp: 185_000,
    houseDistricts: 32,
    stateSenateSeats: 0,
    region: "Calgary",
    votingSystem: "fptp",
  },
  {
    _id: "AB_EDM",
    countryId: "AB",
    regionType: "region",
    name: "Edmonton",
    population: 1_580_000,
    gdp: 150_000,
    houseDistricts: 27,
    stateSenateSeats: 0,
    region: "Edmonton",
    votingSystem: "fptp",
  },
  {
    _id: "AB_CEN",
    countryId: "AB",
    regionType: "region",
    name: "Central Alberta",
    population: 640_000,
    gdp: 55_000,
    houseDistricts: 11,
    stateSenateSeats: 0,
    region: "Central",
    votingSystem: "fptp",
  },
  {
    _id: "AB_SOU",
    countryId: "AB",
    regionType: "region",
    name: "Southern Alberta",
    population: 420_000,
    gdp: 28_000,
    houseDistricts: 7,
    stateSenateSeats: 0,
    region: "South",
    votingSystem: "fptp",
  },
  {
    _id: "AB_FOO",
    countryId: "AB",
    regionType: "region",
    name: "Foothills and Rockies",
    population: 270_000,
    gdp: 22_000,
    houseDistricts: 5,
    stateSenateSeats: 0,
    region: "Mountain West",
    votingSystem: "fptp",
  },
  {
    _id: "AB_NOR",
    countryId: "AB",
    regionType: "region",
    name: "Northern Alberta",
    population: 340_000,
    gdp: 112_000,
    houseDistricts: 5,
    stateSenateSeats: 0,
    region: "North",
    votingSystem: "fptp",
  },
];

/** Regional-council seats per region: 100 seats apportioned by population. */
export const AB_REGIONAL_COUNCIL_SEATS: Readonly<Record<string, number>> = {
  AB_CAL: 36,
  AB_EDM: 31,
  AB_CEN: 13,
  AB_SOU: 8,
  AB_FOO: 5,
  AB_NOR: 7,
};

/** Edmonton is the capital. */
export const AB_CAPITAL_REGION = "AB_EDM";
