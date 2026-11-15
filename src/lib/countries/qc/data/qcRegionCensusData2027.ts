/**
 * Census profiles for Quebec's successor regions, built from Canada's CA_QC
 * 2027 profile (Statistics Canada 2021 Census). Montreal is set from the
 * island's census profile; the other regions take the province profile with
 * Montreal removed, so the population-weighted mix matches CA_QC. Urbanization
 * follows each region's share in large population centres.
 */
import type { IntlRegionCensus } from "@/lib/seeds/regionCensusData";

const AGE = { young: 17, mid: 31, mature: 26, senior: 26 };
const INCOME = { low: 26, middle: 46, high: 28 };

const MONTREAL_BACKGROUND = {
  anglophone: 14,
  francophone: 56,
  indigenous: 1,
  south_asian: 4,
  east_se_asian: 6,
  other_background: 19,
};
const REST_BACKGROUND = {
  anglophone: 6,
  francophone: 82,
  indigenous: 2,
  south_asian: 1,
  east_se_asian: 2,
  other_background: 7,
};
const MONTREAL_EDUCATION = {
  no_certificate: 10,
  high_school: 18,
  college_trades: 30,
  university: 42,
};
const REST_EDUCATION = { no_certificate: 11, high_school: 21, college_trades: 38, university: 30 };

const rest = (urban: number, suburban: number, rural: number): IntlRegionCensus => ({
  ethnicity: REST_BACKGROUND,
  age: AGE,
  education: REST_EDUCATION,
  income: INCOME,
  urbanization: { urban, suburban, rural },
});

export const qcRegionCensusData2027: Record<string, IntlRegionCensus> = {
  QC_MTL: {
    ethnicity: MONTREAL_BACKGROUND,
    age: AGE,
    education: MONTREAL_EDUCATION,
    income: INCOME,
    urbanization: { urban: 95, suburban: 5, rural: 0 },
  },
  QC_LLL: rest(30, 55, 15),
  QC_MON: rest(25, 55, 20),
  QC_CAP: rest(45, 35, 20),
  QC_EST: rest(30, 35, 35),
  QC_OUT: rest(40, 25, 35),
  QC_MSL: rest(30, 35, 35),
  QC_ENQ: rest(10, 30, 60),
};
