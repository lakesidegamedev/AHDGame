/**
 * Turkey region census profiles for the 1991 era, anchored on the 1990 census.
 * Majority urban, older and better schooled than 1979, with the east still
 * behind and a larger Kurdish share. Authored for 1991; each dimension sums to 100.
 */

import type { TRRegionLayer1 } from "./trRegionCensusData";

export const trRegionCensusData1991: Record<string, TRRegionLayer1> = {
  TR_IST: {
    ethnicity: { turkish: 87, kurdish: 10, other: 3 },
    age: { young: 33, mid: 33, mature: 21, senior: 13 },
    education: { primary_or_below: 42, secondary: 33, vocational: 13, university: 12 },
    income: { low: 27, middle: 52, high: 21 },
    urbanization: { urban: 89, suburban: 8, rural: 3 },
  },
  TR_ANK: {
    ethnicity: { turkish: 90, kurdish: 8, other: 2 },
    age: { young: 33, mid: 32, mature: 21, senior: 14 },
    education: { primary_or_below: 38, secondary: 33, vocational: 14, university: 15 },
    income: { low: 27, middle: 52, high: 21 },
    urbanization: { urban: 79, suburban: 10, rural: 11 },
  },
  TR_IZM: {
    ethnicity: { turkish: 92, kurdish: 5, other: 3 },
    age: { young: 31, mid: 32, mature: 22, senior: 15 },
    education: { primary_or_below: 42, secondary: 33, vocational: 14, university: 11 },
    income: { low: 26, middle: 54, high: 20 },
    urbanization: { urban: 76, suburban: 10, rural: 14 },
  },
  TR_MED: {
    ethnicity: { turkish: 82, kurdish: 16, other: 2 },
    age: { young: 36, mid: 31, mature: 20, senior: 13 },
    education: { primary_or_below: 49, secondary: 31, vocational: 12, university: 8 },
    income: { low: 33, middle: 51, high: 16 },
    urbanization: { urban: 64, suburban: 11, rural: 25 },
  },
  TR_BLA: {
    ethnicity: { turkish: 94, kurdish: 4, other: 2 },
    age: { young: 33, mid: 30, mature: 22, senior: 15 },
    education: { primary_or_below: 52, secondary: 31, vocational: 11, university: 6 },
    income: { low: 35, middle: 51, high: 14 },
    urbanization: { urban: 51, suburban: 11, rural: 38 },
  },
  TR_ESA: {
    ethnicity: { turkish: 55, kurdish: 43, other: 2 },
    age: { young: 40, mid: 30, mature: 18, senior: 12 },
    education: { primary_or_below: 61, secondary: 25, vocational: 8, university: 6 },
    income: { low: 52, middle: 40, high: 8 },
    urbanization: { urban: 49, suburban: 10, rural: 41 },
  },
  TR_SEA: {
    ethnicity: { turkish: 30, kurdish: 68, other: 2 },
    age: { young: 42, mid: 30, mature: 16, senior: 12 },
    education: { primary_or_below: 66, secondary: 23, vocational: 7, university: 4 },
    income: { low: 57, middle: 37, high: 6 },
    urbanization: { urban: 55, suburban: 10, rural: 35 },
  },
  TR_CEN: {
    ethnicity: { turkish: 90, kurdish: 9, other: 1 },
    age: { young: 35, mid: 30, mature: 20, senior: 15 },
    education: { primary_or_below: 52, secondary: 30, vocational: 11, university: 7 },
    income: { low: 36, middle: 52, high: 12 },
    urbanization: { urban: 58, suburban: 12, rural: 30 },
  },
};
