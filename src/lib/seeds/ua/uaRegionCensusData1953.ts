/**
 * Ukraine (Ukrainian SSR) Layer-1 census (1953), one entry per macro-region.
 * ethnicity: ukrainian (titular) / russian / other. Each dim sums 100.
 *
 * SEED INDEPENDENCE - DO NOT DERIVE FROM ANOTHER ERA. Keyed to region `_id`
 * in uaRegions1953.ts.
 *
 * 1953 anchors: urbanisation ~1/3, concentrated in Donbas and Dnieper belt;
 * education thin and rural with vocational build-out under the Fifth
 * Five-Year Plan; age scarred by war and the 1946-47 famine; income
 * administratively compressed. Ethnicity near the 1959 count (76.8%
 * Ukrainian, 16.9% Russian); Russian share tracks industry; west
 * overwhelmingly Ukrainian with Hungarian and Romanian minorities; south
 * carries Bessarabian Bulgarians, Moldovans, Odesa Greeks. Crimea is RSFSR
 * until 1954.
 */
export const uaRegionCensusData1953 = {
  UKR_KYI: {
    // Republican capital plus the Right Bank countryside: one big city in a
    // large agrarian surround, so the region reads far more rural than Kyiv
    // itself does.
    ethnicity: { ukrainian: 89, russian: 8, other: 3 },
    age: { young: 31, mid: 26, mature: 24, senior: 19 },
    education: { primary_or_below: 70, secondary: 20, vocational: 8, university: 2 },
    income: { low: 50, middle: 48, high: 2 },
    urbanization: { urban: 32, suburban: 11, rural: 57 },
  },
  UKR_WES: {
    // Galicia, Volhynia, Transcarpathia, Bukovina: annexed 1939-45, Greek
    // Catholic until the church's forced dissolution in 1946, and the last
    // corner of the USSR with an armed insurgency inside the seed's decade.
    // Poorest, most rural, thinnest schooling.
    ethnicity: { ukrainian: 88, russian: 5, other: 7 },
    age: { young: 34, mid: 27, mature: 22, senior: 17 }, // highest fertility in the republic
    education: { primary_or_below: 82, secondary: 13, vocational: 4, university: 1 },
    income: { low: 64, middle: 35, high: 1 },
    urbanization: { urban: 20, suburban: 9, rural: 71 },
  },
  UKR_POD: {
    // Sugar beet and grain, no heavy industry, no in-migration to speak of:
    // the most ethnically titular region and the second poorest.
    ethnicity: { ukrainian: 92, russian: 4, other: 4 },
    age: { young: 32, mid: 26, mature: 23, senior: 19 },
    education: { primary_or_below: 80, secondary: 15, vocational: 4, university: 1 },
    income: { low: 60, middle: 38, high: 2 },
    urbanization: { urban: 22, suburban: 9, rural: 69 },
  },
  UKR_DON: {
    // Coal. Already majority urban in 1953, the most Russian region in the
    // republic, and the one place where a working-class household can out-earn
    // a Kyiv office. Miners' wages and rations were protected through the
    // reconstruction at the countryside's expense.
    ethnicity: { ukrainian: 55, russian: 42, other: 3 },
    age: { young: 28, mid: 29, mature: 25, senior: 18 }, // labour in-migration fattens the mid cohort
    education: { primary_or_below: 62, secondary: 21, vocational: 15, university: 2 },
    income: { low: 34, middle: 62, high: 4 },
    urbanization: { urban: 62, suburban: 14, rural: 24 },
  },
  UKR_DNI: {
    // Kryvyi Rih ore, Zaporizhzhia and Dnipropetrovsk metallurgy, DniproHES
    // back on line since 1950. Second most urban, second most Russian, and the
    // largest single block of plan investment in the republic.
    ethnicity: { ukrainian: 74, russian: 23, other: 3 },
    age: { young: 30, mid: 28, mature: 24, senior: 18 },
    education: { primary_or_below: 66, secondary: 20, vocational: 12, university: 2 },
    income: { low: 40, middle: 57, high: 3 },
    urbanization: { urban: 52, suburban: 13, rural: 35 },
  },
  UKR_SOU: {
    // Odesa, Mykolaiv and Kherson: ports, shipyards and a farming steppe
    // behind them. Urban where the ports are, deeply rural everywhere else.
    ethnicity: { ukrainian: 63, russian: 29, other: 8 },
    age: { young: 30, mid: 27, mature: 24, senior: 19 },
    education: { primary_or_below: 68, secondary: 21, vocational: 9, university: 2 },
    income: { low: 46, middle: 51, high: 3 },
    urbanization: { urban: 40, suburban: 12, rural: 48 },
  },
};
export default uaRegionCensusData1953;
