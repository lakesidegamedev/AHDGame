/**
 * France (Fourth Republic) 1953 region census profiles.
 * Anchored on the 1954 Census. Values independently authored, NOT derived
 * from other eras. Versus later eras: higher primary_or_below education;
 * fewer north_african and more european_immigrant; older age distribution;
 * more rural (rural ~53% in 1946 Census).
 */

import type { FRRegionLayer1 } from "@/lib/seeds/fr/frRegionCensusData";

export const frRegionCensusData1953: Record<string, FRRegionLayer1> = {
  FR_IDF: {
    // Paris region: cosmopolitan, earliest North African immigrants,
    // higher education than rest of France, urban working class + bourgeoisie.
    ethnicity: { french: 90, european_immigrant: 6, north_african: 2, other: 2 },
    age: { young: 26, mid: 28, mature: 26, senior: 20 },
    education: { primary_or_below: 38, secondary: 35, vocational: 20, university: 7 },
    income: { low: 26, middle: 52, high: 22 },
    urbanization: { urban: 88, suburban: 9, rural: 3 },
  },
  FR_NOR: {
    // Nord/Normandy/Picardy: coal mines, textile mills, farming.
    ethnicity: { french: 95, european_immigrant: 4, north_african: 1, other: 0 },
    age: { young: 28, mid: 28, mature: 25, senior: 19 },
    education: { primary_or_below: 55, secondary: 28, vocational: 14, university: 3 },
    income: { low: 38, middle: 50, high: 12 },
    urbanization: { urban: 52, suburban: 18, rural: 30 },
  },
  FR_EST: {
    // Alsace-Lorraine/Champagne: steel, mining, wine. Catholic; some German heritage.
    ethnicity: { french: 95, european_immigrant: 5, north_african: 0, other: 0 },
    age: { young: 27, mid: 27, mature: 26, senior: 20 },
    education: { primary_or_below: 50, secondary: 28, vocational: 17, university: 5 },
    income: { low: 32, middle: 52, high: 16 },
    urbanization: { urban: 55, suburban: 20, rural: 25 },
  },
  FR_OUE: {
    // Brittany/Pays de Loire: deeply agricultural, Catholic, poor; emigration to Paris.
    ethnicity: { french: 99, european_immigrant: 1, north_african: 0, other: 0 },
    age: { young: 28, mid: 26, mature: 25, senior: 21 },
    education: { primary_or_below: 62, secondary: 24, vocational: 11, university: 3 },
    income: { low: 44, middle: 47, high: 9 },
    urbanization: { urban: 28, suburban: 15, rural: 57 },
  },
  FR_SOU: {
    // Aquitaine/Pyrénées: wine, Basques, agriculture, Bordeaux bourgeoisie.
    ethnicity: { french: 97, european_immigrant: 2, north_african: 1, other: 0 },
    age: { young: 24, mid: 26, mature: 27, senior: 23 },
    education: { primary_or_below: 54, secondary: 26, vocational: 15, university: 5 },
    income: { low: 36, middle: 50, high: 14 },
    urbanization: { urban: 40, suburban: 18, rural: 42 },
  },
  FR_ARA: {
    // Rhône-Alpes/Auvergne: Lyon as France's second industrial city;
    // silk/chemicals/metal, mountain agriculture.
    ethnicity: { french: 93, european_immigrant: 6, north_african: 1, other: 0 },
    age: { young: 27, mid: 27, mature: 26, senior: 20 },
    education: { primary_or_below: 49, secondary: 30, vocational: 16, university: 5 },
    income: { low: 33, middle: 51, high: 16 },
    urbanization: { urban: 48, suburban: 20, rural: 32 },
  },
  FR_MED: {
    // Provence/Languedoc: Mediterranean, wine, Marseille port.
    // Largest North African presence (pied-noirs + early Algerian migrants).
    ethnicity: { french: 88, european_immigrant: 7, north_african: 4, other: 1 },
    age: { young: 25, mid: 27, mature: 27, senior: 21 },
    education: { primary_or_below: 52, secondary: 28, vocational: 15, university: 5 },
    income: { low: 38, middle: 48, high: 14 },
    urbanization: { urban: 56, suburban: 20, rural: 24 },
  },
  FR_CEN: {
    // Centre/Bourgogne/Franche-Comté: agricultural heartland, Dijon wine.
    // Aging, low education, rural majority.
    ethnicity: { french: 97, european_immigrant: 3, north_african: 0, other: 0 },
    age: { young: 22, mid: 25, mature: 28, senior: 25 },
    education: { primary_or_below: 60, secondary: 24, vocational: 13, university: 3 },
    income: { low: 40, middle: 48, high: 12 },
    urbanization: { urban: 30, suburban: 15, rural: 55 },
  },
};

export default frRegionCensusData1953;
