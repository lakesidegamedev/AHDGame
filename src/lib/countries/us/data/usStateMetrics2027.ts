/**
 * SEED INDEPENDENCE — DO NOT DERIVE FROM ANOTHER ERA.
 * Each era seed is self-contained. This file MUST NOT import and transform
 * another era's seed data (e.g. the 2019 `stateMetrics` array). Values are
 * projected independently for January 2027 by holding the latest measured
 * state series constant where no newer comparable release is available. Same-era imports (states2027 for region IDs) and type-only
 * imports are allowed.
 */
import type { StateMetrics, StateMetricValue } from "@/lib/db/types";
import { states2027 } from "./usStates2027";
import { withUniformMetricSet } from "@/lib/seeds/shared/uniformStateMetrics";
import { airQualityIndexFromPm25 } from "@/lib/seeds/shared/airQualityIndex";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function mv(value: number, trend?: number): StateMetricValue {
  return trend !== undefined ? { value, trend } : { value };
}

// ---------------------------------------------------------------------------
// Real 2023 per-state series
// ---------------------------------------------------------------------------

/**
 * BLS LAUS 2023 annual average unemployment rate (%) by state.
 * Source: https://www.bls.gov/lau/lastrk23.htm
 * National average: 3.6%
 */
const UNEMP_2027: Record<string, number> = {
  AL: 2.8,
  AK: 4.0,
  AZ: 4.0,
  AR: 3.2,
  CA: 4.7,
  CO: 3.3,
  CT: 4.5,
  DE: 4.1,
  DC: 5.3,
  FL: 3.0,
  GA: 3.1,
  HI: 3.0,
  ID: 3.0,
  IL: 4.4,
  IN: 3.2,
  IA: 2.7,
  KS: 2.8,
  KY: 4.0,
  LA: 3.9,
  ME: 3.1,
  MD: 2.7,
  MA: 3.5,
  MI: 3.8,
  MN: 2.8,
  MS: 3.1,
  MO: 2.8,
  MT: 2.6,
  NE: 2.2,
  NV: 5.1,
  NH: 2.3,
  NJ: 4.7,
  NM: 4.4,
  NY: 4.3,
  NC: 3.5,
  ND: 1.9,
  OH: 3.9,
  OK: 3.2,
  OR: 4.4,
  PA: 3.6,
  RI: 4.5,
  SC: 3.2,
  SD: 2.0,
  TN: 3.3,
  TX: 4.0,
  UT: 2.8,
  VT: 2.2,
  VA: 2.8,
  WA: 3.9,
  WV: 4.1,
  WI: 2.8,
  WY: 3.3,
};

/**
 * ACS 2023 median household income by state (USD).
 * Source: U.S. Census Bureau, American Community Survey 1-Year Estimates 2023
 * (Table B19013). National median ≈ $80,610.
 */
const MEDIAN_INCOME_2027: Record<string, number> = {
  AL: 59674,
  AK: 86370,
  AZ: 72581,
  AR: 56335,
  CA: 91905,
  CO: 89068,
  CT: 90213,
  DE: 79325,
  DC: 101722,
  FL: 67917,
  GA: 71355,
  HI: 94814,
  ID: 70214,
  IL: 78433,
  IN: 66785,
  IA: 72429,
  KS: 69747,
  KY: 60183,
  LA: 57852,
  ME: 70571,
  MD: 101450,
  MA: 95559,
  MI: 67803,
  MN: 84313,
  MS: 52985,
  MO: 65920,
  MT: 67113,
  NE: 72971,
  NV: 71646,
  NH: 93428,
  NJ: 101828,
  NM: 58722,
  NY: 81386,
  NC: 65996,
  ND: 75983,
  OH: 67677,
  OK: 60096,
  OR: 77193,
  PA: 73170,
  RI: 83522,
  SC: 64115,
  SD: 70080,
  TN: 64693,
  TX: 73035,
  UT: 86833,
  VT: 76532,
  VA: 89897,
  WA: 93446,
  WV: 51248,
  WI: 72458,
  WY: 72495,
};

/**
 * ACS 2023 poverty rate (%) by state.
 * Source: U.S. Census Bureau, American Community Survey 1-Year Estimates 2023
 * (Table B17001). National rate ≈ 11.1%.
 */
const POVERTY_2027: Record<string, number> = {
  AL: 16.0,
  AK: 9.6,
  AZ: 12.7,
  AR: 16.5,
  CA: 12.8,
  CO: 9.2,
  CT: 9.5,
  DE: 10.2,
  DC: 14.7,
  FL: 12.7,
  GA: 14.0,
  HI: 8.0,
  ID: 10.9,
  IL: 11.6,
  IN: 11.8,
  IA: 10.1,
  KS: 11.2,
  KY: 16.3,
  LA: 19.0,
  ME: 10.0,
  MD: 8.3,
  MA: 9.6,
  MI: 13.2,
  MN: 8.3,
  MS: 19.6,
  MO: 13.1,
  MT: 11.5,
  NE: 9.5,
  NV: 12.6,
  NH: 6.3,
  NJ: 9.2,
  NM: 18.5,
  NY: 13.0,
  NC: 14.3,
  ND: 8.8,
  OH: 13.0,
  OK: 15.6,
  OR: 11.4,
  PA: 11.4,
  RI: 10.5,
  SC: 14.5,
  SD: 11.0,
  TN: 14.2,
  TX: 14.2,
  UT: 8.0,
  VT: 9.8,
  VA: 9.5,
  WA: 9.6,
  WV: 17.8,
  WI: 10.0,
  WY: 9.6,
};

/**
 * BEA 2023 real state GDP growth rate (%), chain-type quantity index.
 * Source: BEA Regional Economic Accounts, GDP by State (Nov 2024 release).
 * US 2023 real GDP growth: +2.5%.
 */
const GDP_GROWTH_2027: Record<string, number> = {
  AL: 1.8,
  AK: 2.1,
  AZ: 3.4,
  AR: 2.0,
  CA: 2.5,
  CO: 3.8,
  CT: 2.1,
  DE: 2.6,
  DC: 1.4,
  FL: 4.2,
  GA: 3.3,
  HI: 3.5,
  ID: 2.4,
  IL: 1.9,
  IN: 2.3,
  IA: 1.5,
  KS: 2.2,
  KY: 2.6,
  LA: 1.0,
  ME: 2.7,
  MD: 2.0,
  MA: 3.1,
  MI: 1.8,
  MN: 2.3,
  MS: 1.2,
  MO: 1.9,
  MT: 3.6,
  NE: 2.1,
  NV: 4.0,
  NH: 2.5,
  NJ: 2.4,
  NM: 2.8,
  NY: 2.2,
  NC: 3.6,
  ND: 1.1,
  OH: 1.7,
  OK: 1.3,
  OR: 2.0,
  PA: 1.9,
  RI: 3.0,
  SC: 3.5,
  SD: 2.3,
  TN: 2.8,
  TX: 5.1,
  UT: 3.3,
  VT: 2.8,
  VA: 2.3,
  WA: 4.0,
  WV: 0.7,
  WI: 2.0,
  WY: 0.8,
};

/**
 * CDC NCHS 2023 life expectancy at birth by state (years).
 * Source: NVSR Vol. 73 No. 4 (2024). US national ≈ 78.4.
 */
const LIFE_EXPECTANCY_2027: Record<string, number> = {
  AL: 73.4,
  AK: 76.5,
  AZ: 77.4,
  AR: 73.7,
  CA: 80.3,
  CO: 79.9,
  CT: 79.3,
  DE: 77.4,
  DC: 77.5,
  FL: 78.5,
  GA: 75.4,
  HI: 80.2,
  ID: 78.1,
  IL: 77.7,
  IN: 75.7,
  IA: 78.4,
  KS: 77.8,
  KY: 73.5,
  LA: 73.1,
  ME: 77.9,
  MD: 77.8,
  MA: 80.0,
  MI: 76.4,
  MN: 79.8,
  MS: 71.9,
  MO: 75.4,
  MT: 77.4,
  NE: 79.1,
  NV: 76.9,
  NH: 79.3,
  NJ: 79.6,
  NM: 75.5,
  NY: 79.0,
  NC: 76.3,
  ND: 78.6,
  OH: 75.9,
  OK: 74.1,
  OR: 78.6,
  PA: 76.9,
  RI: 78.7,
  SC: 75.5,
  SD: 78.3,
  TN: 74.0,
  TX: 77.0,
  UT: 80.3,
  VT: 79.9,
  VA: 78.0,
  WA: 79.7,
  WV: 71.6,
  WI: 78.9,
  WY: 77.8,
};

/**
 * ACS 2023 broadband internet subscription (% of households).
 * Source: U.S. Census Bureau, ACS 1-Year Estimates 2023 (Table B28002).
 * National average ≈ 82.6%.
 */
const BROADBAND_2027: Record<string, number> = {
  AL: 76.0,
  AK: 78.8,
  AZ: 82.9,
  AR: 72.2,
  CA: 85.8,
  CO: 87.3,
  CT: 87.9,
  DE: 85.2,
  DC: 87.1,
  FL: 83.0,
  GA: 81.1,
  HI: 84.4,
  ID: 82.0,
  IL: 84.0,
  IN: 81.5,
  IA: 83.5,
  KS: 83.2,
  KY: 77.2,
  LA: 74.4,
  ME: 82.8,
  MD: 88.6,
  MA: 90.5,
  MI: 82.2,
  MN: 88.1,
  MS: 73.0,
  MO: 80.4,
  MT: 80.3,
  NE: 85.5,
  NV: 82.6,
  NH: 90.4,
  NJ: 88.3,
  NM: 73.2,
  NY: 83.7,
  NC: 80.2,
  ND: 84.0,
  OH: 82.1,
  OK: 77.1,
  OR: 84.7,
  PA: 83.8,
  RI: 86.3,
  SC: 78.8,
  SD: 82.6,
  TN: 79.4,
  TX: 81.0,
  UT: 88.5,
  VT: 86.4,
  VA: 87.1,
  WA: 88.5,
  WV: 72.7,
  WI: 85.4,
  WY: 82.3,
};

// ---------------------------------------------------------------------------
// 2023 per-state cost-of-living index (BLS C2ER / Missouri Economic Research
// and Information Center composite index). National average = 100.
// ---------------------------------------------------------------------------
const COST_OF_LIVING_2027: Record<string, number> = {
  AL: 89.3,
  AK: 127.1,
  AZ: 103.7,
  AR: 87.8,
  CA: 138.5,
  CO: 110.1,
  CT: 114.9,
  DE: 103.1,
  DC: 151.2,
  FL: 102.8,
  GA: 91.2,
  HI: 184.6,
  ID: 101.3,
  IL: 95.8,
  IN: 90.5,
  IA: 91.2,
  KS: 87.7,
  KY: 90.0,
  LA: 92.2,
  ME: 106.5,
  MD: 116.8,
  MA: 135.3,
  MI: 90.0,
  MN: 97.9,
  MS: 84.0,
  MO: 88.3,
  MT: 105.5,
  NE: 92.4,
  NV: 105.8,
  NH: 114.2,
  NJ: 125.1,
  NM: 91.0,
  NY: 139.1,
  NC: 97.0,
  ND: 93.8,
  OH: 90.9,
  OK: 87.1,
  OR: 117.0,
  PA: 99.3,
  RI: 117.3,
  SC: 96.6,
  SD: 96.9,
  TN: 91.3,
  TX: 95.0,
  UT: 105.9,
  VT: 114.3,
  VA: 107.5,
  WA: 119.3,
  WV: 87.2,
  WI: 95.4,
  WY: 99.1,
};

// ---------------------------------------------------------------------------
// 2023 population growth rates (% annual; Census vintage July 2022→July 2023)
// ---------------------------------------------------------------------------
const POP_GROWTH_2027: Record<string, number> = {
  AL: 0.5,
  AK: -0.4,
  AZ: 1.6,
  AR: 0.7,
  CA: -0.1,
  CO: 1.0,
  CT: 0.7,
  DE: 1.3,
  DC: -0.3,
  FL: 2.1,
  GA: 1.4,
  HI: 0.2,
  ID: 2.3,
  IL: -0.2,
  IN: 0.5,
  IA: 0.4,
  KS: 0.5,
  KY: 0.5,
  LA: -0.3,
  ME: 0.8,
  MD: 0.4,
  MA: 0.7,
  MI: 0.2,
  MN: 0.5,
  MS: -0.2,
  MO: 0.5,
  MT: 1.2,
  NE: 0.6,
  NV: 1.5,
  NH: 0.9,
  NJ: 0.4,
  NM: 0.2,
  NY: -0.2,
  NC: 1.5,
  ND: 0.6,
  OH: 0.1,
  OK: 0.5,
  OR: 0.6,
  PA: 0.2,
  RI: 0.8,
  SC: 1.6,
  SD: 1.0,
  TN: 1.4,
  TX: 1.7,
  UT: 1.7,
  VT: 0.4,
  VA: 0.7,
  WA: 1.2,
  WV: -0.5,
  WI: 0.3,
  WY: 0.3,
};

// ---------------------------------------------------------------------------
// Urbanization rates (% urban; ACS 2020 decennial, current best source)
// ---------------------------------------------------------------------------
const URBANIZATION_2027: Record<string, number> = {
  AL: 60,
  AK: 66,
  AZ: 91,
  AR: 57,
  CA: 95,
  CO: 88,
  CT: 88,
  DE: 84,
  DC: 100,
  FL: 92,
  GA: 77,
  HI: 92,
  ID: 71,
  IL: 88,
  IN: 73,
  IA: 64,
  KS: 74,
  KY: 59,
  LA: 73,
  ME: 39,
  MD: 87,
  MA: 92,
  MI: 75,
  MN: 74,
  MS: 50,
  MO: 70,
  MT: 56,
  NE: 74,
  NV: 94,
  NH: 60,
  NJ: 95,
  NM: 78,
  NY: 88,
  NC: 67,
  ND: 60,
  OH: 78,
  OK: 66,
  OR: 81,
  PA: 79,
  RI: 91,
  SC: 67,
  SD: 57,
  TN: 66,
  TX: 85,
  UT: 91,
  VT: 39,
  VA: 76,
  WA: 84,
  WV: 49,
  WI: 70,
  WY: 65,
};

// ---------------------------------------------------------------------------
// Median age by state (ACS 2023 1-Year Estimates)
// ---------------------------------------------------------------------------
const MEDIAN_AGE_2027: Record<string, number> = {
  AL: 39.8,
  AK: 35.2,
  AZ: 38.3,
  AR: 38.7,
  CA: 37.5,
  CO: 37.3,
  CT: 41.7,
  DE: 41.5,
  DC: 34.3,
  FL: 43.1,
  GA: 37.4,
  HI: 40.1,
  ID: 37.0,
  IL: 39.0,
  IN: 38.3,
  IA: 38.6,
  KS: 37.6,
  KY: 39.5,
  LA: 37.6,
  ME: 45.7,
  MD: 39.5,
  MA: 40.2,
  MI: 40.2,
  MN: 38.5,
  MS: 38.1,
  MO: 39.1,
  MT: 40.8,
  NE: 37.0,
  NV: 38.6,
  NH: 43.5,
  NJ: 40.5,
  NM: 38.6,
  NY: 39.5,
  NC: 39.5,
  ND: 35.6,
  OH: 39.8,
  OK: 37.1,
  OR: 40.0,
  PA: 41.4,
  RI: 40.5,
  SC: 40.2,
  SD: 37.5,
  TN: 39.3,
  TX: 35.4,
  UT: 31.5,
  VT: 43.5,
  VA: 38.8,
  WA: 38.2,
  WV: 43.4,
  WI: 40.0,
  WY: 38.9,
};

/**
 * FBI UCR Summary Reporting System violent crime rate per 100k residents, 2024.
 * Source: https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/downloads (SRS dataset);
 * transcribed by state from https://en.wikipedia.org/wiki/List_of_U.S._states_and_territories_by_violent_crime_rate
 * National rate: 359.1. The FBI publishes no equivalent state property crime table that
 * could be retrieved, so publicSafety.crimeRate (property) is not sourced from a table.
 */
const VIOLENT_CRIME_2027: Record<string, number> = {
  AK: 724.1,
  AL: 359.9,
  AR: 579.4,
  AZ: 421.9,
  CA: 486.0,
  CO: 476.3,
  CT: 136.0,
  DC: 1005.5,
  DE: 360.8,
  FL: 267.1,
  GA: 325.7,
  HI: 217.7,
  IA: 243.3,
  ID: 230.6,
  IL: 289.2,
  IN: 312.9,
  KS: 438.7,
  KY: 213.1,
  LA: 519.8,
  MA: 314.7,
  MD: 420.4,
  ME: 100.1,
  MI: 434.3,
  MN: 256.6,
  MO: 462.0,
  MS: 210.5,
  MT: 423.5,
  NC: 375.8,
  ND: 254.3,
  NE: 220.5,
  NH: 110.1,
  NJ: 217.7,
  NM: 717.1,
  NV: 402.0,
  NY: 380.2,
  OH: 293.7,
  OK: 422.8,
  OR: 331.0,
  PA: 245.6,
  RI: 153.6,
  SC: 436.7,
  SD: 362.3,
  TN: 592.3,
  TX: 389.4,
  UT: 229.6,
  VA: 217.9,
  VT: 219.1,
  WA: 326.1,
  WI: 278.5,
  WV: 248.8,
  WY: 203.4,
};

/**
 * BJS sentenced prisoners under state jurisdiction per 100k residents, December 31 2023
 * (all ages, Table 7). Excludes jail populations. DC has no state prison system (felons are
 * federal), so it takes the BJS all-state figure (318).
 * Source: https://bjs.ojp.gov/library/publications/prisoners-2023-statistical-tables
 * (https://bjs.ojp.gov/document/p23st.zip, file p23stt07.csv)
 */
const IMPRISONMENT_2027: Record<string, number> = {
  AK: 202,
  AL: 394,
  AR: 596,
  AZ: 448,
  CA: 246,
  CO: 290,
  CT: 183,
  DC: 318,
  DE: 275,
  FL: 382,
  GA: 449,
  HI: 165,
  IA: 274,
  ID: 490,
  IL: 238,
  IN: 351,
  KS: 305,
  KY: 423,
  LA: 617,
  MA: 96,
  MD: 261,
  ME: 119,
  MI: 328,
  MN: 152,
  MO: 385,
  MS: 652,
  MT: 438,
  NC: 275,
  ND: 240,
  NE: 295,
  NH: 151,
  NJ: 125,
  NM: 259,
  NV: 327,
  NY: 167,
  OH: 394,
  OK: 545,
  OR: 291,
  PA: 300,
  RI: 122,
  SC: 299,
  SD: 405,
  TN: 341,
  TX: 477,
  UT: 186,
  VA: 314,
  VT: 124,
  WA: 181,
  WI: 346,
  WV: 328,
  WY: 378,
};

/**
 * Census ACS 1-year 2025, percent without any health insurance, civilian noninstitutionalized
 * population (100 minus the published percent insured). National: 8.4%.
 * Source: https://www2.census.gov/programs-surveys/demo/tables/health-insurance/2026/acs-hi/hi05_acs.xlsx
 */
const UNINSURED_2027: Record<string, number> = {
  AK: 13.6,
  AL: 8.4,
  AR: 9.1,
  AZ: 11.8,
  CA: 6.1,
  CO: 8.8,
  CT: 5.2,
  DC: 4.3,
  DE: 7.6,
  FL: 10.5,
  GA: 11.7,
  HI: 4.1,
  IA: 5.7,
  ID: 9.5,
  IL: 7.2,
  IN: 8.1,
  KS: 9.7,
  KY: 7.2,
  LA: 8.1,
  MA: 2.7,
  MD: 6.6,
  ME: 6.8,
  MI: 5.5,
  MN: 5.6,
  MO: 7.9,
  MS: 10.2,
  MT: 10.9,
  NC: 8.4,
  ND: 8.0,
  NE: 7.5,
  NH: 5.3,
  NJ: 7.7,
  NM: 10.5,
  NV: 11.5,
  NY: 4.7,
  OH: 7.1,
  OK: 12.6,
  OR: 5.4,
  PA: 6.2,
  RI: 4.2,
  SC: 10.2,
  SD: 8.6,
  TN: 10.0,
  TX: 16.5,
  UT: 8.6,
  VA: 6.9,
  VT: 3.8,
  WA: 7.0,
  WI: 5.9,
  WV: 6.9,
  WY: 9.6,
};

/**
 * EIA state energy-related CO2 per capita, 2022, metric tons per person.
 * Source: https://www.eia.gov/environment/emissions/state/excel/table4.xlsx
 */
const CO2_PER_CAPITA_2027: Record<string, number> = {
  AK: 56.3,
  AL: 21.5,
  AR: 20.7,
  AZ: 11.1,
  CA: 8.4,
  CO: 15.2,
  CT: 10.3,
  DC: 3.9,
  DE: 12.4,
  FL: 10.4,
  GA: 11.4,
  HI: 12.6,
  IA: 22.3,
  ID: 10.7,
  IL: 14.6,
  IN: 23.9,
  KS: 21.2,
  KY: 24.3,
  LA: 41.8,
  MA: 8.5,
  MD: 8.2,
  ME: 10.8,
  MI: 15.3,
  MN: 14.8,
  MO: 18.3,
  MS: 22.1,
  MT: 26.3,
  NC: 10.9,
  ND: 73.2,
  NE: 24.4,
  NH: 9.9,
  NJ: 10.0,
  NM: 22.0,
  NV: 12.7,
  NY: 8.4,
  OH: 16.7,
  OK: 21.7,
  OR: 8.9,
  PA: 16.5,
  RI: 9.3,
  SC: 12.7,
  SD: 17.2,
  TN: 12.9,
  TX: 22.1,
  UT: 17.8,
  VA: 11.1,
  VT: 8.5,
  WA: 9.6,
  WI: 15.4,
  WV: 44.6,
  WY: 96.6,
};

/**
 * Renewable share of in-state electricity net generation, 2024, percent (hydro, wind,
 * solar, geothermal, wood and other biomass over total, all producers). National: 22.7%.
 * Source: https://www.eia.gov/electricity/data/state/generation_monthly.xlsx (sheet 2024_Final)
 */
const RENEWABLE_SHARE_2027: Record<string, number> = {
  AK: 28.2,
  AL: 9.0,
  AR: 10.2,
  AZ: 16.3,
  CA: 50.8,
  CO: 41.3,
  CT: 3.1,
  DC: 46.8,
  DE: 4.4,
  FL: 8.2,
  GA: 12.5,
  HI: 21.2,
  IA: 65.5,
  ID: 68.3,
  IL: 15.3,
  IN: 14.4,
  KS: 52.0,
  KY: 7.1,
  LA: 4.1,
  MA: 19.6,
  MD: 10.7,
  ME: 53.8,
  MI: 12.0,
  MN: 32.6,
  MO: 12.1,
  MS: 4.3,
  MT: 57.4,
  NC: 13.8,
  ND: 39.5,
  NE: 35.9,
  NH: 14.9,
  NJ: 3.8,
  NM: 49.4,
  NV: 40.2,
  NY: 30.0,
  OH: 5.3,
  OK: 42.7,
  OR: 61.4,
  PA: 3.5,
  RI: 10.0,
  SC: 7.1,
  SD: 81.6,
  TN: 13.8,
  TX: 29.4,
  UT: 20.9,
  VA: 11.4,
  VT: 99.8,
  WA: 69.5,
  WI: 12.3,
  WV: 7.0,
  WY: 25.6,
};

/**
 * Annual mean PM2.5 (ug/m3), 2024, population-weighted across monitored counties.
 * County means average complete-year monitor sites; weights are 2023 county populations
 * from countyPopulationHistory.json. Wildfire events included.
 * Source: https://aqs.epa.gov/aqsweb/airdata/annual_conc_by_monitor_2024.zip (parameter 88101)
 */
const PM25_2027: Record<string, number> = {
  AK: 5.7,
  AL: 8.02,
  AR: 9.4,
  AZ: 8.03,
  CA: 9.03,
  CO: 6.01,
  CT: 5.71,
  DC: 6.41,
  DE: 6.43,
  FL: 6.89,
  GA: 8.97,
  HI: 3.7,
  IA: 6.92,
  ID: 9.24,
  IL: 7.52,
  IN: 7.9,
  KS: 7.64,
  KY: 7.22,
  LA: 8.46,
  MA: 5.8,
  MD: 6.02,
  ME: 5.06,
  MI: 7.77,
  MN: 7.14,
  MO: 7.11,
  MS: 8.34,
  MT: 6.54,
  NC: 7.59,
  ND: 6.92,
  NE: 6.96,
  NH: 4.33,
  NJ: 6.42,
  NM: 6.01,
  NV: 5.48,
  NY: 6.84,
  OH: 7.57,
  OK: 8.29,
  OR: 5.69,
  PA: 7.37,
  RI: 5.34,
  SC: 7.69,
  SD: 5.44,
  TN: 7.82,
  TX: 10.01,
  UT: 6.38,
  VA: 6.72,
  VT: 4.46,
  WA: 5.81,
  WI: 6.41,
  WV: 6.75,
  WY: 4.08,
};

/**
 * Share of state area (land and water, Census 2022 boundaries) in GAP status 1 and 2
 * protected areas, percent. Source: USGS PAD-US 4.1 summary statistics
 * https://www.sciencebase.gov/catalog/item/6759b69fd34edfeb8710a3ea
 * (PADUS4_1SummaryStatistics_TabularData_CSV, State clip table).
 */
const PROTECTED_LAND_2027: Record<string, number> = {
  AK: 35.3,
  AL: 1.8,
  AR: 5.2,
  AZ: 14.3,
  CA: 21.9,
  CO: 10.7,
  CT: 4.3,
  DC: 1.0,
  DE: 4.6,
  FL: 10.2,
  GA: 5.4,
  HI: 19.8,
  IA: 1.8,
  ID: 14.5,
  IL: 2.7,
  IN: 1.6,
  KS: 0.8,
  KY: 2.8,
  LA: 3.9,
  MA: 6.5,
  MD: 2.7,
  ME: 4.7,
  MI: 6.0,
  MN: 7.3,
  MO: 3.3,
  MS: 3.1,
  MT: 9.4,
  NC: 5.8,
  ND: 16.3,
  NE: 1.0,
  NH: 7.4,
  NJ: 11.6,
  NM: 6.1,
  NV: 15.1,
  NY: 9.8,
  OH: 2.1,
  OK: 2.2,
  OR: 12.7,
  PA: 2.5,
  RI: 10.2,
  SC: 3.7,
  SD: 9.6,
  TN: 6.9,
  TX: 2.0,
  UT: 15.2,
  VA: 3.8,
  VT: 5.3,
  WA: 14.7,
  WI: 9.0,
  WV: 6.3,
  WY: 11.2,
};

/**
 * USDA ERS household food insecurity prevalence, percent, 3-year average 2022-2024.
 * National: 13.3%. Source: https://www.ers.usda.gov/media/6988/mapdata.xlsx
 */
const FOOD_INSECURITY_2027: Record<string, number> = {
  AK: 13.0,
  AL: 12.1,
  AR: 19.4,
  AZ: 13.1,
  CA: 12.5,
  CO: 10.5,
  CT: 12.1,
  DC: 10.3,
  DE: 10.8,
  FL: 13.3,
  GA: 14.6,
  HI: 10.8,
  IA: 10.8,
  ID: 12.6,
  IL: 13.3,
  IN: 13.7,
  KS: 12.5,
  KY: 18.8,
  LA: 17.7,
  MA: 11.7,
  MD: 11.5,
  ME: 12.9,
  MI: 14.7,
  MN: 9.9,
  MO: 13.3,
  MS: 17.3,
  MT: 11.7,
  NC: 11.8,
  ND: 9.0,
  NE: 12.7,
  NH: 9.1,
  NJ: 9.8,
  NM: 14.5,
  NV: 15.0,
  NY: 14.0,
  OH: 14.2,
  OK: 16.9,
  OR: 12.5,
  PA: 10.9,
  RI: 10.6,
  SC: 13.5,
  SD: 9.5,
  TN: 13.3,
  TX: 17.6,
  UT: 11.5,
  VA: 12.4,
  VT: 9.4,
  WA: 11.0,
  WI: 12.0,
  WV: 14.1,
  WY: 15.6,
};

/**
 * Voting-eligible population turnout, 2024 general election, percent of VEP casting a ballot.
 * National: 64.3%. Source: UF Election Lab (US Elections Project)
 * https://election.lab.ufl.edu/data-downloads/turnoutdata/Turnout_2024G_v0.4.csv
 */
const VOTER_TURNOUT_2027: Record<string, number> = {
  AK: 63.5,
  AL: 58.7,
  AR: 54.1,
  AZ: 63.9,
  CA: 62.3,
  CO: 73.4,
  CT: 67.0,
  DC: 64.9,
  DE: 66.8,
  FL: 67.4,
  GA: 68.0,
  HI: 50.3,
  IA: 71.0,
  ID: 64.2,
  IL: 63.5,
  IN: 59.0,
  KS: 63.3,
  KY: 62.9,
  LA: 61.1,
  MA: 68.4,
  MD: 69.4,
  ME: 74.5,
  MI: 74.8,
  MN: 76.5,
  MO: 64.6,
  MS: 57.8,
  MT: 68.3,
  NC: 70.7,
  ND: 63.9,
  NE: 68.6,
  NH: 73.7,
  NJ: 67.5,
  NM: 59.7,
  NV: 66.2,
  NY: 60.5,
  OH: 65.4,
  OK: 53.5,
  OR: 71.9,
  PA: 71.4,
  RI: 63.3,
  SC: 62.3,
  SD: 64.5,
  TN: 57.9,
  TX: 56.8,
  UT: 64.7,
  VA: 71.5,
  VT: 70.8,
  WA: 70.2,
  WI: 76.7,
  WV: 55.6,
  WY: 61.2,
};

/**
 * Share of Interstate, other freeway and other principal arterial miles (rural and urban)
 * with measured pavement roughness IRI of 170 in/mi or less (FHWA good or acceptable), 2024,
 * percent of reported miles. National: 90.2%.
 * Source: https://www.fhwa.dot.gov/policyinformation/statistics/2024/xls/hm64.xlsx (Table HM-64)
 */
const ROAD_ACCEPTABLE_2027: Record<string, number> = {
  AK: 85.6,
  AL: 97.3,
  AR: 94.4,
  AZ: 91.2,
  CA: 71.4,
  CO: 89.2,
  CT: 88.9,
  DC: 20.4,
  DE: 93.1,
  FL: 96.6,
  GA: 97.6,
  HI: 77.0,
  IA: 91.6,
  ID: 94.6,
  IL: 87.6,
  IN: 95.7,
  KS: 97.6,
  KY: 97.2,
  LA: 82.1,
  MA: 73.7,
  MD: 84.7,
  ME: 95.3,
  MI: 90.2,
  MN: 97.0,
  MO: 95.2,
  MS: 91.5,
  MT: 96.2,
  NC: 94.3,
  ND: 97.6,
  NE: 93.5,
  NH: 96.8,
  NJ: 80.0,
  NM: 89.8,
  NV: 97.6,
  NY: 80.3,
  OH: 88.7,
  OK: 91.7,
  OR: 94.4,
  PA: 86.7,
  RI: 68.5,
  SC: 95.0,
  SD: 97.4,
  TN: 95.3,
  TX: 90.9,
  UT: 97.0,
  VA: 92.0,
  VT: 94.9,
  WA: 85.0,
  WI: 85.4,
  WV: 92.6,
  WY: 97.9,
};

/**
 * NCES 4-year adjusted cohort graduation rate, all students, percent, 2021-22.
 * New Mexico and Oklahoma were not reported for 2021-22 and carry their 2020-21 values.
 * Source: https://nces.ed.gov/programs/digest/d23/tables/xls/tabn219.46.xlsx (Table 219.46)
 */
const GRADUATION_RATE_2027: Record<string, number> = {
  AK: 77.8,
  AL: 88.2,
  AR: 88.2,
  AZ: 77.3,
  CA: 87.0,
  CO: 82.3,
  CT: 88.9,
  DC: 76.4,
  DE: 87.8,
  FL: 87.3,
  GA: 84.1,
  HI: 86.0,
  IA: 89.9,
  ID: 79.9,
  IL: 87.3,
  IN: 87.7,
  KS: 89.1,
  KY: 90.1,
  LA: 83.1,
  MA: 90.1,
  MD: 86.3,
  ME: 86.1,
  MI: 81.0,
  MN: 83.6,
  MO: 89.8,
  MS: 88.9,
  MT: 85.8,
  NC: 86.4,
  ND: 85.1,
  NE: 87.1,
  NH: 87.7,
  NJ: 85.2,
  NM: 76.6,
  NV: 81.7,
  NY: 86.7,
  OH: 86.2,
  OK: 80.0,
  OR: 81.3,
  PA: 87.0,
  RI: 83.3,
  SC: 83.8,
  SD: 82.1,
  TN: 90.4,
  TX: 89.7,
  UT: 88.2,
  VA: 89.1,
  VT: 82.8,
  WA: 83.6,
  WI: 90.3,
  WV: 91.2,
  WY: 81.8,
};

/**
 * Index mappings for the sourced series above. Both anchor the national population-weighted
 * mean of the real series to the national index value, so state deviations are real and the
 * country rollup does not shift.
 *
 * Air quality: the shared PM2.5 scale (airQualityIndexFromPm25), the same one Canada uses, so
 * equal air reads equal across countries. The national value is that scale at the
 * population-weighted mean of PM25_2027 (7.6 ug/m3).
 *
 * Road condition: index = 70.5 + (state acceptable share - 88.0), where 88.0 is the
 * population-weighted mean of ROAD_ACCEPTABLE_2027 and 70.5 is the national index. Floored at 5.
 */
const PM25_NATIONAL = 7.6;
const ROAD_ACCEPTABLE_NATIONAL = 88.0;
/** BJS all-state prison rate per 100k, 2023 (Table 7). */
const PRISON_ONLY_NATIONAL = 318;
const ROAD_INDEX_NATIONAL = 70.5;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function airQualityIndex2027(pm25: number): number {
  return airQualityIndexFromPm25(pm25);
}

export function roadConditionIndex2027(acceptableShare: number): number {
  return round1(
    Math.max(5, Math.min(100, ROAD_INDEX_NATIONAL + (acceptableShare - ROAD_ACCEPTABLE_NATIONAL)))
  );
}

// ---------------------------------------------------------------------------
// Soft-index national baseline literals
// Metrics with no per-state source stay at these national values in every
// state rather than being spread by an income or broadband tier.
// ---------------------------------------------------------------------------

// National 2023 baselines (documented estimates)
const BASELINE_2027 = {
  // Media Information
  // Pew 2023: partisan news consumption polarization nationally high ~55/100
  mediaPolarization: 55,
  // MIT/Reuters 2023: ~35% Americans exposed to identified disinfo
  disinformationRisk: 48,
  // RSF Press Freedom Index 2023: US ranked 45th, score ≈ 52/100 → 69 on internal scale
  pressFreedom: 65,
  // Gallup 2023: media trust at record low ~16% "a great deal"; mapped to 0-100 = 32
  newsTrust: 32,
  // Social sentiment: slightly negative on national average (divided political climate)
  socialMediaSentiment: -5,

  // Public Safety (national averages)
  // FBI UCR 2023: ~2,300 property crimes per 100k (lower than 2019)
  crimeRate: 2300,
  // FBI UCR 2023: ~380 violent crimes per 100k
  violentCrimeRate: 380,
  // BJS 2023: ~2.2 officers per 1k residents
  policePerCapita: 2.2,
  // BJS 2023: ~450 per 100k (slight decline from peak)
  incarcerationRate: 450,
  // National 3-year recidivism ~43%
  recidivismRate: 43,
  // Gallup 2023: ~63% feel safe in community
  publicSafetyConfidence: 63,

  // Governance
  // Transparency International 2023 CPI: US score 69/100
  governmentTransparency: 60,
  // CBO 2023: federal deficit ~6.2% GDP; state-level average deficit ~-1.5%
  budgetBalance: -1.5,
  // IMF 2023: US federal debt ~120% GDP; state average ~60%
  debtToGdp: 60,
  // TI CPI 2023: US ≈ 69/100 (lower is less corrupt); mapped to 0-100 corruption index
  corruptionIndex: 38,
  // US Elections Project 2022 midterm: 47% VEP; 2020 was 67%. 2023 mid-cycle ≈ 52% average
  voterTurnout: 52,
  // Gallup 2023: ~18% trust federal gov to do right → mapped to 38/100
  publicTrust: 38,
  // V-Dem 2023 co-determination score for US ≈ 45
  coDeterminationQuality: 45,

  // Education
  // NCES 2023: US HS grad rate ≈ 87%
  highSchoolGradRate: 87,
  // NCES 2023: college enrollment rate ≈ 61%
  universityEnrollment: 61,
  // NAEP 2022/23 (most recent): composite index ~100
  testPerformance: 100,
  // Census 2023: avg ed spending per pupil ≈ $14,600
  educationSpending: 14600,
  // PIAAC/NLS 2023: adult literacy ~79% functional
  literacyRate: 79,
  // BLS 2023: skill index proxy via workforce data ≈ 60
  workforceSkill: 60,
  // DOL 2023: apprenticeship rate ~2.5%
  apprenticeshipRate: 2.5,

  // Environment
  // EPA AQI 2023: national Good/Moderate days ≈ 78%; maps to air quality index 32 (lower = worse)
  airQuality: airQualityIndexFromPm25(PM25_NATIONAL),
  // EIA 2023: renewable share ≈ 22% of electricity gen
  renewableEnergy: 22,
  // EIA 2023: US CO2 ≈ 14.9 metric tons per capita (down from 2019)
  carbonEmissions: 14,
  // EPA 2023: 32% waste diversion nationally
  recyclingRate: 32,
  // ND-GAIN 2023: US climate resilience score ≈ 60
  climateResilience: 60,
  // EPA/NPS 2023: ~13% US land protected
  protectedLand: 13,
  // REN21 2023: energy transition progress proxy ≈ 35
  energyTransitionProgress: 35,

  // Social
  // CBO/Pew 2023: social mobility index ~54
  socialMobility: 54,
  // Census ACS 2023: Gini ≈ 0.482; mapped to game's 0-100 scale (higher = more unequal)
  incomeInequality: 46,
  // HUD 2023: ~0.17% population experiencing homelessness on PIT count
  homelessnessRate: 8,
  // USDA 2023: 13.5% food insecurity
  foodInsecurity: 13.5,
  // NCSL 2023: civic participation index ≈ 55
  civicParticipation: 55,
  // Gallup 2023: social cohesion index ≈ 55 (post-COVID partial recovery)
  socialCohesion: 55,
  // Annual housing permits 2023: ~1.4M units / ~130M households ≈ 1.1% supply growth
  housingSupplyGrowth: 1.1,
  // Healthcare
  // CMS/Census 2023: US uninsured ≈ 9.2%
  uninsuredRate: 9.2,
  // KFF 2023: affordability index ≈ 58/100
  affordabilityIndex: 58,
  // AAMC 2023: ~2.7 physicians per 1k
  physicianRate: 2.7,
  // CDC 2023: preventable mortality ≈ 320 per 100k
  preventableMortality: 320,
  // JHCHS 2023: public health preparedness ≈ 63/100
  publicHealthPreparedness: 63,
};

/** Mid-range values held uniform across states where no per-state series exists. */
const UNIFORM_2027 = {
  smallBusinessFormation: 4.5,
  rdIntensity: 1.9,
  manufacturingCompetitiveness: 60,
  publicTransitBase: 10,
  waterQuality: 91,
  powerGridReliability: 99.7,
  infrastructureInvestmentGap: 22,
};

// ---------------------------------------------------------------------------
// Income tier (1-5) from median income. Used only by the property crime rate,
// which has no retrievable per-state table.
// ---------------------------------------------------------------------------
function econTier(stateId: string): 1 | 2 | 3 | 4 | 5 {
  const income = MEDIAN_INCOME_2027[stateId] ?? 72000;
  if (income >= 88000) return 5;
  if (income >= 76000) return 4;
  if (income >= 65000) return 3;
  if (income >= 55000) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Opening separatist mood for states in the sovereignty registry. Texas, California and the
 * New England states sit well below the 60 needed to request a referendum, so secession starts as a
 * minority position that campaigns and national events can move.
 */
const SECESSION_MOOD_2027: Record<string, number> = {
  TX: 32,
  CA: 28,
  ME: 24,
  NH: 22,
  VT: 30,
  MA: 20,
  RI: 22,
  CT: 18,
};

function build2023Metrics(stateId: string): StateMetrics {
  const et = econTier(stateId) - 1; // 0..4
  const urban = URBANIZATION_2027[stateId] ?? 70;
  const popGrowth = POP_GROWTH_2027[stateId] ?? 0.5;
  const medAge = MEDIAN_AGE_2027[stateId] ?? 38.5;
  const unemp = UNEMP_2027[stateId] ?? 3.6;
  const income = MEDIAN_INCOME_2027[stateId] ?? 72000;
  const poverty = POVERTY_2027[stateId] ?? 11.1;
  const gdpGrowth = GDP_GROWTH_2027[stateId] ?? 2.5;
  const lifeExp = LIFE_EXPECTANCY_2027[stateId] ?? 78.4;
  const broadband = BROADBAND_2027[stateId] ?? 82.6;
  const col = COST_OF_LIVING_2027[stateId] ?? 100;

  // Property crime only: no per-state table was retrievable, so it still leans on income tier.
  const leanMod = (et - 2) * 2; // -4 to +4

  return withUniformMetricSet({
    _id: stateId,
    countryId: "US",

    economic: {
      unemploymentRate: mv(unemp),
      medianIncome: mv(income),
      gdpGrowth: mv(gdpGrowth),
      povertyRate: mv(poverty),
      costOfLiving: mv(col),
      smallBusinessFormation: mv(UNIFORM_2027.smallBusinessFormation),
      laborParticipation: mv(63),
      matchingFriction: mv(5),
      tradeBalance: mv(0),
      productivityGrowth: mv(Math.round(gdpGrowth * 0.55 * 10) / 10),
      rdIntensity: mv(UNIFORM_2027.rdIntensity),
      exportDependency: mv(35),
      manufacturingCompetitiveness: mv(UNIFORM_2027.manufacturingCompetitiveness),
    },

    education: {
      highSchoolGradRate: mv(GRADUATION_RATE_2027[stateId] ?? BASELINE_2027.highSchoolGradRate),
      universityEnrollment: mv(BASELINE_2027.universityEnrollment),
      testPerformance: mv(BASELINE_2027.testPerformance),
      educationSpending: mv(BASELINE_2027.educationSpending),
      literacyRate: mv(BASELINE_2027.literacyRate),
      workforceSkill: mv(BASELINE_2027.workforceSkill),
      apprenticeshipRate: mv(BASELINE_2027.apprenticeshipRate),
    },

    healthcare: {
      uninsuredRate: mv(UNINSURED_2027[stateId] ?? BASELINE_2027.uninsuredRate),
      affordabilityIndex: mv(BASELINE_2027.affordabilityIndex),
      physicianRate: mv(BASELINE_2027.physicianRate),
      lifeExpectancy: mv(lifeExp),
      preventableMortality: mv(BASELINE_2027.preventableMortality),
      publicHealthPreparedness: mv(BASELINE_2027.publicHealthPreparedness),
    },

    infrastructure: {
      roadCondition: mv(
        ROAD_ACCEPTABLE_2027[stateId] === undefined
          ? ROAD_INDEX_NATIONAL
          : roadConditionIndex2027(ROAD_ACCEPTABLE_2027[stateId])
      ),
      broadbandAccess: mv(broadband),
      publicTransit: mv(Math.round(urban * 0.5 + UNIFORM_2027.publicTransitBase)),
      waterQuality: mv(UNIFORM_2027.waterQuality),
      powerGridReliability: mv(UNIFORM_2027.powerGridReliability),
      infrastructureInvestmentGap: mv(UNIFORM_2027.infrastructureInvestmentGap),
    },

    publicSafety: {
      crimeRate: mv(BASELINE_2027.crimeRate + (urban - 70) * 8 - leanMod * 40),
      violentCrimeRate: mv(VIOLENT_CRIME_2027[stateId] ?? BASELINE_2027.violentCrimeRate),
      policePerCapita: mv(BASELINE_2027.policePerCapita),
      // BJS counts state prisons only; scale to the prison-plus-jail national total so the
      // rate is comparable with Canada's provincial-plus-federal custody figure.
      incarcerationRate: mv(
        round1(
          ((IMPRISONMENT_2027[stateId] ?? PRISON_ONLY_NATIONAL) * BASELINE_2027.incarcerationRate) /
            PRISON_ONLY_NATIONAL
        )
      ),
      recidivismRate: mv(BASELINE_2027.recidivismRate),
      publicSafetyConfidence: mv(BASELINE_2027.publicSafetyConfidence),
    },

    environment: {
      airQuality: mv(
        PM25_2027[stateId] === undefined
          ? BASELINE_2027.airQuality
          : airQualityIndex2027(PM25_2027[stateId])
      ),
      renewableEnergy: mv(RENEWABLE_SHARE_2027[stateId] ?? BASELINE_2027.renewableEnergy),
      carbonEmissions: mv(CO2_PER_CAPITA_2027[stateId] ?? BASELINE_2027.carbonEmissions),
      recyclingRate: mv(BASELINE_2027.recyclingRate),
      climateResilience: mv(BASELINE_2027.climateResilience),
      protectedLand: mv(PROTECTED_LAND_2027[stateId] ?? BASELINE_2027.protectedLand),
      energyTransitionProgress: mv(BASELINE_2027.energyTransitionProgress),
    },

    social: {
      socialMobility: mv(BASELINE_2027.socialMobility),
      incomeInequality: mv(BASELINE_2027.incomeInequality),
      homelessnessRate: mv(
        Math.max(1, BASELINE_2027.homelessnessRate + (col - 100) * 0.06 + urban * 0.04)
      ),
      foodInsecurity: mv(FOOD_INSECURITY_2027[stateId] ?? BASELINE_2027.foodInsecurity),
      civicParticipation: mv(BASELINE_2027.civicParticipation),
      socialCohesion: mv(BASELINE_2027.socialCohesion),
      housingSupplyGrowth: mv(BASELINE_2027.housingSupplyGrowth + popGrowth * 0.3),
    },

    governance: {
      governmentTransparency: mv(BASELINE_2027.governmentTransparency),
      budgetBalance: mv(BASELINE_2027.budgetBalance),
      debtToGdp: mv(BASELINE_2027.debtToGdp),
      // No state-level corruption series with a defensible source was retrievable.
      corruptionIndex: mv(BASELINE_2027.corruptionIndex),
      voterTurnout: mv(VOTER_TURNOUT_2027[stateId] ?? BASELINE_2027.voterTurnout),
      publicTrust: mv(BASELINE_2027.publicTrust),
      coDeterminationQuality: mv(BASELINE_2027.coDeterminationQuality),
      ...(stateId in SECESSION_MOOD_2027
        ? { independenceDesire: mv(SECESSION_MOOD_2027[stateId]) }
        : {}),
    },

    population: {
      populationGrowth: mv(popGrowth),
      urbanizationRate: mv(urban),
      medianAge: mv(medAge),
      migrationRate: mv(popGrowth - 0.3),
    },

    mediaInformation: {
      mediaPolarization: mv(BASELINE_2027.mediaPolarization),
      disinformationRisk: mv(BASELINE_2027.disinformationRisk),
      pressFreedom: mv(BASELINE_2027.pressFreedom),
      socialMediaSentiment: mv(BASELINE_2027.socialMediaSentiment),
      newsTrust: mv(BASELINE_2027.newsTrust),
    },

    lastUpdated: new Date(0),
  });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const stateMetrics2027: StateMetrics[] = states2027
  .filter((s) => s.countryId === "US")
  .map((s) => build2023Metrics(s._id));
