/**
 * Italy Region Census Profiles, 1953.
 *
 * SEED INDEPENDENCE: anchored on the 1951 Census of Italy, authored independently.
 * Do not derive from another era.
 *
 * Every dimension sums to 100.
 */

import type { ITRegionLayer1 } from "@/lib/seeds/it/itRegionCensusData";

export const itRegionCensusData1953: Record<string, ITRegionLayer1> = {
  IT_NW: {
    // Lombardia/Piemonte/Liguria: Italy's industrial heart. FIAT Turin, Olivetti,
    // Pirelli, steel in Genoa. Higher wages, more urban, Catholic + secular mix.
    ethnicity: { italian: 99, immigrant: 1, other: 0 },
    age: { young: 28, mid: 28, mature: 25, senior: 19 },
    education: { primary_or_below: 34, secondary: 22, vocational: 38, university: 6 },
    income: { low: 24, middle: 56, high: 20 },
    urbanization: { urban: 62, suburban: 20, rural: 18 },
  },
  IT_NE: {
    // Veneto/Friuli/Trentino/eastern Emilia: mixed industrial-agricultural.
    // Strongly Catholic DC vote (Veneto "White Belt"); sharecropping (mezzadria).
    ethnicity: { italian: 99, immigrant: 1, other: 0 },
    age: { young: 27, mid: 28, mature: 25, senior: 20 },
    education: { primary_or_below: 38, secondary: 18, vocational: 39, university: 5 },
    income: { low: 32, middle: 52, high: 16 },
    urbanization: { urban: 44, suburban: 22, rural: 34 },
  },
  IT_TUS: {
    // Toscana/Umbria/Marche: the "Red Belt". PCI/PSI stronghold from
    // mezzadria sharecropping radicalism. Mixed industry and small farms.
    ethnicity: { italian: 99, immigrant: 1, other: 0 },
    age: { young: 26, mid: 27, mature: 26, senior: 21 },
    education: { primary_or_below: 40, secondary: 16, vocational: 39, university: 5 },
    income: { low: 36, middle: 51, high: 13 },
    urbanization: { urban: 44, suburban: 18, rural: 38 },
  },
  IT_LAZ: {
    // Lazio/Roma: capital city services, Vatican, bureaucracy.
    // Mixed class; Rome DC-dominated; some Communist outer suburbs.
    ethnicity: { italian: 99, immigrant: 1, other: 0 },
    age: { young: 27, mid: 28, mature: 25, senior: 20 },
    education: { primary_or_below: 30, secondary: 22, vocational: 40, university: 8 },
    income: { low: 28, middle: 53, high: 19 },
    urbanization: { urban: 60, suburban: 22, rural: 18 },
  },
  IT_CAM: {
    // Campania/Naples: overpopulated, very poor, high illiteracy.
    // DC clientelism; embryonic industry; mass emigration beginning.
    ethnicity: { italian: 99, immigrant: 1, other: 0 },
    age: { young: 32, mid: 28, mature: 23, senior: 17 },
    education: { primary_or_below: 56, secondary: 8, vocational: 32, university: 4 },
    income: { low: 54, middle: 38, high: 8 },
    urbanization: { urban: 46, suburban: 16, rural: 38 },
  },
  IT_SUD: {
    // Puglia/Calabria/Abruzzo/Basilicata: poorest Italy. Latifundia, braccianti,
    // mass emigration to US/Argentina. Very high illiteracy; deeply rural.
    ethnicity: { italian: 99, immigrant: 1, other: 0 },
    age: { young: 33, mid: 27, mature: 23, senior: 17 },
    education: { primary_or_below: 62, secondary: 6, vocational: 28, university: 4 },
    income: { low: 60, middle: 34, high: 6 },
    urbanization: { urban: 28, suburban: 14, rural: 58 },
  },
  IT_SIC: {
    // Sicily: island poverty, Mafia, latifundia, citrus exports.
    // DC + Monarchist + MSI; very high illiteracy; emigration to the Americas.
    ethnicity: { italian: 99, immigrant: 1, other: 0 },
    age: { young: 33, mid: 27, mature: 23, senior: 17 },
    education: { primary_or_below: 58, secondary: 7, vocational: 30, university: 5 },
    income: { low: 58, middle: 35, high: 7 },
    urbanization: { urban: 34, suburban: 16, rural: 50 },
  },
  IT_SAR: {
    // Sardinia: isolated island, mining (coal, zinc), shepherds, autonomy movement.
    ethnicity: { italian: 99, immigrant: 0, other: 1 },
    age: { young: 31, mid: 28, mature: 24, senior: 17 },
    education: { primary_or_below: 54, secondary: 8, vocational: 32, university: 6 },
    income: { low: 55, middle: 37, high: 8 },
    urbanization: { urban: 26, suburban: 14, rural: 60 },
  },
};

export default itRegionCensusData1953;
