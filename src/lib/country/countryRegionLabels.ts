import type { CountryId } from "@/lib/constants/countriesCore";

/**
 * What a country calls its sub-national units ("State", "Land", "Region").
 *
 * Client metrics surfaces need one or two of these labels. Reading them from
 * the generated country client config pulled the whole 154 KB config into the
 * metrics chunk. `countryRegionLabels.test.ts` pins every entry to that config.
 */
export interface CountryRegionLabels {
  singular: string;
  plural: string;
}

export const COUNTRY_REGION_LABELS: Record<CountryId, CountryRegionLabels> = {
  US: { singular: "State", plural: "States" },
  UK: { singular: "Nation", plural: "Nations & Regions" },
  DE: { singular: "Land", plural: "Länder" },
  JP: { singular: "Region", plural: "Regions" },
  IE: { singular: "Region", plural: "Regions" },
  SCO: { singular: "Region", plural: "Regions" },
  WAL: { singular: "Region", plural: "Regions" },
  BR: { singular: "State", plural: "States" },
  CN: { singular: "Province", plural: "Provinces" },
  NG: { singular: "Zone", plural: "Zones" },
  HU: { singular: "Region", plural: "Regions" },
  PL: { singular: "Region", plural: "Regions" },
  RO: { singular: "Region", plural: "Regions" },
  YU: { singular: "Republic", plural: "Republics" },
  BG: { singular: "Region", plural: "Regions" },
  BLR: { singular: "Region", plural: "Regions" },
  CS: { singular: "Region", plural: "Regions" },
  UKR: { singular: "Region", plural: "Regions" },
  BAL: { singular: "Republic", plural: "Republics" },
  RU: { singular: "Republic", plural: "Republics" },
  FR: { singular: "Region", plural: "Regions" },
  IT: { singular: "Region", plural: "Regions" },
  ES: { singular: "Autonomous Community", plural: "Autonomous Communities" },
  SE: { singular: "County", plural: "Counties" },
  TR: { singular: "Region", plural: "Regions" },
  GR: { singular: "Region", plural: "Regions" },
  AT: { singular: "Region", plural: "Regions" },
  FI: { singular: "Region", plural: "Regions" },
  DD: { singular: "Region", plural: "Regions" },
};

export function getCountryRegionLabels(id: CountryId): CountryRegionLabels | undefined {
  return COUNTRY_REGION_LABELS[id];
}
