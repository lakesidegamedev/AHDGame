/**
 * SEED INDEPENDENCE: DO NOT DERIVE FROM ANOTHER ERA.
 * Every era seed is self-contained and authored directly for its year.
 * Type-only imports are allowed.
 *
 * Japan regions for the 2027-default preset.
 *
 * Population, GDP and seat counts are projected forward from the 2023 bundle
 * using documented assumptions (national census trend, nominal GDP growth,
 * 465-seat Shugiin apportionment). stateSenateSeats is structural and held
 * constant. Per-region figures above reflect those assumptions, not computed
 * outputs.
 */
import type { State } from "@/lib/db/types";

export const jpRegions2027: State[] = [
  {
    _id: "HOK",
    countryId: "JP",
    regionType: "region",
    name: "Hokkaido",
    population: 5_050_000,
    gdp: 20_500_000,
    houseDistricts: 12,
    stateSenateSeats: 100,
    region: "Hokkaido",
    votingSystem: "fptp",
  },
  {
    _id: "TOH",
    countryId: "JP",
    regionType: "region",
    name: "Tohoku",
    population: 8_250_000,
    gdp: 35_500_000,
    houseDistricts: 37,
    stateSenateSeats: 299,
    region: "Tohoku",
    votingSystem: "fptp",
  },
  {
    _id: "KAN",
    countryId: "JP",
    regionType: "region",
    name: "Kanto",
    population: 43_600_000,
    gdp: 226_000_000,
    houseDistricts: 150,
    stateSenateSeats: 581,
    region: "Kanto",
    votingSystem: "fptp",
  },
  {
    _id: "CHU",
    countryId: "JP",
    regionType: "region",
    name: "Chubu",
    population: 20_750_000,
    gdp: 87_000_000,
    houseDistricts: 81,
    stateSenateSeats: 483,
    region: "Chubu",
    votingSystem: "fptp",
  },
  {
    _id: "KNS",
    countryId: "JP",
    regionType: "region",
    name: "Kansai",
    population: 22_150_000,
    gdp: 90_000_000,
    houseDistricts: 82,
    stateSenateSeats: 414,
    region: "Kansai",
    votingSystem: "fptp",
  },
  {
    _id: "CGK",
    countryId: "JP",
    regionType: "region",
    name: "Chugoku",
    population: 6_850_000,
    gdp: 30_200_000,
    houseDistricts: 28,
    stateSenateSeats: 238,
    region: "Chugoku",
    votingSystem: "fptp",
  },
  {
    _id: "SHI",
    countryId: "JP",
    regionType: "region",
    name: "Shikoku",
    population: 3_530_000,
    gdp: 14_600_000,
    houseDistricts: 14,
    stateSenateSeats: 163,
    region: "Shikoku",
    votingSystem: "fptp",
  },
  {
    _id: "KYU",
    countryId: "JP",
    regionType: "region",
    name: "Kyushu & Okinawa",
    population: 14_050_000,
    gdp: 53_600_000,
    houseDistricts: 61,
    stateSenateSeats: 401,
    region: "Kyushu",
    votingSystem: "fptp",
  },
];

export default jpRegions2027;
