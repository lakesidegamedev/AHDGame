/**
 * SEED INDEPENDENCE: DO NOT DERIVE FROM ANOTHER ERA.
 * Each era seed is self-contained. This file MUST NOT import and transform
 * another era's region data. All values are authored for 2027 directly.
 * Type-only imports are allowed.
 *
 * Brazil IBGE macro-regions for the 2027-default preset. Population is a
 * January 2027 projection from the 2022 census and the IBGE annual estimates;
 * GDP (BRL millions) projects the IBGE regional accounts shares onto a 2027
 * nominal GDP of about BRL 14.3 trillion. These are game projections, not
 * observations. The 513-seat Chamber distribution and the 81-seat Senate are
 * structural.
 */
import type { State } from "@/lib/db/types";

export const brRegions2027: State[] = [
  {
    _id: "NORTE",
    countryId: "BR",
    regionType: "state",
    name: "Norte",
    population: 18_950_000,
    gdp: 900_000,
    houseDistricts: 75,
    stateSenateSeats: 21,
    region: "Norte",
    votingSystem: "fptp",
  },
  {
    _id: "NORDESTE",
    countryId: "BR",
    regionType: "state",
    name: "Nordeste",
    population: 57_600_000,
    gdp: 1_980_000,
    houseDistricts: 144,
    stateSenateSeats: 27,
    region: "Nordeste",
    votingSystem: "fptp",
  },
  {
    _id: "CENTRO_OESTE",
    countryId: "BR",
    regionType: "state",
    name: "Centro-Oeste",
    population: 17_500_000,
    gdp: 1_540_000,
    houseDistricts: 42,
    stateSenateSeats: 12,
    region: "Centro-Oeste",
    votingSystem: "fptp",
  },
  {
    _id: "SUDESTE",
    countryId: "BR",
    regionType: "state",
    name: "Sudeste",
    population: 89_900_000,
    gdp: 7_420_000,
    houseDistricts: 179,
    stateSenateSeats: 12,
    region: "Sudeste",
    votingSystem: "fptp",
  },
  {
    _id: "SUL",
    countryId: "BR",
    regionType: "state",
    name: "Sul",
    population: 31_050_000,
    gdp: 2_460_000,
    houseDistricts: 73,
    stateSenateSeats: 9,
    region: "Sul",
    votingSystem: "fptp",
  },
];

export default brRegions2027;
