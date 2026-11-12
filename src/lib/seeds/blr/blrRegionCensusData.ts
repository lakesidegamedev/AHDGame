/**
 * Byelorussian SSR Layer-1 census (1979), one entry per oblast. Each dim
 * sums to 100. ethnicity: belarusian (titular) / russian / other.
 *
 * Keys MUST be the region `_id` values from blrRegions.ts (the `BLR_` codes
 * that also key public/blr-regions.json). Keep the geometry, the region
 * seed and this file on the same code set.
 *
 * By 1979 the republic is the union's machine-building and electronics
 * showcase: urbanisation is more than double 1953's (the rural exodus went
 * to Minsk), the Russian share has roughly doubled on cadre in-migration,
 * and education has been rebuilt with near-universal literacy and a real
 * university layer in Minsk. The west/east split survives, narrower.
 */
export const blrRegionCensusData = {
  BLR_MIN: {
    // Minsk oblast plus the city: automotive, tractors, electronics, computing,
    // the republican party and ministerial apparatus, and the universities.
    ethnicity: { belarusian: 74, russian: 18, other: 8 },
    age: { young: 27, mid: 29, mature: 24, senior: 20 }, // in-migration keeps it young
    education: { primary_or_below: 36, secondary: 32, vocational: 22, university: 10 },
    income: { low: 22, middle: 66, high: 12 },
    urbanization: { urban: 68, suburban: 13, rural: 19 },
  },
  BLR_HOM: {
    // Gomel: Mazyr refinery, machine tools, agricultural machinery.
    ethnicity: { belarusian: 79, russian: 13, other: 8 },
    age: { young: 26, mid: 28, mature: 24, senior: 22 },
    education: { primary_or_below: 45, secondary: 31, vocational: 19, university: 5 },
    income: { low: 29, middle: 63, high: 8 },
    urbanization: { urban: 55, suburban: 12, rural: 33 },
  },
  BLR_VIT: {
    // Vitebsk: Polatsk/Navapolatsk petrochemicals, the largest plant complex
    // outside Minsk, on the old textile base. Closest to the RSFSR border and
    // the most Russian-settled oblast after Minsk.
    ethnicity: { belarusian: 78, russian: 15, other: 7 },
    age: { young: 25, mid: 27, mature: 25, senior: 23 }, // oldest — long out-migration
    education: { primary_or_below: 46, secondary: 31, vocational: 18, university: 5 },
    income: { low: 30, middle: 62, high: 8 },
    urbanization: { urban: 56, suburban: 12, rural: 32 },
  },
  BLR_MOG: {
    // Mogilev: synthetic fibre and metallurgy at Mogilev and Babruysk.
    ethnicity: { belarusian: 82, russian: 12, other: 6 },
    age: { young: 25, mid: 28, mature: 25, senior: 22 },
    education: { primary_or_below: 47, secondary: 31, vocational: 18, university: 4 },
    income: { low: 31, middle: 62, high: 7 },
    urbanization: { urban: 54, suburban: 12, rural: 34 },
  },
  BLR_BRE: {
    // Brest: the western gateway, Druzhba pipeline and the main freight
    // crossing, but food processing and rail rather than heavy plant.
    ethnicity: { belarusian: 85, russian: 7, other: 8 }, // residual Polish minority
    age: { young: 28, mid: 28, mature: 23, senior: 21 }, // highest fertility
    education: { primary_or_below: 52, secondary: 30, vocational: 14, university: 4 },
    income: { low: 34, middle: 59, high: 7 },
    urbanization: { urban: 46, suburban: 11, rural: 43 },
  },
  BLR_GRO: {
    // Grodno: nitrogen works and Lida, but still the most rural oblast and the
    // one that keeps the republic's largest Polish minority.
    ethnicity: { belarusian: 74, russian: 8, other: 18 },
    age: { young: 27, mid: 28, mature: 24, senior: 21 },
    education: { primary_or_below: 54, secondary: 29, vocational: 13, university: 4 },
    income: { low: 36, middle: 58, high: 6 },
    urbanization: { urban: 44, suburban: 11, rural: 45 },
  },
};
export default blrRegionCensusData;
