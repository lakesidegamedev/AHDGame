/**
 * Baltic republics Layer-1 census (1979), one entry per republic.
 * ethnicity: baltic (the republic's own titular nation) / russian / other.
 * Each dimension sums to 100. Same bucket convention as the 1953 bundle: an
 * Estonian in Riga counts as `other` in BAL_LVA.
 *
 * Shares follow the 1979 all-Union census. Latvia sits near a titular
 * minority (Riga itself is already minority Latvian); Estonia lags a step
 * behind; Lithuania is essentially unchanged since 1959 and is the most rural
 * and youngest. Estonia and Latvia are the most educated and oldest.
 */
export const balRegionCensusData = {
  BAL_LTU: {
    ethnicity: { baltic: 80, russian: 9, other: 11 },
    age: { young: 27, mid: 28, mature: 24, senior: 21 },
    education: { primary_or_below: 42, secondary: 32, vocational: 20, university: 6 },
    income: { low: 28, middle: 63, high: 9 },
    urbanization: { urban: 61, suburban: 12, rural: 27 },
  },
  BAL_LVA: {
    ethnicity: { baltic: 54, russian: 33, other: 13 },
    age: { young: 24, mid: 28, mature: 25, senior: 23 },
    education: { primary_or_below: 35, secondary: 33, vocational: 23, university: 9 },
    income: { low: 22, middle: 65, high: 13 },
    urbanization: { urban: 70, suburban: 12, rural: 18 },
  },
  BAL_EST: {
    ethnicity: { baltic: 65, russian: 28, other: 7 },
    age: { young: 24, mid: 28, mature: 25, senior: 23 },
    education: { primary_or_below: 33, secondary: 33, vocational: 23, university: 11 },
    income: { low: 20, middle: 66, high: 14 },
    urbanization: { urban: 70, suburban: 12, rural: 18 },
  },
};
export default balRegionCensusData;
