/**
 * United Kingdom Region Census Profiles, 1953.
 *
 * SEED INDEPENDENCE: anchored on the 1951 Census, authored independently of the
 * 2019 profiles.
 *
 * Age bands are voting-age shares (young 18-29 / mid 30-44 / mature 45-64 /
 * senior 65+). Education buckets reuse shared labels (`gcse_equivalent` is
 * School Certificate / O-level; GCSEs did not exist). Income tiers are era-neutral
 * relative tiers.
 */

import type { UKRegionLayer1 } from "@/lib/countries/uk/data/ukRegionCensusData";

export const ukRegionCensusData1953: Record<string, UKRegionLayer1> = {
  LON: {
    // Largest non-white population in UK but still tiny; Windrush arrivals
    // concentrated in Brixton, Notting Hill, Hackney. Highest education /
    // income of any region, but still an industrial Labour city.
    ethnicity: { white_british: 97, asian_british: 1, black_british: 1, mixed: 1, other: 0 },
    age: { young: 21, mid: 28, mature: 35, senior: 16 },
    education: {
      no_qualifications: 62,
      gcse_equivalent: 20,
      a_level_equivalent: 12,
      degree_plus: 6,
    },
    income: { low: 30, middle: 52, high: 18 },
    urbanization: { urban: 96, suburban: 4, rural: 0 },
  },
  SEE: {
    // Commuter belt + Home Counties — Churchill country. Highest high-income
    // / suburban share; relatively fewer no-qualifications.
    ethnicity: { white_british: 99, asian_british: 0, black_british: 0, mixed: 1, other: 0 },
    age: { young: 19, mid: 26, mature: 38, senior: 17 },
    education: {
      no_qualifications: 64,
      gcse_equivalent: 20,
      a_level_equivalent: 11,
      degree_plus: 5,
    },
    income: { low: 22, middle: 54, high: 24 },
    urbanization: { urban: 42, suburban: 38, rural: 20 },
  },
  SWE: {
    // Rural shires, fishing towns, little heavy industry — solidly Tory.
    ethnicity: { white_british: 99, asian_british: 0, black_british: 0, mixed: 1, other: 0 },
    age: { young: 18, mid: 24, mature: 39, senior: 19 },
    education: {
      no_qualifications: 70,
      gcse_equivalent: 18,
      a_level_equivalent: 8,
      degree_plus: 4,
    },
    income: { low: 28, middle: 55, high: 17 },
    urbanization: { urban: 28, suburban: 30, rural: 42 },
  },
  EAE: {
    // East Anglia farming + early Cambridge/Norwich towns — Conservative.
    ethnicity: { white_british: 99, asian_british: 0, black_british: 0, mixed: 1, other: 0 },
    age: { young: 19, mid: 25, mature: 38, senior: 18 },
    education: {
      no_qualifications: 68,
      gcse_equivalent: 19,
      a_level_equivalent: 9,
      degree_plus: 4,
    },
    income: { low: 25, middle: 55, high: 20 },
    urbanization: { urban: 32, suburban: 34, rural: 34 },
  },
  EMI: {
    // Mixed Midlands — farming shires + Leicester/Nottingham industry; swing.
    ethnicity: { white_british: 99, asian_british: 1, black_british: 0, mixed: 0, other: 0 },
    age: { young: 20, mid: 26, mature: 37, senior: 17 },
    education: {
      no_qualifications: 70,
      gcse_equivalent: 18,
      a_level_equivalent: 8,
      degree_plus: 4,
    },
    income: { low: 30, middle: 55, high: 15 },
    urbanization: { urban: 35, suburban: 33, rural: 32 },
  },
  WMI: {
    // Car and metal trades at mid-point of their post-war boom;
    // South Asian communities just beginning in Smethwick and Sparkbrook.
    ethnicity: { white_british: 97, asian_british: 2, black_british: 1, mixed: 0, other: 0 },
    age: { young: 21, mid: 27, mature: 36, senior: 16 },
    education: {
      no_qualifications: 72,
      gcse_equivalent: 17,
      a_level_equivalent: 8,
      degree_plus: 3,
    },
    income: { low: 30, middle: 55, high: 15 },
    urbanization: { urban: 62, suburban: 26, rural: 12 },
  },
  YHU: {
    ethnicity: { white_british: 99, asian_british: 1, black_british: 0, mixed: 0, other: 0 },
    age: { young: 20, mid: 26, mature: 37, senior: 17 },
    education: {
      no_qualifications: 74,
      gcse_equivalent: 16,
      a_level_equivalent: 7,
      degree_plus: 3,
    },
    income: { low: 38, middle: 51, high: 11 },
    urbanization: { urban: 56, suburban: 26, rural: 18 },
  },
  NWE: {
    ethnicity: { white_british: 99, asian_british: 1, black_british: 0, mixed: 0, other: 0 },
    age: { young: 21, mid: 27, mature: 36, senior: 16 },
    education: {
      no_qualifications: 74,
      gcse_equivalent: 16,
      a_level_equivalent: 7,
      degree_plus: 3,
    },
    income: { low: 38, middle: 51, high: 11 },
    urbanization: { urban: 66, suburban: 24, rural: 10 },
  },
  NEE: {
    // Shipbuilding and coal at near-peak employment; almost entirely white.
    ethnicity: { white_british: 100, asian_british: 0, black_british: 0, mixed: 0, other: 0 },
    age: { young: 21, mid: 26, mature: 37, senior: 16 },
    education: {
      no_qualifications: 78,
      gcse_equivalent: 14,
      a_level_equivalent: 5,
      degree_plus: 3,
    },
    income: { low: 44, middle: 48, high: 8 },
    urbanization: { urban: 64, suburban: 24, rural: 12 },
  },
  SCO: {
    // Clydeside Labour; Highlands/Borders more Tory — net Labour at region grain.
    ethnicity: { white_british: 100, asian_british: 0, black_british: 0, mixed: 0, other: 0 },
    age: { young: 21, mid: 27, mature: 36, senior: 16 },
    education: {
      no_qualifications: 70,
      gcse_equivalent: 17,
      a_level_equivalent: 8,
      degree_plus: 5,
    },
    income: { low: 40, middle: 49, high: 11 },
    urbanization: { urban: 58, suburban: 24, rural: 18 },
  },
  WAL: {
    // South Wales valleys dominate the regional vote — Labour.
    ethnicity: { white_british: 99, asian_british: 0, black_british: 0, mixed: 1, other: 0 },
    age: { young: 19, mid: 25, mature: 38, senior: 18 },
    education: {
      no_qualifications: 76,
      gcse_equivalent: 15,
      a_level_equivalent: 6,
      degree_plus: 3,
    },
    income: { low: 42, middle: 49, high: 9 },
    urbanization: { urban: 48, suburban: 28, rural: 24 },
  },
  NIR: {
    // Pre-Troubles; highest birth rate in UK; deeply divided between
    // Catholic and Protestant communities but demographically homogeneous.
    ethnicity: { white_british: 100, asian_british: 0, black_british: 0, mixed: 0, other: 0 },
    age: { young: 24, mid: 28, mature: 33, senior: 15 },
    education: {
      no_qualifications: 74,
      gcse_equivalent: 16,
      a_level_equivalent: 7,
      degree_plus: 3,
    },
    income: { low: 42, middle: 48, high: 10 },
    urbanization: { urban: 44, suburban: 25, rural: 31 },
  },
};
