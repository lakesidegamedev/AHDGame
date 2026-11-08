/**
 * Population of the RSFSR on 1 January 1991, by the ten economic
 * macroregions used by the game. Values are sums of federal-subject rows
 * from Rosstat's 1990-1997 series, in thousands; thousand-person rounding
 * preserved.
 *
 * Volga combines Volga-Vyatka and Volga; Northwest includes Kaliningrad.
 * Chechen-Ingush counted once in North Caucasus; nested autonomous okrugs
 * are not double-counted.
 *
 * Russian Federation regions only; other ex-USSR republics excluded.
 */
export const RU_1991_ECONOMIC_REGION_POPULATION = {
  CEN: 30_279_000, // Central: Moscow city/oblast and 11 central oblasts
  NWR: 9_149_000, // St Petersburg, Leningrad, Novgorod, Pskov, Kaliningrad
  NOR: 6_162_000, // Karelia, Komi, Arkhangelsk, Vologda, Murmansk
  CBE: 7_753_000, // Belgorod, Voronezh, Kursk, Lipetsk, Tambov
  VOL: 25_082_000, // Volga-Vyatka plus Volga economic regions
  NCA: 16_909_000, // North Caucasus and Rostov
  URA: 20_401_000, // Urals including Bashkortostan, Udmurtia and Perm
  WSB: 15_123_000, // Western Siberia including Altai
  ESB: 9_240_000, // Eastern Siberia including Buryatia and Chita
  FEA: 8_066_000, // Far East including Sakha and Chukotka
} as const;

export const RU_1991_POPULATION = Object.values(RU_1991_ECONOMIC_REGION_POPULATION).reduce(
  (sum, population) => sum + population,
  0
);
