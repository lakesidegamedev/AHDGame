import type { State } from "@/lib/db/types";

/**
 * Ukraine (Ukrainian SSR) 1979. Pop 49.8M (January 1979 census; matches the
 * `UKR` total in the union-level seed). GDP in millions of Soviet rubles on
 * the same basis as `uaRegions1953.ts`.
 *
 * Six macro-regions match 1953, so region codes, census keys and metric
 * overrides line up across both Cold-War presets and one map shard serves both.
 *
 * Relative to 1953: Ukraine is now majority urban (~61%), Donbas has peaked
 * (coal is deeper and dearer, its share of output falls even as absolute
 * output rises, and the Dnieper belt overtakes it), Western Ukraine is
 * patchily industrialised but still the poorest and most rural region, and
 * the south includes Crimea (transferred 1954) plus the North Crimean canal
 * irrigation belt.
 *
 * `houseDistricts` = Supreme Soviet of the Ukrainian SSR seats (435),
 * apportioned by population with largest remainder.
 */
export const uaRegions: State[] = [
  {
    _id: "UKR_KYI",
    countryId: "UKR",
    regionType: "state",
    name: "Kyiv and the Right Bank",
    population: 10_500_000,
    gdp: 185_000,
    houseDistricts: 92,
    stateSenateSeats: 0,
    region: "Kyiv",
    votingSystem: "fptp",
  },
  {
    _id: "UKR_WES",
    countryId: "UKR",
    regionType: "state",
    name: "Western Ukraine",
    population: 9_500_000,
    gdp: 125_000,
    houseDistricts: 83,
    stateSenateSeats: 0,
    region: "West",
    votingSystem: "fptp",
  },
  {
    _id: "UKR_POD",
    countryId: "UKR",
    regionType: "state",
    name: "Podolia",
    population: 3_600_000,
    gdp: 50_000,
    houseDistricts: 31,
    stateSenateSeats: 0,
    region: "Podolia",
    votingSystem: "fptp",
  },
  {
    _id: "UKR_DON",
    countryId: "UKR",
    regionType: "state",
    name: "Donbas",
    population: 8_500_000,
    gdp: 175_000,
    houseDistricts: 74,
    stateSenateSeats: 0,
    region: "Donbas",
    votingSystem: "fptp",
  },
  {
    _id: "UKR_DNI",
    countryId: "UKR",
    regionType: "state",
    name: "Dnieper Industrial Belt",
    population: 11_500_000,
    gdp: 230_000,
    houseDistricts: 101,
    stateSenateSeats: 0,
    region: "Dnieper",
    votingSystem: "fptp",
  },
  {
    _id: "UKR_SOU",
    countryId: "UKR",
    regionType: "state",
    name: "Black Sea Coast",
    population: 6_200_000,
    gdp: 110_000,
    houseDistricts: 54,
    stateSenateSeats: 0,
    region: "South",
    votingSystem: "fptp",
  },
];
export default uaRegions;
