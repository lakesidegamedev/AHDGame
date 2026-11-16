/**
 * Census profiles for Texas's successor regions, built from the US TX 2027
 * profile (ACS-based race, education, wealth and age shares, with the game's
 * ideology calibration). The big metros and the border and rural regions are
 * pulled apart from the state mix so the population-weighted average stays
 * close to the state profile.
 */
import type { Layer1Config } from "@/lib/seeds/stateDemographics";

export const rtxRegionCensusData2027: Record<string, Layer1Config> = {
  RTX_DFW: {
    race: { white: 40, black: 15, hispanic: 29, asian: 12, other: 4 },
    education: { no_college: 56, college: 26, graduate: 18 },
    wealth: { low: 22, middle: 46, high: 32 },
    age: { young: 32, mid: 29, mature: 22, senior: 17 },
    ideology: {
      evangelicals: 24,
      environmentalists: 11,
      libertarians: 10,
      progressives: 12,
      patriots: 26,
      gunowners: 30,
    },
  },
  RTX_HOU: {
    race: { white: 31, black: 18, hispanic: 37, asian: 11, other: 3 },
    education: { no_college: 58, college: 25, graduate: 17 },
    wealth: { low: 24, middle: 45, high: 31 },
    age: { young: 32, mid: 29, mature: 21, senior: 18 },
    ideology: {
      evangelicals: 22,
      environmentalists: 11,
      libertarians: 10,
      progressives: 13,
      patriots: 25,
      gunowners: 29,
    },
  },
  RTX_CEN: {
    race: { white: 42, black: 8, hispanic: 38, asian: 9, other: 3 },
    education: { no_college: 55, college: 26, graduate: 19 },
    wealth: { low: 22, middle: 46, high: 32 },
    age: { young: 33, mid: 29, mature: 21, senior: 17 },
    ideology: {
      evangelicals: 22,
      environmentalists: 14,
      libertarians: 11,
      progressives: 15,
      patriots: 24,
      gunowners: 28,
    },
  },
  RTX_SOU: {
    race: { white: 12, black: 3, hispanic: 82, asian: 2, other: 1 },
    education: { no_college: 74, college: 17, graduate: 9 },
    wealth: { low: 38, middle: 46, high: 16 },
    age: { young: 32, mid: 26, mature: 21, senior: 21 },
    ideology: {
      evangelicals: 30,
      environmentalists: 8,
      libertarians: 8,
      progressives: 9,
      patriots: 28,
      gunowners: 32,
    },
  },
  RTX_WES: {
    race: { white: 40, black: 5, hispanic: 50, asian: 3, other: 2 },
    education: { no_college: 69, college: 20, graduate: 11 },
    wealth: { low: 28, middle: 50, high: 22 },
    age: { young: 31, mid: 27, mature: 22, senior: 20 },
    ideology: {
      evangelicals: 29,
      environmentalists: 9,
      libertarians: 9,
      progressives: 8,
      patriots: 30,
      gunowners: 38,
    },
  },
  RTX_EAS: {
    race: { white: 64, black: 20, hispanic: 13, asian: 1, other: 2 },
    education: { no_college: 71, college: 19, graduate: 10 },
    wealth: { low: 31, middle: 50, high: 19 },
    age: { young: 27, mid: 26, mature: 24, senior: 23 },
    ideology: {
      evangelicals: 38,
      environmentalists: 8,
      libertarians: 9,
      progressives: 6,
      patriots: 31,
      gunowners: 42,
    },
  },
};
