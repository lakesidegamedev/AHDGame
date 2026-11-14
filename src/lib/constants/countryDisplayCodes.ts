/**
 * Short display code per country (the chip beside the flag in the navbar), kept
 * apart from the full client config so the navbar does not ship every
 * country's office titles. `countryDisplayCodes.test.ts` keeps it in step with
 * the config files.
 */
export const COUNTRY_DISPLAY_CODES: Readonly<Record<string, string>> = {
  AT: "AT",
  BAL: "BAL",
  BG: "BG",
  BLR: "BLR",
  BR: "BR",
  CA: "CA",
  CN: "CN",
  CS: "CS",
  DD: "DD",
  DE: "DE",
  ES: "ES",
  FI: "FI",
  FR: "FR",
  GR: "GR",
  HU: "HU",
  IE: "IE",
  IT: "IT",
  JP: "JP",
  NG: "NG",
  PL: "PL",
  QC: "QC",
  RO: "RO",
  RU: "RU",
  SCO: "SCO",
  SE: "SE",
  TR: "TR",
  UK: "GB",
  UKR: "UKR",
  US: "US",
  WAL: "WAL",
  YU: "YU",
};

export function countryDisplayCode(id: string): string {
  return COUNTRY_DISPLAY_CODES[id] ?? id;
}
