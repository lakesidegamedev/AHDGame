/**
 * Census profiles for Alberta's successor regions, built from Canada's CA_AB
 * 2027 profile (Statistics Canada 2021 Census). Calgary and Edmonton are set
 * from their metropolitan profiles; the other regions take the province
 * profile with the two cities removed, so the population-weighted mix matches
 * CA_AB. Urbanization follows each region's share in large population centres.
 */
import type { IntlRegionCensus } from "@/lib/seeds/regionCensusData";

const AGE = { young: 22, mid: 37, mature: 24, senior: 17 };
const INCOME = { low: 20, middle: 44, high: 36 };

const CALGARY_BACKGROUND = {
  anglophone: 56,
  francophone: 2,
  indigenous: 3,
  south_asian: 11,
  east_se_asian: 12,
  other_background: 16,
};
const EDMONTON_BACKGROUND = {
  anglophone: 57,
  francophone: 3,
  indigenous: 6,
  south_asian: 10,
  east_se_asian: 8,
  other_background: 16,
};
const REST_BACKGROUND = {
  anglophone: 72,
  francophone: 2,
  indigenous: 12,
  south_asian: 4,
  east_se_asian: 5,
  other_background: 5,
};
const CITY_EDUCATION = {
  no_certificate: 6,
  high_school: 23,
  college_trades: 30,
  university: 41,
};
const REST_EDUCATION = { no_certificate: 11, high_school: 31, college_trades: 36, university: 22 };

const city = (
  ethnicity: IntlRegionCensus["ethnicity"],
  urban: number,
  suburban: number,
  rural: number
): IntlRegionCensus => ({
  ethnicity,
  age: AGE,
  education: CITY_EDUCATION,
  income: INCOME,
  urbanization: { urban, suburban, rural },
});

const rest = (urban: number, suburban: number, rural: number): IntlRegionCensus => ({
  ethnicity: REST_BACKGROUND,
  age: AGE,
  education: REST_EDUCATION,
  income: INCOME,
  urbanization: { urban, suburban, rural },
});

export const abRegionCensusData2027: Record<string, IntlRegionCensus> = {
  AB_CAL: city(CALGARY_BACKGROUND, 78, 17, 5),
  AB_EDM: city(EDMONTON_BACKGROUND, 74, 18, 8),
  AB_CEN: rest(30, 20, 50),
  AB_SOU: rest(35, 20, 45),
  AB_FOO: rest(15, 25, 60),
  AB_NOR: rest(25, 15, 60),
};
