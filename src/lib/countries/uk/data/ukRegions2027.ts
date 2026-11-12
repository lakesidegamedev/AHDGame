/**
 * SEED INDEPENDENCE: DO NOT DERIVE FROM ANOTHER ERA.
 * Each era seed is self-contained. This file MUST NOT import and transform
 * another era's region data. All values are authored for 2027 directly.
 * Type-only imports are allowed.
 *
 * UK regions for the 2027-default preset (post-2024-election Westminster, on
 * the 2023 Periodic Review boundaries). The 12 electoral regions are
 * structurally stable; era-specific values are projected mid-2027 population,
 * projected 2026 nominal regional GDP, and the 650-seat Westminster
 * distribution (England 543 / Scotland 57 / Wales 32 / NI 18).
 * `stateSenateSeats` holds the devolved/regional-council seat count and is
 * structural, unchanged from 2023.
 *
 * Projection assumptions (documented, not derived in code):
 * - Seats: 2023 Periodic Review constituencies as fought in the 2024 general
 *   election. England split LON 75, SEE 91, SWE 58, EAE 61, EMI 47, WMI 57,
 *   YHU 54, NWE 73, NEE 27 (sum 543).
 * - Population: ONS mid-2024 estimates carried to mid-2027 at the pace of the
 *   ONS 2021-based interim projections (about 0.6%/yr nationally, faster in
 *   London and the South East, near flat in Scotland and Wales).
 * - GDP: 2022 regional GVA carried to 2026 nominal at about 15% cumulative.
 */
import type { State } from "@/lib/db/types";

export const ukRegions2027: State[] = [
  // ── England (543 Westminster seats, 2024 boundaries) ──────────────────────
  {
    _id: "LON",
    countryId: "UK",
    regionType: "constituency",
    parentRegionId: "ENG",
    name: "London",
    population: 9_270_000,
    gdp: 605_000,
    houseDistricts: 75,
    stateSenateSeats: 32,
    region: "London",
    votingSystem: "fptp",
  },
  {
    _id: "SEE",
    countryId: "UK",
    regionType: "constituency",
    parentRegionId: "ENG",
    name: "South East England",
    population: 9_830_000,
    gdp: 359_000,
    houseDistricts: 91,
    stateSenateSeats: 67,
    region: "South East",
    votingSystem: "fptp",
  },
  {
    _id: "SWE",
    countryId: "UK",
    regionType: "constituency",
    parentRegionId: "ENG",
    name: "South West England",
    population: 5_900_000,
    gdp: 182_000,
    houseDistricts: 58,
    stateSenateSeats: 39,
    region: "South West",
    votingSystem: "fptp",
  },
  {
    _id: "EAE",
    countryId: "UK",
    regionType: "constituency",
    parentRegionId: "ENG",
    name: "East of England",
    population: 6_700_000,
    gdp: 205_000,
    houseDistricts: 61,
    stateSenateSeats: 39,
    region: "East of England",
    votingSystem: "fptp",
  },
  {
    _id: "EMI",
    countryId: "UK",
    regionType: "constituency",
    parentRegionId: "ENG",
    name: "East Midlands",
    population: 5_100_000,
    gdp: 145_000,
    houseDistricts: 47,
    stateSenateSeats: 39,
    region: "East Midlands",
    votingSystem: "fptp",
  },
  {
    _id: "WMI",
    countryId: "UK",
    regionType: "constituency",
    parentRegionId: "ENG",
    name: "West Midlands",
    population: 6_190_000,
    gdp: 163_000,
    houseDistricts: 57,
    stateSenateSeats: 18,
    region: "West Midlands",
    votingSystem: "fptp",
  },
  {
    _id: "YHU",
    countryId: "UK",
    regionType: "constituency",
    parentRegionId: "ENG",
    name: "Yorkshire & the Humber",
    population: 5_650_000,
    gdp: 152_000,
    houseDistricts: 54,
    stateSenateSeats: 21,
    region: "Yorkshire",
    votingSystem: "fptp",
  },
  {
    _id: "NWE",
    countryId: "UK",
    regionType: "constituency",
    parentRegionId: "ENG",
    name: "North West England",
    population: 7_640_000,
    gdp: 222_000,
    houseDistricts: 73,
    stateSenateSeats: 27,
    region: "North West",
    votingSystem: "fptp",
  },
  {
    _id: "NEE",
    countryId: "UK",
    regionType: "constituency",
    parentRegionId: "ENG",
    name: "North East England",
    population: 2_680_000,
    gdp: 67_000,
    houseDistricts: 27,
    stateSenateSeats: 17,
    region: "North East",
    votingSystem: "fptp",
  },
  // ── Scotland (57, down from 59 at the 2023 Review) ─────────────────────────
  {
    _id: "SCO",
    countryId: "UK",
    regionType: "nation",
    parentRegionId: "SCO",
    name: "Scotland",
    population: 5_530_000,
    gdp: 193_000,
    houseDistricts: 57,
    stateSenateSeats: 129,
    region: "Scotland",
    votingSystem: "fptp",
  },
  // ── Wales (32, down from 40 at the 2023 Review) ────────────────────────────
  {
    _id: "WAL",
    countryId: "UK",
    regionType: "nation",
    parentRegionId: "WAL",
    name: "Wales",
    population: 3_190_000,
    gdp: 90_000,
    houseDistricts: 32,
    stateSenateSeats: 60,
    region: "Wales",
    votingSystem: "fptp",
  },
  // ── Northern Ireland (18, unchanged) ───────────────────────────────────────
  {
    _id: "NIR",
    countryId: "UK",
    regionType: "nation",
    parentRegionId: "NIR",
    name: "Northern Ireland",
    population: 1_950_000,
    gdp: 58_000,
    houseDistricts: 18,
    stateSenateSeats: 90,
    region: "Northern Ireland",
    votingSystem: "fptp",
  },
];

export default ukRegions2027;
