import type { Layer1Config } from "@/lib/seeds/stateDemographicsPure";
import { stateCensusData1979 } from "./usStateCensusData1979";

/*
 * US Layer-1 census bundle for the 1953 era.
 *
 * Census shares (race/education/wealth/age) come from the 1950 Census, not
 * the 1979 bundle. Unseeded groups (e.g. Spanish-surname Hispanics folded
 * into White at ~2% nationally, American Indian/Alaska Native/Pacific in
 * `other`) and per-state magnitudes are calibrated to 1950 figures.
 *
 * Ideology shares still reuse 1979: no 1950 census analog, and 1953
 * political behavior is driven by era position/composition tables.
 *
 * Per-state `positions` blocks are deliberately ABSENT. State-authored
 * positions merge ABOVE era tables (see deriveGroupLeanFromLayer1) and would
 * silently override the 1953 era table and Solid-South/Plains/Yankee-
 * Republican overrides. Positions are governed entirely by
 * `getEraPositions("1953", stateId)`.
 */
const CENSUS_SHARES_1950: Record<string, Omit<Layer1Config, "ideology" | "positions">> = {
  AK: {
    race: { white: 70, black: 2, hispanic: 1, asian: 2, other: 25 },
    education: { no_college: 90, college: 8, graduate: 2 },
    wealth: { low: 32, middle: 50, high: 18 },
    age: { young: 37, mid: 32, mature: 24, senior: 7 },
  },
  AL: {
    race: { white: 66, black: 32, hispanic: 1, asian: 0, other: 1 },
    education: { no_college: 95, college: 4, graduate: 1 },
    wealth: { low: 49, middle: 41, high: 10 },
    age: { young: 31, mid: 28, mature: 26, senior: 15 },
  },
  AR: {
    race: { white: 76, black: 22, hispanic: 1, asian: 0, other: 1 },
    education: { no_college: 96, college: 3, graduate: 1 },
    wealth: { low: 51, middle: 40, high: 9 },
    age: { young: 29, mid: 27, mature: 26, senior: 18 },
  },
  AZ: {
    race: { white: 74, black: 3, hispanic: 13, asian: 1, other: 9 },
    education: { no_college: 93, college: 6, graduate: 1 },
    wealth: { low: 37, middle: 49, high: 14 },
    age: { young: 31, mid: 28, mature: 25, senior: 16 },
  },
  CA: {
    race: { white: 84, black: 4, hispanic: 8, asian: 3, other: 1 },
    education: { no_college: 90, college: 8, graduate: 2 },
    wealth: { low: 33, middle: 47, high: 20 },
    age: { young: 32, mid: 30, mature: 25, senior: 13 },
  },
  CO: {
    race: { white: 88, black: 2, hispanic: 9, asian: 0, other: 1 },
    education: { no_college: 91, college: 7, graduate: 2 },
    wealth: { low: 33, middle: 51, high: 16 },
    age: { young: 34, mid: 30, mature: 24, senior: 12 },
  },
  CT: {
    race: { white: 96, black: 3, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 90, college: 8, graduate: 2 },
    wealth: { low: 27, middle: 47, high: 26 },
    age: { young: 28, mid: 28, mature: 28, senior: 16 },
  },
  DC: {
    race: { white: 62, black: 35, hispanic: 2, asian: 1, other: 0 },
    education: { no_college: 84, college: 12, graduate: 4 },
    wealth: { low: 38, middle: 44, high: 18 },
    age: { young: 33, mid: 30, mature: 25, senior: 12 },
  },
  DE: {
    race: { white: 85, black: 14, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 92, college: 6, graduate: 2 },
    wealth: { low: 33, middle: 49, high: 18 },
    age: { young: 30, mid: 29, mature: 27, senior: 14 },
  },
  FL: {
    race: { white: 75, black: 22, hispanic: 2, asian: 0, other: 1 },
    education: { no_college: 93, college: 6, graduate: 1 },
    wealth: { low: 39, middle: 47, high: 14 },
    age: { young: 26, mid: 26, mature: 26, senior: 22 },
  },
  GA: {
    race: { white: 68, black: 31, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 95, college: 4, graduate: 1 },
    wealth: { low: 47, middle: 41, high: 12 },
    age: { young: 33, mid: 29, mature: 25, senior: 13 },
  },
  HI: {
    race: { white: 25, black: 1, hispanic: 2, asian: 57, other: 15 },
    education: { no_college: 93, college: 6, graduate: 1 },
    wealth: { low: 31, middle: 51, high: 18 },
    age: { young: 33, mid: 31, mature: 25, senior: 11 },
  },
  IA: {
    race: { white: 98, black: 1, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 94, college: 5, graduate: 1 },
    wealth: { low: 35, middle: 53, high: 12 },
    age: { young: 29, mid: 27, mature: 26, senior: 18 },
  },
  ID: {
    race: { white: 97, black: 0, hispanic: 2, asian: 0, other: 1 },
    education: { no_college: 94, college: 5, graduate: 1 },
    wealth: { low: 39, middle: 51, high: 10 },
    age: { young: 33, mid: 28, mature: 25, senior: 14 },
  },
  IL: {
    race: { white: 90, black: 7, hispanic: 2, asian: 1, other: 0 },
    education: { no_college: 93, college: 6, graduate: 1 },
    wealth: { low: 30, middle: 51, high: 19 },
    age: { young: 31, mid: 29, mature: 26, senior: 14 },
  },
  IN: {
    race: { white: 94, black: 5, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 94, college: 5, graduate: 1 },
    wealth: { low: 32, middle: 55, high: 13 },
    age: { young: 31, mid: 28, mature: 26, senior: 15 },
  },
  KS: {
    race: { white: 94, black: 4, hispanic: 2, asian: 0, other: 0 },
    education: { no_college: 93, college: 6, graduate: 1 },
    wealth: { low: 35, middle: 53, high: 12 },
    age: { young: 30, mid: 28, mature: 25, senior: 17 },
  },
  KY: {
    race: { white: 92, black: 7, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 96, college: 3, graduate: 1 },
    wealth: { low: 51, middle: 40, high: 9 },
    age: { young: 31, mid: 28, mature: 26, senior: 15 },
  },
  LA: {
    race: { white: 65, black: 33, hispanic: 1, asian: 0, other: 1 },
    education: { no_college: 95, college: 4, graduate: 1 },
    wealth: { low: 47, middle: 41, high: 12 },
    age: { young: 34, mid: 28, mature: 25, senior: 13 },
  },
  MA: {
    race: { white: 97, black: 2, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 89, college: 9, graduate: 2 },
    wealth: { low: 31, middle: 49, high: 20 },
    age: { young: 30, mid: 28, mature: 26, senior: 16 },
  },
  MD: {
    race: { white: 82, black: 17, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 92, college: 6, graduate: 2 },
    wealth: { low: 31, middle: 49, high: 20 },
    age: { young: 31, mid: 30, mature: 26, senior: 13 },
  },
  ME: {
    race: { white: 99, black: 0, hispanic: 0, asian: 0, other: 1 },
    education: { no_college: 94, college: 5, graduate: 1 },
    wealth: { low: 43, middle: 47, high: 10 },
    age: { young: 28, mid: 27, mature: 27, senior: 18 },
  },
  MI: {
    race: { white: 92, black: 7, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 94, college: 5, graduate: 1 },
    wealth: { low: 30, middle: 53, high: 17 },
    age: { young: 32, mid: 29, mature: 26, senior: 13 },
  },
  MN: {
    race: { white: 98, black: 1, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 94, college: 5, graduate: 1 },
    wealth: { low: 33, middle: 53, high: 14 },
    age: { young: 31, mid: 29, mature: 25, senior: 15 },
  },
  MO: {
    race: { white: 91, black: 8, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 94, college: 5, graduate: 1 },
    wealth: { low: 39, middle: 49, high: 12 },
    age: { young: 29, mid: 28, mature: 26, senior: 17 },
  },
  MS: {
    race: { white: 54, black: 45, hispanic: 0, asian: 0, other: 1 },
    education: { no_college: 96, college: 3, graduate: 1 },
    wealth: { low: 55, middle: 37, high: 8 },
    age: { young: 34, mid: 27, mature: 25, senior: 14 },
  },
  MT: {
    race: { white: 95, black: 0, hispanic: 1, asian: 0, other: 4 },
    education: { no_college: 93, college: 6, graduate: 1 },
    wealth: { low: 39, middle: 51, high: 10 },
    age: { young: 31, mid: 28, mature: 26, senior: 15 },
  },
  NC: {
    race: { white: 72, black: 26, hispanic: 1, asian: 0, other: 1 },
    education: { no_college: 95, college: 4, graduate: 1 },
    wealth: { low: 45, middle: 45, high: 10 },
    age: { young: 32, mid: 29, mature: 25, senior: 14 },
  },
  ND: {
    race: { white: 97, black: 0, hispanic: 1, asian: 0, other: 2 },
    education: { no_college: 95, college: 4, graduate: 1 },
    wealth: { low: 37, middle: 53, high: 10 },
    age: { young: 32, mid: 27, mature: 24, senior: 17 },
  },
  NE: {
    race: { white: 97, black: 1, hispanic: 2, asian: 0, other: 0 },
    education: { no_college: 93, college: 6, graduate: 1 },
    wealth: { low: 35, middle: 53, high: 12 },
    age: { young: 30, mid: 27, mature: 25, senior: 18 },
  },
  NH: {
    race: { white: 99, black: 0, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 93, college: 6, graduate: 1 },
    wealth: { low: 33, middle: 51, high: 16 },
    age: { young: 30, mid: 29, mature: 26, senior: 15 },
  },
  NJ: {
    race: { white: 92, black: 7, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 92, college: 6, graduate: 2 },
    wealth: { low: 29, middle: 47, high: 24 },
    age: { young: 29, mid: 28, mature: 28, senior: 15 },
  },
  NM: {
    race: { white: 56, black: 1, hispanic: 35, asian: 0, other: 8 },
    education: { no_college: 93, college: 6, graduate: 1 },
    wealth: { low: 45, middle: 45, high: 10 },
    age: { young: 34, mid: 28, mature: 25, senior: 13 },
  },
  NV: {
    race: { white: 92, black: 3, hispanic: 2, asian: 0, other: 3 },
    education: { no_college: 93, college: 6, graduate: 1 },
    wealth: { low: 33, middle: 51, high: 16 },
    age: { young: 31, mid: 30, mature: 26, senior: 13 },
  },
  NY: {
    race: { white: 91, black: 6, hispanic: 2, asian: 1, other: 0 },
    education: { no_college: 90, college: 8, graduate: 2 },
    wealth: { low: 37, middle: 45, high: 18 },
    age: { young: 30, mid: 28, mature: 27, senior: 15 },
  },
  OH: {
    race: { white: 93, black: 6, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 94, college: 5, graduate: 1 },
    wealth: { low: 30, middle: 55, high: 15 },
    age: { young: 31, mid: 28, mature: 26, senior: 15 },
  },
  OK: {
    race: { white: 90, black: 7, hispanic: 1, asian: 0, other: 2 },
    education: { no_college: 93, college: 6, graduate: 1 },
    wealth: { low: 39, middle: 49, high: 12 },
    age: { young: 30, mid: 28, mature: 25, senior: 17 },
  },
  OR: {
    race: { white: 97, black: 1, hispanic: 1, asian: 1, other: 0 },
    education: { no_college: 92, college: 7, graduate: 1 },
    wealth: { low: 35, middle: 53, high: 12 },
    age: { young: 30, mid: 29, mature: 26, senior: 15 },
  },
  PA: {
    race: { white: 93, black: 6, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 94, college: 5, graduate: 1 },
    wealth: { low: 35, middle: 51, high: 14 },
    age: { young: 28, mid: 27, mature: 27, senior: 18 },
  },
  RI: {
    race: { white: 98, black: 2, hispanic: 0, asian: 0, other: 0 },
    education: { no_college: 93, college: 6, graduate: 1 },
    wealth: { low: 37, middle: 49, high: 14 },
    age: { young: 29, mid: 27, mature: 27, senior: 17 },
  },
  SC: {
    race: { white: 60, black: 39, hispanic: 0, asian: 0, other: 1 },
    education: { no_college: 96, college: 3, graduate: 1 },
    wealth: { low: 49, middle: 41, high: 10 },
    age: { young: 34, mid: 29, mature: 24, senior: 13 },
  },
  SD: {
    race: { white: 95, black: 0, hispanic: 1, asian: 0, other: 4 },
    education: { no_college: 95, college: 4, graduate: 1 },
    wealth: { low: 41, middle: 49, high: 10 },
    age: { young: 31, mid: 27, mature: 24, senior: 18 },
  },
  TN: {
    race: { white: 83, black: 16, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 95, college: 4, graduate: 1 },
    wealth: { low: 47, middle: 43, high: 10 },
    age: { young: 31, mid: 28, mature: 26, senior: 15 },
  },
  TX: {
    race: { white: 72, black: 13, hispanic: 14, asian: 0, other: 1 },
    education: { no_college: 93, college: 6, graduate: 1 },
    wealth: { low: 39, middle: 47, high: 14 },
    age: { young: 34, mid: 29, mature: 24, senior: 13 },
  },
  UT: {
    race: { white: 97, black: 0, hispanic: 2, asian: 0, other: 1 },
    education: { no_college: 91, college: 7, graduate: 2 },
    wealth: { low: 33, middle: 55, high: 12 },
    age: { young: 41, mid: 27, mature: 21, senior: 11 },
  },
  VA: {
    race: { white: 77, black: 22, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 94, college: 5, graduate: 1 },
    wealth: { low: 37, middle: 47, high: 16 },
    age: { young: 32, mid: 30, mature: 25, senior: 13 },
  },
  VT: {
    race: { white: 99, black: 0, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 93, college: 6, graduate: 1 },
    wealth: { low: 41, middle: 49, high: 10 },
    age: { young: 31, mid: 28, mature: 25, senior: 16 },
  },
  WA: {
    race: { white: 95, black: 1, hispanic: 1, asian: 2, other: 1 },
    education: { no_college: 91, college: 7, graduate: 2 },
    wealth: { low: 33, middle: 53, high: 14 },
    age: { young: 31, mid: 29, mature: 25, senior: 15 },
  },
  WI: {
    race: { white: 98, black: 1, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 94, college: 5, graduate: 1 },
    wealth: { low: 30, middle: 57, high: 13 },
    age: { young: 31, mid: 28, mature: 25, senior: 16 },
  },
  WV: {
    race: { white: 94, black: 5, hispanic: 1, asian: 0, other: 0 },
    education: { no_college: 96, college: 3, graduate: 1 },
    wealth: { low: 53, middle: 39, high: 8 },
    age: { young: 28, mid: 27, mature: 27, senior: 18 },
  },
  WY: {
    race: { white: 94, black: 1, hispanic: 4, asian: 0, other: 1 },
    education: { no_college: 92, college: 7, graduate: 1 },
    wealth: { low: 31, middle: 53, high: 16 },
    age: { young: 35, mid: 30, mature: 24, senior: 11 },
  },
};

export const stateCensusData1953: Record<string, Layer1Config> = Object.fromEntries(
  Object.entries(CENSUS_SHARES_1950).map(([stateId, censusShares]) => [
    stateId,
    { ...censusShares, ideology: stateCensusData1979[stateId].ideology },
  ])
);
