/**
 * Sourced per-state tables for 2027 social and governance openings, kept apart
 * from the main 2027 metric file so each figure carries its own citation.
 */

/**
 * FBI property crime offenses per 100k people, 2024: Crime Data Explorer
 * summarized state counts over the population of reporting agencies
 * (https://cde.ucr.cjis.gov). National 1,772, published estimate 1,760.
 */
export const PROPERTY_CRIME_2024: Readonly<Record<string, number>> = {
  AK: 1746.9,
  AL: 1642.9,
  AR: 1970.5,
  AZ: 1799.3,
  CA: 1992.9,
  CO: 2668.2,
  CT: 1397.6,
  DC: 3739.3,
  DE: 1774.0,
  FL: 1251.8,
  GA: 1709.0,
  HI: 2058.2,
  IA: 1331.3,
  ID: 758.8,
  IL: 1766.4,
  IN: 1506.4,
  KS: 2174.5,
  KY: 1400.9,
  LA: 2171.3,
  MA: 1127.0,
  MD: 2076.9,
  ME: 1156.5,
  MI: 1429.3,
  MN: 1626.8,
  MO: 2008.4,
  MS: 1464.4,
  MT: 1649.6,
  NC: 2008.0,
  ND: 1710.8,
  NE: 1677.0,
  NH: 929.0,
  NJ: 1432.2,
  NM: 2886.1,
  NV: 2237.6,
  NY: 1716.1,
  OH: 1647.3,
  OK: 2013.0,
  OR: 2454.0,
  PA: 1466.6,
  RI: 1041.8,
  SC: 1993.5,
  SD: 1714.1,
  TN: 2067.2,
  TX: 2074.1,
  UT: 1492.5,
  VA: 1591.9,
  VT: 1669.7,
  WA: 2520.9,
  WI: 1192.6,
  WV: 1181.9,
  WY: 1322.9,
};

/**
 * People experiencing homelessness per 10,000 residents, January 2024 point in
 * time: HUD 2024 AHAR Part 1, Appendix A state counts over Census 2024
 * population. National 22.6 (HUD rounds to 23).
 */
export const HOMELESSNESS_2024: Readonly<Record<string, number>> = {
  AK: 36.3,
  AL: 8.9,
  AR: 9.0,
  AZ: 19.4,
  CA: 47.4,
  CO: 31.4,
  CT: 9.3,
  DC: 80.0,
  DE: 12.9,
  FL: 13.4,
  GA: 11.0,
  HI: 80.5,
  IA: 8.1,
  ID: 13.7,
  IL: 20.3,
  IN: 9.1,
  KS: 9.4,
  KY: 11.4,
  LA: 7.5,
  MA: 41.1,
  MD: 9.7,
  ME: 19.2,
  MI: 9.6,
  MN: 15.9,
  MO: 11.7,
  MS: 3.5,
  MT: 17.7,
  NC: 10.5,
  ND: 10.9,
  NE: 13.6,
  NH: 15.9,
  NJ: 13.4,
  NM: 21.7,
  NV: 30.9,
  NY: 79.5,
  OH: 9.9,
  OK: 13.3,
  OR: 53.5,
  PA: 10.8,
  RI: 22.0,
  SC: 8.4,
  SD: 14.5,
  TN: 11.5,
  TX: 8.9,
  UT: 11.0,
  VA: 8.1,
  VT: 53.3,
  WA: 39.6,
  WI: 8.5,
  WV: 10.1,
  WY: 8.5,
};

/**
 * Federal public corruption convictions per million residents per year,
 * 2014 to 2023: DOJ Public Integrity Section 2023 report, Table III, districts
 * summed by state. DC is high because federal officials are tried there.
 */
export const CORRUPTION_CONVICTIONS_2014_2023: Readonly<Record<string, number>> = {
  AK: 2.7,
  AL: 2.81,
  AR: 2.27,
  AZ: 2.53,
  CA: 1.39,
  CO: 0.37,
  CT: 0.9,
  DC: 19.22,
  DE: 0.57,
  FL: 2.19,
  GA: 2.56,
  HI: 2.42,
  IA: 1.2,
  ID: 1.3,
  IL: 2.58,
  IN: 1.82,
  KS: 1.75,
  KY: 3.33,
  LA: 6.22,
  MA: 2.23,
  MD: 3.74,
  ME: 1.0,
  MI: 1.85,
  MN: 0.76,
  MO: 2.37,
  MS: 3.19,
  MT: 11.17,
  NC: 1.0,
  ND: 1.63,
  NE: 3.34,
  NH: 0.35,
  NJ: 2.62,
  NM: 2.21,
  NV: 0.73,
  NY: 2.06,
  OH: 1.47,
  OK: 3.15,
  OR: 0.35,
  PA: 2.42,
  RI: 0.81,
  SC: 0.77,
  SD: 6.71,
  TN: 1.87,
  TX: 1.81,
  UT: 0.31,
  VA: 3.3,
  VT: 0.46,
  WA: 0.97,
  WI: 1.29,
  WV: 5.76,
  WY: 0.17,
};

export const PROPERTY_CRIME_NATIONAL_2024 = 1772;
export const HOMELESSNESS_NATIONAL_2024 = 22.6;
const CORRUPTION_CONVICTIONS_NATIONAL = 2.04;

/**
 * Corruption-risk index around the national 38: each doubling of a state's
 * conviction rate against the national rate adds about 4 points.
 */
export function corruptionIndexFromConvictions(perMillion: number, national = 38): number {
  const ratio = Math.max(perMillion, 0.01) / CORRUPTION_CONVICTIONS_NATIONAL;
  return Math.round(Math.max(10, Math.min(80, national + 6 * Math.log(ratio))) * 10) / 10;
}
