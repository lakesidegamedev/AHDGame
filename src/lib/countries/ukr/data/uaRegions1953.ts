import type { State } from "@/lib/db/types";

/**
 * Ukraine (Ukrainian SSR) 1953. Pop 41.0M; gdp in millions of Soviet rubles, the
 * same basis as src/lib/seeds/ru/ruRegions1953.ts, so the regional rollup agrees
 * with the hand-authored FY-1953 budget seed. National totals match the union
 * seed's `UKR` region exactly (41,000,000 / 291,667): promoting Ukraine to a
 * playable country must not move the USSR's economy.
 *
 * SEED INDEPENDENCE: authored for ~1953 directly, not derived from another era.
 *
 * - Donbas + Dnieper belt carry just over half of republican output on ~39% of
 *   population; that concentration is the SSR's economic point to Moscow.
 * - Western Ukraine (annexed 1939-45) is poorest by far: agrarian and still
 *   being pacified, with the second-largest population and about a ninth of
 *   output.
 * - Crimea was an RSFSR oblast in 1953 and transferred in 1954. The map shard's
 *   southern polygon includes it (post-1954 geometry), but population and output
 *   here are sized for the coastal oblasts as they stood.
 *
 * houseDistricts = seats in the Supreme Soviet of the Ukrainian SSR (435),
 * apportioned by population with largest remainder. stateSenateSeats is 0:
 * a union republic has one chamber.
 */
export const uaRegions1953: State[] = [
  {
    _id: "UKR_KYI",
    countryId: "UKR",
    regionType: "state",
    name: "Kyiv and the Right Bank",
    population: 8_000_000,
    gdp: 55_000,
    houseDistricts: 85,
    stateSenateSeats: 0,
    region: "Kyiv",
    votingSystem: "fptp",
  },
  {
    _id: "UKR_WES",
    countryId: "UKR",
    regionType: "state",
    // Annexed 1939-45, agrarian, and the only region with a living armed
    // resistance in the seed's own decade. Lowest output per head in the
    // republic by a factor of three against the Dnieper belt.
    name: "Western Ukraine",
    population: 8_500_000,
    gdp: 32_667,
    houseDistricts: 90,
    stateSenateSeats: 0,
    region: "West",
    votingSystem: "fptp",
  },
  {
    _id: "UKR_POD",
    countryId: "UKR",
    regionType: "state",
    name: "Podolia",
    population: 3_500_000,
    gdp: 19_000,
    houseDistricts: 37,
    stateSenateSeats: 0,
    region: "Podolia",
    votingSystem: "fptp",
  },
  {
    _id: "UKR_DON",
    countryId: "UKR",
    regionType: "state",
    // Coal. Highest output per head (₽10,833) - the mines were restored first
    // and at almost any cost, because the whole union's fuel balance depended
    // on them.
    name: "Donbas",
    population: 6_000_000,
    gdp: 65_000,
    houseDistricts: 64,
    stateSenateSeats: 0,
    region: "Donbas",
    votingSystem: "fptp",
  },
  {
    _id: "UKR_DNI",
    countryId: "UKR",
    regionType: "state",
    // Kryvyi Rih ore, Zaporizhzhia and Dnipropetrovsk metallurgy, DniproHES
    // rebuilt and back on line in 1950. Largest population and largest output.
    name: "Dnieper Industrial Belt",
    population: 10_000_000,
    gdp: 85_000,
    houseDistricts: 106,
    stateSenateSeats: 0,
    region: "Dnieper",
    votingSystem: "fptp",
  },
  {
    _id: "UKR_SOU",
    countryId: "UKR",
    regionType: "state",
    name: "Black Sea Coast",
    population: 5_000_000,
    gdp: 35_000,
    houseDistricts: 53,
    stateSenateSeats: 0,
    region: "South",
    votingSystem: "fptp",
  },
];
export default uaRegions1953;
