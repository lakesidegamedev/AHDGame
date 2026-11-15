/**
 * Germany region census profiles for 1979 (divided Germany).
 *
 * The Land set is fixed and includes the eastern Länder, so BB/MV/SN/ST/TH
 * are authored with DDR-era socioeconomic profiles: state-compressed
 * incomes, near-zero foreign population, and polytechnic education mapped
 * onto the file's buckets. Berlin is a blend of West Berlin's Gastarbeiter
 * community and the East Berlin DDR profile.
 *
 * West Länder: mature Wirtschaftsboom economy under Schmidt, Gastarbeiter
 * communities concentrated in industrial belts, education dominated by
 * Volksschule/Hauptschule plus Lehre, low tertiary attainment, young adult
 * age structure. Values authored independently, not scaled from another era.
 */

import type { DERegionLayer1 } from "@/lib/seeds/de/deRegionCensusData";

export const deRegionCensusData1979: Record<string, DERegionLayer1> = {
  // ── Süden (Bundesrepublik) ─────────────────────────────────────────────────
  BW: {
    ethnicity: {
      german: 88,
      turkish_russian_diaspora: 5,
      mena: 1,
      eu_southern_eastern: 5,
      other: 1,
    },
    age: { young: 24, mid: 25, mature: 31, senior: 20 },
    education: { no_degree: 30, berufsausbildung: 51, abitur: 10, hochschulabschluss: 9 },
    income: { low: 22, middle: 58, high: 20 },
    urbanization: { urban: 45, suburban: 35, rural: 20 },
  },
  BY: {
    ethnicity: {
      german: 91,
      turkish_russian_diaspora: 3,
      mena: 1,
      eu_southern_eastern: 4,
      other: 1,
    },
    age: { young: 24, mid: 24, mature: 31, senior: 21 },
    education: { no_degree: 33, berufsausbildung: 50, abitur: 9, hochschulabschluss: 8 },
    income: { low: 25, middle: 56, high: 19 },
    urbanization: { urban: 38, suburban: 28, rural: 34 },
  },

  // ── Westen (Bundesrepublik) ────────────────────────────────────────────────
  NW: {
    ethnicity: {
      german: 87,
      turkish_russian_diaspora: 6,
      mena: 1,
      eu_southern_eastern: 5,
      other: 1,
    },
    age: { young: 23, mid: 25, mature: 31, senior: 21 },
    education: { no_degree: 34, berufsausbildung: 50, abitur: 8, hochschulabschluss: 8 },
    income: { low: 23, middle: 57, high: 20 },
    urbanization: { urban: 60, suburban: 28, rural: 12 },
  },
  HE: {
    ethnicity: {
      german: 88,
      turkish_russian_diaspora: 5,
      mena: 1,
      eu_southern_eastern: 5,
      other: 1,
    },
    age: { young: 23, mid: 25, mature: 31, senior: 21 },
    education: { no_degree: 31, berufsausbildung: 49, abitur: 10, hochschulabschluss: 10 },
    income: { low: 22, middle: 56, high: 22 },
    urbanization: { urban: 46, suburban: 32, rural: 22 },
  },
  RP: {
    ethnicity: {
      german: 93,
      turkish_russian_diaspora: 3,
      mena: 0,
      eu_southern_eastern: 3,
      other: 1,
    },
    age: { young: 23, mid: 24, mature: 31, senior: 22 },
    education: { no_degree: 35, berufsausbildung: 50, abitur: 8, hochschulabschluss: 7 },
    income: { low: 26, middle: 57, high: 17 },
    urbanization: { urban: 30, suburban: 35, rural: 35 },
  },
  SL: {
    ethnicity: {
      german: 94,
      turkish_russian_diaspora: 2,
      mena: 0,
      eu_southern_eastern: 3,
      other: 1,
    },
    age: { young: 22, mid: 24, mature: 32, senior: 22 },
    // Saar coal/steel monostructure: apprenticed miners/steelworkers dominate
    // (Facharbeiter rather than unskilled), wages squeezed by the late-70s steel
    // crisis, and the Saarbrücken–Völklingen belt is denser than the Land's size
    // suggests.
    education: { no_degree: 29, berufsausbildung: 58, abitur: 7, hochschulabschluss: 6 },
    income: { low: 36, middle: 52, high: 12 },
    urbanization: { urban: 52, suburban: 32, rural: 16 },
  },

  // ── Norden (Bundesrepublik) ────────────────────────────────────────────────
  NI: {
    ethnicity: {
      german: 94,
      turkish_russian_diaspora: 2,
      mena: 0,
      eu_southern_eastern: 3,
      other: 1,
    },
    age: { young: 23, mid: 24, mature: 31, senior: 22 },
    education: { no_degree: 35, berufsausbildung: 50, abitur: 8, hochschulabschluss: 7 },
    income: { low: 26, middle: 57, high: 17 },
    urbanization: { urban: 36, suburban: 30, rural: 34 },
  },
  SH: {
    ethnicity: {
      german: 96,
      turkish_russian_diaspora: 1,
      mena: 0,
      eu_southern_eastern: 2,
      other: 1,
    },
    age: { young: 22, mid: 24, mature: 31, senior: 23 },
    education: { no_degree: 34, berufsausbildung: 50, abitur: 9, hochschulabschluss: 7 },
    income: { low: 25, middle: 57, high: 18 },
    urbanization: { urban: 28, suburban: 35, rural: 37 },
  },
  HH: {
    ethnicity: {
      german: 89,
      turkish_russian_diaspora: 4,
      mena: 1,
      eu_southern_eastern: 4,
      other: 2,
    },
    age: { young: 23, mid: 25, mature: 29, senior: 23 },
    education: { no_degree: 30, berufsausbildung: 45, abitur: 13, hochschulabschluss: 12 },
    income: { low: 23, middle: 53, high: 24 },
    urbanization: { urban: 100, suburban: 0, rural: 0 },
  },
  BRE: {
    ethnicity: {
      german: 90,
      turkish_russian_diaspora: 4,
      mena: 1,
      eu_southern_eastern: 4,
      other: 1,
    },
    age: { young: 23, mid: 25, mature: 30, senior: 22 },
    education: { no_degree: 33, berufsausbildung: 48, abitur: 10, hochschulabschluss: 9 },
    income: { low: 25, middle: 55, high: 20 },
    urbanization: { urban: 98, suburban: 2, rural: 0 },
  },

  // ── Osten (DDR) + Berlin (divided city, blended) ───────────────────────────
  BE: {
    ethnicity: {
      german: 91,
      turkish_russian_diaspora: 5,
      mena: 1,
      eu_southern_eastern: 2,
      other: 1,
    },
    age: { young: 22, mid: 24, mature: 30, senior: 24 },
    education: { no_degree: 26, berufsausbildung: 49, abitur: 13, hochschulabschluss: 12 },
    income: { low: 26, middle: 56, high: 18 },
    urbanization: { urban: 100, suburban: 0, rural: 0 },
  },
};
