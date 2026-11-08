/**
 * Rosstat 2020 census, conducted in October 2021: 18+ urban and rural counts
 * aggregated from federal subjects to the game's ten economic macroregions.
 * The 18-34 cell is 18-19 (15-19 minus ages 15-17) plus 20-24, 25-29, 30-34.
 * All eight cells sum to the national 18+ count of 119,466,511. Urban/rural
 * is the census classification. Nested autonomous okrugs are counted in
 * their parent oblast once; the two federal cities have no rural rows.
 * Crimea/Sevastopol are in NCA as in the source; the four territories claimed
 * in 2022 have no rows here and are not imputed.
 *
 * Source: Rosstat census volume 2, table 2 (XLSX):
 * https://rosstat.gov.ru/storage/mediabank/Tom2_tab2_VPN-2020.xlsx
 * Subject-to-region assignment follows ruPopulation1991.ts economic regions.
 */
export const RU_ADULT_CENSUS_2021 = {
  CEN: [6168373, 7161420, 5708852, 4905546, 912016, 1146739, 1118212, 862964],
  NWR: [1850892, 2137171, 1734896, 1490538, 237584, 296440, 272361, 211450],
  NOR: [617417, 803809, 629507, 514144, 139032, 188096, 223318, 158218],
  CBE: [956641, 1098177, 950920, 826488, 436095, 514391, 582745, 470849],
  VOL: [3543143, 4073329, 3414909, 2931969, 1050891, 1188328, 1396494, 1027605],
  NCA: [3119487, 3158122, 2348441, 1902558, 2233135, 2147287, 1953714, 1343870],
  URA: [2868376, 3265187, 2571634, 2214146, 867041, 1033237, 1165450, 806337],
  WSB: [2355151, 2725676, 2073755, 1621915, 595816, 784880, 774469, 555633],
  ESB: [1294531, 1455707, 1051056, 853560, 415663, 473264, 426172, 280442],
  FEA: [1027297, 1151825, 851655, 669091, 295544, 308521, 280285, 194612],
} as const;

/** All-age population from Rosstat census volume 1 table 4, same subjects. */
export const RU_ALL_AGE_CENSUS_2021 = {
  CEN: 33_276_581,
  NWR: 9_815_345,
  NOR: 4_101_852,
  CBE: 7_057_951,
  VOL: 22_731_811,
  NCA: 23_189_820,
  URA: 18_416_392,
  WSB: 14_518_090,
  ESB: 8_081_232,
  FEA: 5_993_049,
} as const;

export const RU_ADULT_COHORT_IDS = [
  "urban_18_34",
  "urban_35_49",
  "urban_50_64",
  "urban_65_plus",
  "rural_18_34",
  "rural_35_49",
  "rural_50_64",
  "rural_65_plus",
] as const;
