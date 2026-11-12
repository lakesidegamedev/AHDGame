import type { State } from "@/lib/db/types";

/**
 * USSR regions as State-compatible documents (1979-era). Seeded in both the
 * 1953 and 1979 presets; identified by `countryId: "RU"`.
 *
 * Values authored for ~1979 directly (1979 USSR census). Modelled as 14
 * larger regions: ten RSFSR macro-regions plus Kazakhstan, Transcaucasia,
 * Central Asia and Moldova. Ukraine, Byelorussia and the Baltics were
 * promoted to their own playable countries (UKR/BLR/BAL), each with its own
 * region shard and legislature; their seats are excluded here.
 *
 * - `population` , 1979 census estimates (people).
 * - `gdp` , approximate 1979 regional net material product (millions of rubles).
 * - `houseDistricts` , Soviet of the Union seats apportioned to the region
 *     by largest remainder (sum = 559).
 * - `stateSenateSeats` , republic/regional Supreme Soviet seat count.
 * - `region` , grouping used for regional filters.
 * - `votingSystem` , fptp placeholder (the Supreme Soviet used single-list elections).
 */
export const ruRegions: State[] = [
  // ── RSFSR (Russia) economic macro-regions ──────────────────────────────────
  {
    _id: "CEN",
    countryId: "RU",
    regionType: "state",
    name: "Central Russia",
    population: 28_000_000,
    gdp: 60_000,
    houseDistricts: 81,
    stateSenateSeats: 575,
    region: "Russia",
    votingSystem: "fptp",
  },
  {
    _id: "NWR",
    countryId: "RU",
    regionType: "state",
    name: "Northwest Russia",
    population: 13_000_000,
    gdp: 30_000,
    houseDistricts: 38,
    stateSenateSeats: 266,
    region: "Russia",
    votingSystem: "fptp",
  },
  {
    _id: "NOR",
    countryId: "RU",
    regionType: "state",
    name: "European North",
    population: 6_000_000,
    gdp: 12_000,
    houseDistricts: 17,
    stateSenateSeats: 123,
    region: "Russia",
    votingSystem: "fptp",
  },
  {
    _id: "CBE",
    countryId: "RU",
    regionType: "state",
    name: "Central Black Earth",
    population: 8_000_000,
    gdp: 12_000,
    houseDistricts: 23,
    stateSenateSeats: 164,
    region: "Russia",
    votingSystem: "fptp",
  },
  {
    _id: "VOL",
    countryId: "RU",
    regionType: "state",
    name: "Volga",
    population: 20_000_000,
    gdp: 38_000,
    houseDistricts: 58,
    stateSenateSeats: 410,
    region: "Russia",
    votingSystem: "fptp",
  },
  {
    _id: "NCA",
    countryId: "RU",
    regionType: "state",
    name: "North Caucasus",
    population: 15_000_000,
    gdp: 22_000,
    houseDistricts: 43,
    stateSenateSeats: 307,
    region: "Russia",
    votingSystem: "fptp",
  },
  {
    _id: "URA",
    countryId: "RU",
    regionType: "state",
    name: "Urals",
    population: 19_000_000,
    gdp: 42_000,
    houseDistricts: 55,
    stateSenateSeats: 389,
    region: "Russia",
    votingSystem: "fptp",
  },
  {
    _id: "WSB",
    countryId: "RU",
    regionType: "state",
    name: "West Siberia",
    population: 12_000_000,
    gdp: 30_000,
    houseDistricts: 35,
    stateSenateSeats: 246,
    region: "Russia",
    votingSystem: "fptp",
  },
  {
    _id: "ESB",
    countryId: "RU",
    regionType: "state",
    name: "East Siberia",
    population: 8_000_000,
    gdp: 16_000,
    houseDistricts: 23,
    stateSenateSeats: 164,
    region: "Russia",
    votingSystem: "fptp",
  },
  {
    _id: "FEA",
    countryId: "RU",
    regionType: "state",
    name: "Russian Far East",
    population: 7_000_000,
    gdp: 14_000,
    houseDistricts: 20,
    stateSenateSeats: 143,
    region: "Russia",
    votingSystem: "fptp",
  },
  // ── Union republics (grouped) ──────────────────────────────────────────────
  {
    _id: "KAZ",
    countryId: "RU",
    regionType: "state",
    name: "Kazakhstan",
    population: 14_700_000,
    gdp: 22_000,
    houseDistricts: 42,
    stateSenateSeats: 510,
    region: "Kazakhstan",
    votingSystem: "fptp",
  },
  {
    _id: "TRA",
    countryId: "RU",
    regionType: "state",
    name: "Transcaucasia",
    population: 14_000_000,
    gdp: 20_000,
    houseDistricts: 40,
    stateSenateSeats: 440,
    region: "Caucasus",
    votingSystem: "fptp",
  },
  {
    _id: "CAS",
    countryId: "RU",
    regionType: "state",
    name: "Central Asia",
    population: 25_500_000,
    gdp: 28_000,
    houseDistricts: 73,
    stateSenateSeats: 500,
    region: "Central Asia",
    votingSystem: "fptp",
  },
  {
    _id: "MOL",
    countryId: "RU",
    regionType: "state",
    name: "Moldova",
    population: 3_900_000,
    gdp: 6_000,
    houseDistricts: 11,
    stateSenateSeats: 350,
    region: "Moldova",
    votingSystem: "fptp",
  },
];

export default ruRegions;
