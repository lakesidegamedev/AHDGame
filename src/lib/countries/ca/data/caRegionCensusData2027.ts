/**
 * Canada's province and territory census profiles for the 2027 world.
 *
 * Anchored to the Statistics Canada 2021 Census of Population (language,
 * Indigenous identity, visible minority, highest certificate, income, age,
 * population centre size) and carried to 2027 with the slower ageing and
 * higher university attainment seen in the labour force survey. Values are
 * rounded literals authored for 2027, not derived from another era.
 *
 * Buckets:
 * - `ethnicity` is the cultural community a voter belongs to. Language is
 *   folded in because it, not ancestry, is what separates Quebec and Acadian
 *   voters from the rest: anglophone and francophone are by mother tongue,
 *   among people who are neither Indigenous nor a visible minority.
 * - `education` is the highest certificate held by adults 25 to 64.
 * - `income` is an era-neutral relative tier, not a dollar threshold.
 * - `urbanization` follows the population centre size groups: urban is a large
 *   urban centre, suburban the medium and small centres, rural everything else.
 */
import type { IntlRegionCensus } from "@/lib/seeds/regionCensusData";

export type CARegionLayer1 = IntlRegionCensus;

export const caRegionCensusData2027: Record<string, CARegionLayer1> = {
  CA_ON: {
    ethnicity: {
      anglophone: 56,
      francophone: 4,
      indigenous: 3,
      south_asian: 11,
      east_se_asian: 12,
      other_background: 14,
    },
    age: { young: 20, mid: 34, mature: 25, senior: 21 },
    education: { no_certificate: 7, high_school: 24, college_trades: 29, university: 40 },
    income: { low: 22, middle: 45, high: 33 },
    urbanization: { urban: 55, suburban: 36, rural: 9 },
  },
  CA_QC: {
    ethnicity: {
      anglophone: 8,
      francophone: 76,
      indigenous: 2,
      south_asian: 2,
      east_se_asian: 3,
      other_background: 9,
    },
    age: { young: 17, mid: 31, mature: 26, senior: 26 },
    education: { no_certificate: 11, high_school: 20, college_trades: 36, university: 33 },
    income: { low: 26, middle: 46, high: 28 },
    urbanization: { urban: 50, suburban: 32, rural: 18 },
  },
  CA_BC: {
    ethnicity: {
      anglophone: 54,
      francophone: 2,
      indigenous: 6,
      south_asian: 10,
      east_se_asian: 18,
      other_background: 10,
    },
    age: { young: 19, mid: 33, mature: 25, senior: 23 },
    education: { no_certificate: 7, high_school: 25, college_trades: 30, university: 38 },
    income: { low: 24, middle: 44, high: 32 },
    urbanization: { urban: 52, suburban: 33, rural: 15 },
  },
  CA_AB: {
    ethnicity: {
      anglophone: 62,
      francophone: 2,
      indigenous: 7,
      south_asian: 8,
      east_se_asian: 9,
      other_background: 12,
    },
    age: { young: 22, mid: 37, mature: 24, senior: 17 },
    education: { no_certificate: 8, high_school: 26, college_trades: 32, university: 34 },
    income: { low: 20, middle: 44, high: 36 },
    urbanization: { urban: 56, suburban: 26, rural: 18 },
  },
  CA_MB: {
    ethnicity: {
      anglophone: 62,
      francophone: 3,
      indigenous: 18,
      south_asian: 5,
      east_se_asian: 7,
      other_background: 5,
    },
    age: { young: 22, mid: 34, mature: 24, senior: 20 },
    education: { no_certificate: 12, high_school: 26, college_trades: 30, university: 32 },
    income: { low: 26, middle: 48, high: 26 },
    urbanization: { urban: 55, suburban: 10, rural: 35 },
  },
  CA_SK: {
    ethnicity: {
      anglophone: 70,
      francophone: 1,
      indigenous: 17,
      south_asian: 4,
      east_se_asian: 4,
      other_background: 4,
    },
    age: { young: 22, mid: 33, mature: 24, senior: 21 },
    education: { no_certificate: 13, high_school: 27, college_trades: 29, university: 31 },
    income: { low: 24, middle: 47, high: 29 },
    urbanization: { urban: 45, suburban: 10, rural: 45 },
  },
  CA_NS: {
    ethnicity: {
      anglophone: 84,
      francophone: 3,
      indigenous: 5,
      south_asian: 1,
      east_se_asian: 2,
      other_background: 5,
    },
    age: { young: 17, mid: 29, mature: 26, senior: 28 },
    education: { no_certificate: 10, high_school: 26, college_trades: 30, university: 34 },
    income: { low: 28, middle: 48, high: 24 },
    urbanization: { urban: 45, suburban: 20, rural: 35 },
  },
  CA_NB: {
    ethnicity: {
      anglophone: 58,
      francophone: 31,
      indigenous: 4,
      south_asian: 1,
      east_se_asian: 1,
      other_background: 5,
    },
    age: { young: 16, mid: 29, mature: 26, senior: 29 },
    education: { no_certificate: 12, high_school: 26, college_trades: 32, university: 30 },
    income: { low: 29, middle: 48, high: 23 },
    urbanization: { urban: 33, suburban: 25, rural: 42 },
  },
  CA_NL: {
    ethnicity: {
      anglophone: 84,
      francophone: 1,
      indigenous: 9,
      south_asian: 1,
      east_se_asian: 2,
      other_background: 3,
    },
    age: { young: 15, mid: 28, mature: 28, senior: 29 },
    education: { no_certificate: 15, high_school: 26, college_trades: 30, university: 29 },
    income: { low: 29, middle: 47, high: 24 },
    urbanization: { urban: 30, suburban: 20, rural: 50 },
  },
  CA_PE: {
    ethnicity: {
      anglophone: 88,
      francophone: 4,
      indigenous: 2,
      south_asian: 1,
      east_se_asian: 3,
      other_background: 2,
    },
    age: { young: 18, mid: 30, mature: 25, senior: 27 },
    education: { no_certificate: 12, high_school: 27, college_trades: 29, university: 32 },
    income: { low: 28, middle: 49, high: 23 },
    urbanization: { urban: 25, suburban: 20, rural: 55 },
  },
  CA_YT: {
    ethnicity: {
      anglophone: 63,
      francophone: 5,
      indigenous: 23,
      south_asian: 2,
      east_se_asian: 4,
      other_background: 3,
    },
    age: { young: 20, mid: 36, mature: 25, senior: 19 },
    education: { no_certificate: 10, high_school: 22, college_trades: 32, university: 36 },
    income: { low: 14, middle: 42, high: 44 },
    urbanization: { urban: 70, suburban: 0, rural: 30 },
  },
  CA_NT: {
    ethnicity: {
      anglophone: 38,
      francophone: 3,
      indigenous: 50,
      south_asian: 2,
      east_se_asian: 4,
      other_background: 3,
    },
    age: { young: 24, mid: 38, mature: 24, senior: 14 },
    education: { no_certificate: 20, high_school: 22, college_trades: 30, university: 28 },
    income: { low: 14, middle: 38, high: 48 },
    urbanization: { urban: 60, suburban: 0, rural: 40 },
  },
  CA_NU: {
    ethnicity: {
      anglophone: 8,
      francophone: 1,
      indigenous: 86,
      south_asian: 1,
      east_se_asian: 3,
      other_background: 1,
    },
    age: { young: 36, mid: 38, mature: 20, senior: 6 },
    education: { no_certificate: 38, high_school: 22, college_trades: 24, university: 16 },
    income: { low: 30, middle: 36, high: 34 },
    urbanization: { urban: 30, suburban: 0, rural: 70 },
  },
};
