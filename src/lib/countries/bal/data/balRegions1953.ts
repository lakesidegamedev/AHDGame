import type { State } from "@/lib/db/types";

/**
 * Baltic republics 1953: Estonian SSR, Latvian SSR, Lithuanian SSR.
 *
 * Authored for ~1953 directly; do not derive from another era. Region ids match
 * the map shard public/bal-regions.json and carry through to the 1979 preset, so
 * there is one shard and no era variant.
 *
 * Population: totals are the game's own scale, not raw historical headcount.
 * The seeded 2,900,000 is fixed by the country's budget/seat configuration, and
 * the three republics split it in roughly 43 / 34 / 22 proportions. The three
 * MUST sum to 2,900,000; do not correct one without rebalancing the others.
 *
 * GDP: millions of Soviet rubles on the same Western GNP-estimate basis as
 * ruRegions1953.ts, so the two are directly comparable. The three sum to 29,167.
 *
 * houseDistricts = Supreme Soviet seats, apportioned by population and summing
 * to 300 to match coalitionThreshold of 151 in the BAL country config.
 */
export const balRegions1953: State[] = [
  {
    _id: "BAL_LTU",
    countryId: "BAL",
    regionType: "state",
    name: "Lithuania",
    population: 1_250_000,
    gdp: 10_667, // ₽8,534 per head — the poorest of the three, still a peasant economy
    houseDistricts: 129,
    stateSenateSeats: 0,
    region: "Baltics",
    votingSystem: "fptp",
  },
  {
    _id: "BAL_LVA",
    countryId: "BAL",
    regionType: "state",
    name: "Latvia",
    population: 1_000_000,
    gdp: 11_500, // ₽11,500 per head — Riga's machine-building carries the whole republic
    houseDistricts: 104,
    stateSenateSeats: 0,
    region: "Baltics",
    votingSystem: "fptp",
  },
  {
    _id: "BAL_EST",
    countryId: "BAL",
    regionType: "state",
    name: "Estonia",
    population: 650_000,
    gdp: 7_000, // ₽10,769 per head — oil shale plus the Union's best living standard
    houseDistricts: 67,
    stateSenateSeats: 0,
    region: "Baltics",
    votingSystem: "fptp",
  },
];
export default balRegions1953;
