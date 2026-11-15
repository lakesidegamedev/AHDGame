import type { State } from "@/lib/db/types";

/**
 * East Germany (GDR) regions as State-compatible documents (1979; DD is
 * 1979-preset-only). SEED INDEPENDENCE , ~1979 values (pop ≈ 16.4M; net material
 * product ≈ M 180B).
 *
 * REGION CODES , the GDR territory uses the SAME modern eastern-Länder codes as
 * the unified-era FRG seeds under `DE` (`BB MV SN ST TH`), plus East Berlin
 * (`BEO`, DD-exclusive). The world map renders each Land under whoever owns it
 * live (`states.countryId`), so a divided Germany emerges purely from that
 * ownership difference; no date logic in the map. Because codes are shared with
 * `DE`, DD's data is seeded ONLY in the divided (1979) era , see `seedDD.ts`.
 *
 * East Berlin's map territory folds into Brandenburg (`BB`, a single polygon at
 * world scale), so `BEO` is a gameplay unit without a bespoke map shape,
 * mirroring West Berlin (`BE`, DE).
 *
 * houseDistricts = Volkskammer seats on the single National Front list (sum =
 * 500, matching `DD_VOLKSKAMMER_1979`). stateSenateSeats = Landtag
 * (`landAssembly`) seats per Land (sum = 80). gdp in millions of Mark der DDR.
 * `region` keeps the Berlin/North/South macro-grouping for UI continuity.
 * `votingSystem` is a nominal `fptp` placeholder (single-list elections), as
 * with other one-party states.
 */
export const ddRegions: State[] = [
  // ── Berlin (the capital, SED stronghold) ────────────────────────────────────
  {
    _id: "BEO",
    countryId: "DD",
    regionType: "state",
    name: "Berlin (Ost)",
    population: 1_150_000,
    gdp: 16_000,
    houseDistricts: 35,
    stateSenateSeats: 6,
    region: "Berlin",
    votingSystem: "fptp",
  },
  // ── North (Baltic coast + Brandenburg + Saxony-Anhalt) ───────────────────────
  {
    _id: "MV",
    countryId: "DD",
    regionType: "state",
    name: "Mecklenburg-Vorpommern",
    population: 2_100_000,
    gdp: 18_000,
    houseDistricts: 64,
    stateSenateSeats: 10,
    region: "North",
    votingSystem: "fptp",
  },
  {
    _id: "BB",
    countryId: "DD",
    regionType: "state",
    name: "Brandenburg",
    population: 2_650_000,
    gdp: 28_000,
    houseDistricts: 81,
    stateSenateSeats: 13,
    region: "North",
    votingSystem: "fptp",
  },
  {
    _id: "ST",
    countryId: "DD",
    regionType: "state",
    name: "Sachsen-Anhalt",
    population: 3_000_000,
    gdp: 34_000,
    houseDistricts: 91,
    stateSenateSeats: 15,
    region: "North",
    votingSystem: "fptp",
  },
  // ── South (the industrial heartland) ─────────────────────────────────────────
  {
    _id: "SN",
    countryId: "DD",
    regionType: "state",
    name: "Sachsen",
    population: 5_000_000,
    gdp: 58_000,
    houseDistricts: 153,
    stateSenateSeats: 24,
    region: "South",
    votingSystem: "fptp",
  },
  {
    _id: "TH",
    countryId: "DD",
    regionType: "state",
    name: "Thüringen",
    population: 2_500_000,
    gdp: 26_000,
    houseDistricts: 76,
    stateSenateSeats: 12,
    region: "South",
    votingSystem: "fptp",
  },
];

export default ddRegions;
