/**
 * NPC Delegate seats per macro-region for the MODERN apportionment
 * (2019/1991/1979 presets). Mirrors `cnRegions[i].houseDistricts` so the
 * perpetual-election spawner can pull total seats without importing the regions
 * seed at the constants layer. Total = 2980.
 *
 * Read through {@link getCnNpcSeats}, never directly, a 1953 world seats a
 * 1,226-deputy chamber, not this one.
 */
export const CN_NPC_SEATS: Record<string, number> = {
  DB: 238,
  HB: 323,
  HD: 922,
  HZ: 395,
  HN: 316,
  XN: 466,
  XB: 320,
};

export const TOTAL_CN_NPC_SEATS = 2980;

/**
 * NPC Delegate seats per macro-region for `1953-default`, the 1,226-deputy
 * allocation of the 1st National People's Congress (1954 convocation).
 *
 * Mirrors `cnRegions1953[i].houseDistricts` EXACTLY (88/129/379/215/118/219/78),
 * which is also what `COUNTRY_CONFIGS.CN.legislature.lowerChamber` declares for
 * this preset and what `CN_NPC_1953` in `historicalSeats.ts` seats.
 * Read through the era-aware getter, not directly.
 */
export const CN_NPC_SEATS_1953: Record<string, number> = {
  DB: 88,
  HB: 129,
  HD: 379,
  HZ: 215,
  HN: 118,
  XN: 219,
  XB: 78,
};

export const TOTAL_CN_NPC_SEATS_1953 = 1226;

/**
 * Provincial People's Congress seats per macro-region, modern apportionment.
 * Total = 4000. Sub-national legislature, contested separately from the
 * national NPC. Sized roughly proportional to NPC apportionment, scaled up to
 * reflect real-world provincial people's congresses (each ~700-900 delegates).
 *
 * Read through {@link getCnPeoplesCongressSeats}, never directly.
 */
export const CN_PEOPLES_CONGRESS_SEATS: Record<string, number> = {
  DB: 321,
  HB: 433,
  HD: 1240,
  HZ: 533,
  HN: 425,
  XN: 625,
  XB: 423,
};

export const TOTAL_CN_PEOPLES_CONGRESS_SEATS = 4000;

/**
 * Provincial People's Congress seats per macro-region for `1953-default`.
 * Total = 3781. Mirrors `cnRegions1953[i].stateSenateSeats` EXACTLY, that
 * field carries the era's provincial-congress allocation, so the 1953 seed and
 * this map agree by construction (unlike the modern eras, where
 * `stateSenateSeats` holds the separate, smaller appointed CPPCC allocation and
 * the map deliberately overrides it).
 */
export const CN_PEOPLES_CONGRESS_SEATS_1953: Record<string, number> = {
  DB: 270,
  HB: 395,
  HD: 1164,
  HZ: 678,
  HN: 362,
  XN: 673,
  XB: 239,
};

export const TOTAL_CN_PEOPLES_CONGRESS_SEATS_1953 = 3781;
