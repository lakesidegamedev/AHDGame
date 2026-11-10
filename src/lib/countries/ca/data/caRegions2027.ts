/**
 * Canada's 13 provinces and territories for the 2027 world.
 *
 * Sources (rounded, then carried to mid-2027):
 * - Population: Statistics Canada Table 17-10-0009-01 (quarterly population
 *   estimates), carried forward at about 0.5% a year to match the lower
 *   immigration levels in the federal 2026 to 2028 levels plan.
 * - GDP: Statistics Canada Table 36-10-0222-01 provincial shares of nominal
 *   GDP, applied to the IMF World Economic Outlook national GDP projection
 *   (about 3.45 trillion Canadian dollars for 2027). Values are in millions of
 *   Canadian dollars.
 * - Seats: the 343 House of Commons seats under the 2023 federal electoral
 *   redistribution (Representation Order of 2023), as fought in the 2025
 *   general election.
 * - `stateSenateSeats` carries the appointed Senate seats per region (105 in
 *   total, fixed by the Constitution Act, 1867 and later amendments).
 *
 * Seed independence: authored directly for 2027, never derived from another era.
 */
import type { State } from "@/lib/db/types";

export const caRegions2027: State[] = [
  {
    _id: "CA_ON",
    countryId: "CA",
    regionType: "province",
    name: "Ontario",
    population: 16_300_000,
    gdp: 1_321_350,
    houseDistricts: 122,
    stateSenateSeats: 24,
    region: "Central Canada",
    votingSystem: "fptp",
  },
  {
    _id: "CA_QC",
    countryId: "CA",
    regionType: "province",
    name: "Quebec",
    population: 9_120_000,
    gdp: 679_650,
    houseDistricts: 78,
    stateSenateSeats: 24,
    region: "Central Canada",
    votingSystem: "fptp",
  },
  {
    _id: "CA_BC",
    countryId: "CA",
    regionType: "province",
    name: "British Columbia",
    population: 5_700_000,
    gdp: 455_400,
    houseDistricts: 43,
    stateSenateSeats: 6,
    region: "Pacific",
    votingSystem: "fptp",
  },
  {
    _id: "CA_AB",
    countryId: "CA",
    regionType: "province",
    name: "Alberta",
    population: 5_100_000,
    gdp: 552_000,
    houseDistricts: 37,
    stateSenateSeats: 6,
    region: "Prairies",
    votingSystem: "fptp",
  },
  {
    _id: "CA_MB",
    countryId: "CA",
    regionType: "province",
    name: "Manitoba",
    population: 1_500_000,
    gdp: 120_750,
    houseDistricts: 14,
    stateSenateSeats: 6,
    region: "Prairies",
    votingSystem: "fptp",
  },
  {
    _id: "CA_SK",
    countryId: "CA",
    regionType: "province",
    name: "Saskatchewan",
    population: 1_250_000,
    gdp: 138_000,
    houseDistricts: 14,
    stateSenateSeats: 6,
    region: "Prairies",
    votingSystem: "fptp",
  },
  {
    _id: "CA_NS",
    countryId: "CA",
    regionType: "province",
    name: "Nova Scotia",
    population: 1_090_000,
    gdp: 69_000,
    houseDistricts: 11,
    stateSenateSeats: 10,
    region: "Atlantic",
    votingSystem: "fptp",
  },
  {
    _id: "CA_NB",
    countryId: "CA",
    regionType: "province",
    name: "New Brunswick",
    population: 870_000,
    gdp: 48_300,
    houseDistricts: 10,
    stateSenateSeats: 10,
    region: "Atlantic",
    votingSystem: "fptp",
  },
  {
    _id: "CA_NL",
    countryId: "CA",
    regionType: "province",
    name: "Newfoundland and Labrador",
    population: 545_000,
    gdp: 34_500,
    houseDistricts: 7,
    stateSenateSeats: 6,
    region: "Atlantic",
    votingSystem: "fptp",
  },
  {
    _id: "CA_PE",
    countryId: "CA",
    regionType: "province",
    name: "Prince Edward Island",
    population: 180_000,
    gdp: 10_350,
    houseDistricts: 4,
    stateSenateSeats: 4,
    region: "Atlantic",
    votingSystem: "fptp",
  },
  {
    _id: "CA_YT",
    countryId: "CA",
    regionType: "province",
    name: "Yukon",
    population: 47_000,
    gdp: 5_175,
    houseDistricts: 1,
    stateSenateSeats: 1,
    region: "North",
    votingSystem: "fptp",
  },
  {
    _id: "CA_NT",
    countryId: "CA",
    regionType: "province",
    name: "Northwest Territories",
    population: 45_000,
    gdp: 8_625,
    houseDistricts: 1,
    stateSenateSeats: 1,
    region: "North",
    votingSystem: "fptp",
  },
  {
    _id: "CA_NU",
    countryId: "CA",
    regionType: "province",
    name: "Nunavut",
    population: 42_000,
    gdp: 6_900,
    houseDistricts: 1,
    stateSenateSeats: 1,
    region: "North",
    votingSystem: "fptp",
  },
];

/** House of Commons seats per region, derived from the region documents. */
export const CA_COMMONS_SEATS_PER_REGION: Readonly<Record<string, number>> = Object.fromEntries(
  caRegions2027.map((region) => [region._id, region.houseDistricts ?? 0])
);

/** Appointed Senate seats per region. */
export const CA_SENATE_SEATS_PER_REGION: Readonly<Record<string, number>> = Object.fromEntries(
  caRegions2027.map((region) => [region._id, region.stateSenateSeats ?? 0])
);
