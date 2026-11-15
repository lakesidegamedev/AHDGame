import type { State } from "@/lib/db/types";

/* Hungary regions (2027). Anchored to KSH 1 Jan 2026 population (9.488M)
 * and revised 2025 GDP (HUF 87,045.554 billion). Regional figures are
 * proportional estimates, not published KSH observations. GDP in millions HUF.
 * Same six macro-region ids as 1953/1979 so census keys resolve.
 * houseDistricts = Orszaggyules seats by population, largest remainder (sum 199).
 * stateSenateSeats = 0, no upper chamber. */
export const huRegions2027: State[] = [
  {
    _id: "HU_BUD",
    countryId: "HU",
    regionType: "state",
    name: "Budapest",
    population: 1_653_935,
    gdp: 32_190_431,
    houseDistricts: 35,
    stateSenateSeats: 0,
    region: "Budapest",
    votingSystem: "fptp",
  },
  {
    _id: "HU_PES",
    countryId: "HU",
    regionType: "state",
    name: "Pest",
    population: 1_310_758,
    gdp: 9_525_739,
    houseDistricts: 27,
    stateSenateSeats: 0,
    region: "Pest",
    votingSystem: "fptp",
  },
  {
    _id: "HU_TRW",
    countryId: "HU",
    regionType: "state",
    name: "Western Transdanubia",
    population: 2_024_644,
    gdp: 17_409_111,
    houseDistricts: 42,
    stateSenateSeats: 0,
    region: "Transdanubia",
    votingSystem: "fptp",
  },
  {
    _id: "HU_TRS",
    countryId: "HU",
    regionType: "state",
    name: "Southern Transdanubia",
    population: 847_617,
    gdp: 5_255_581,
    houseDistricts: 18,
    stateSenateSeats: 0,
    region: "Transdanubia",
    votingSystem: "fptp",
  },
  {
    _id: "HU_NOR",
    countryId: "HU",
    regionType: "state",
    name: "Northern Hungary",
    population: 1_076_729,
    gdp: 7_445_406,
    houseDistricts: 23,
    stateSenateSeats: 0,
    region: "Northern Hungary",
    votingSystem: "fptp",
  },
  {
    _id: "HU_ALF",
    countryId: "HU",
    regionType: "state",
    name: "Great Plain",
    population: 2_574_317,
    gdp: 15_219_286,
    houseDistricts: 54,
    stateSenateSeats: 0,
    region: "Great Plain",
    votingSystem: "fptp",
  },
];
export default huRegions2027;
