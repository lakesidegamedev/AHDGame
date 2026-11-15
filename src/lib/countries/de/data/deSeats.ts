/**
 * Bundestag Wahlkreise (single-member constituencies) per Bundesland.
 * Direct-mandate tier of the AMS/MMP system. Sum = 299.
 * Mirrors `deRegions[*].houseDistricts`.
 */
export const DE_WAHLKREIS_SEATS: Record<string, number> = {
  BW: 38,
  BY: 47,
  BE: 12,
  BB: 10,
  BRE: 2,
  HH: 6,
  HE: 22,
  MV: 6,
  NI: 30,
  NW: 64,
  RP: 15,
  SL: 4,
  SN: 16,
  ST: 8,
  SH: 11,
  TH: 8,
};

/** Total Wahlkreise contested nationwide. Fixed under 2023 reform. */
export const TOTAL_DE_WAHLKREIS_SEATS = 299;

/**
 * Total Bundestag seats including list tier.
 * Capped under the 2023 Wahlrechtsreform, direct + list combined.
 */
export const TOTAL_DE_BUNDESTAG_SEATS = 630;

/** Landtag seat counts per Bundesland. Mirrors deRegions[*].stateSenateSeats. */
export const DE_LANDTAG_SEATS: Record<string, number> = {
  BW: 154,
  BY: 203,
  BE: 159,
  BB: 88,
  BRE: 87,
  HH: 123,
  HE: 137,
  MV: 79,
  NI: 146,
  NW: 195,
  RP: 101,
  SL: 51,
  SN: 120,
  ST: 97,
  SH: 73,
  TH: 88,
};
