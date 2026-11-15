/**
 * Turkey Layer-1 modern census proxy profile, sourced primarily from 2023 national data.
 * All eight game regions share national age, education, urbanity, and ethnicity profiles;
 * these are explicitly not observed regional compositions. The 2019 and 2027 presets
 * project this 2023 weighting vintage and do not claim year-specific census observations.
 *
 * Age: TurkStat ABPRS 2023 resident population, including resident foreign nationals;
 * this is an age proxy, not a citizen-elector count. Adult denominator 63,166,343.
 * Province single-age data was unavailable, so the same national profile is used in
 * each macro-region.
 * Education: TurkStat National Education Statistics 2023, population 25+, citizens only;
 * known categories normalized into the three runtime groups. Runtime vocational is zero
 * because this source does not disaggregate it; not a claim of zero vocational attainment.
 * Urbanity: TurkStat 2022 DEGURBA national shares mapped to urban/suburban/rural.
 * Ethnicity: KONDA July 2019 adult self-identification survey, national profile; a survey
 * estimate, not census data, copied nationally with no regional counts inferred.
 * Income: existing region-specific 1979 distribution retained as explicit gameplay
 * carry-forward until a dated regional distribution is sourced.
 */
import { trRegionCensusData } from "@/lib/seeds/tr/trRegionCensusData";
import type { TRRegionLayer1 } from "@/lib/seeds/tr/trRegionCensusData";

const NATIONAL_ADULT_COUNTS = {
  young: 15_520_699,
  mid: 19_161_049,
  mature: 19_761_789,
  senior: 8_722_806,
} as const;
const NATIONAL_ADULT_TOTAL = 63_166_343;

/** Exact national adult shares (percent); normalized from matching-count cohorts. */
export const TR_MODERN_AGE_SHARES = Object.fromEntries(
  Object.entries(NATIONAL_ADULT_COUNTS).map(([key, count]) => [
    key,
    (count / NATIONAL_ADULT_TOTAL) * 100,
  ])
) as { young: number; mid: number; mature: number; senior: number };

const KNOWN_EDUCATION_TOTAL = 28.9 + 45.9 + 24.4;
/** Known 25+ categories mapped to runtime primary/secondary/university, then normalized. */
export const TR_MODERN_EDUCATION_SHARES = {
  primary_or_below: (28.9 / KNOWN_EDUCATION_TOTAL) * 100,
  secondary: (45.9 / KNOWN_EDUCATION_TOTAL) * 100,
  vocational: 0,
  university: (24.4 / KNOWN_EDUCATION_TOTAL) * 100,
} as const;

export const TR_MODERN_URBANIZATION_SHARES = {
  urban: 67.9,
  suburban: 14.8,
  rural: 17.3,
} as const;

export const TR_MODERN_ETHNICITY_SHARES = {
  turkish: 80,
  kurdish: 14,
  other: 6,
} as const;

export const trRegionCensusDataModern: Record<string, TRRegionLayer1> = Object.fromEntries(
  Object.entries(trRegionCensusData).map(([regionId, legacy]) => [
    regionId,
    {
      ethnicity: { ...TR_MODERN_ETHNICITY_SHARES },
      age: { ...TR_MODERN_AGE_SHARES },
      education: { ...TR_MODERN_EDUCATION_SHARES },
      income: { ...legacy.income },
      urbanization: { ...TR_MODERN_URBANIZATION_SHARES },
    },
  ])
) as Record<string, TRRegionLayer1>;
