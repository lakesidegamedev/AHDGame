/**
 * Census profiles for California's successor regions, built from the US CA
 * 2027 profile (ACS-based race, education, wealth and age shares, with the
 * game's ideology calibration). The coastal metros and the inland and valley
 * regions are pulled apart from the state mix so the population-weighted
 * average stays close to the state profile.
 */
import type { Layer1Config } from "@/lib/seeds/stateDemographics";

export const rcaRegionCensusData2027: Record<string, Layer1Config> = {
  RCA_LAX: {
    race: { white: 24, black: 7, hispanic: 48, asian: 16, other: 5 },
    education: { no_college: 62, college: 23, graduate: 15 },
    wealth: { low: 25, middle: 41, high: 34 },
    age: { young: 29, mid: 28, mature: 22, senior: 21 },
    ideology: {
      evangelicals: 14,
      environmentalists: 15,
      libertarians: 9,
      progressives: 20,
      patriots: 20,
      gunowners: 22,
    },
  },
  RCA_BAY: {
    race: { white: 33, black: 5, hispanic: 22, asian: 36, other: 4 },
    education: { no_college: 45, college: 28, graduate: 27 },
    wealth: { low: 14, middle: 34, high: 52 },
    age: { young: 27, mid: 29, mature: 23, senior: 21 },
    ideology: {
      evangelicals: 10,
      environmentalists: 20,
      libertarians: 10,
      progressives: 26,
      patriots: 16,
      gunowners: 18,
    },
  },
  RCA_SAN: {
    race: { white: 41, black: 4, hispanic: 33, asian: 17, other: 5 },
    education: { no_college: 52, college: 30, graduate: 18 },
    wealth: { low: 19, middle: 41, high: 40 },
    age: { young: 29, mid: 27, mature: 22, senior: 22 },
    ideology: {
      evangelicals: 17,
      environmentalists: 17,
      libertarians: 11,
      progressives: 18,
      patriots: 22,
      gunowners: 24,
    },
  },
  RCA_INL: {
    race: { white: 30, black: 7, hispanic: 54, asian: 6, other: 3 },
    education: { no_college: 72, college: 19, graduate: 9 },
    wealth: { low: 28, middle: 48, high: 24 },
    age: { young: 30, mid: 27, mature: 22, senior: 21 },
    ideology: {
      evangelicals: 20,
      environmentalists: 12,
      libertarians: 10,
      progressives: 11,
      patriots: 25,
      gunowners: 32,
    },
  },
  RCA_CVY: {
    race: { white: 31, black: 4, hispanic: 55, asian: 7, other: 3 },
    education: { no_college: 76, college: 16, graduate: 8 },
    wealth: { low: 34, middle: 46, high: 20 },
    age: { young: 31, mid: 26, mature: 21, senior: 22 },
    ideology: {
      evangelicals: 22,
      environmentalists: 9,
      libertarians: 9,
      progressives: 9,
      patriots: 27,
      gunowners: 36,
    },
  },
  RCA_NOR: {
    race: { white: 55, black: 5, hispanic: 21, asian: 11, other: 8 },
    education: { no_college: 54, college: 28, graduate: 18 },
    wealth: { low: 20, middle: 42, high: 38 },
    age: { young: 27, mid: 27, mature: 23, senior: 23 },
    ideology: {
      evangelicals: 15,
      environmentalists: 17,
      libertarians: 12,
      progressives: 19,
      patriots: 20,
      gunowners: 23,
    },
  },
};
