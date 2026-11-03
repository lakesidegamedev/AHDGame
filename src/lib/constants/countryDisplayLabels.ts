/**
 * Country display labels as client surfaces render them: name, flag, exchange
 * venue and the plural noun for its regions.
 *
 * `countryClientConfig.ts` carries the whole client registry (legislature,
 * office types, central bank, election systems). A commodity, forex, stock
 * market or world-organisation surface that only needs "Germany", "DAX" and a
 * flag should not ship it. This is the sliver those surfaces need, and
 * `countryDisplayLabels.test.ts` pins it to the registry country by country so a
 * rename, new venue or flag edit cannot drift.
 */
import type { CountryId } from "@/lib/constants/countriesCore";

export interface CountryDisplayLabel {
  name: string;
  /** Tradable venue; absent for countries with no bourse of their own. */
  exchangeName?: string;
  /** "market" = tradable bourse (default); "stateRegister" = command-economy register. */
  exchangeKind?: "market" | "stateRegister";
  flagEmoji: string;
  /** Name of the executive seat's building ("White House", "Kremlin"). */
  executiveLabel: string;
  /** Singular noun for one of the country's regions ("State", "Province"). */
  regionLabel: string;
  /** Plural noun for the country's regions ("States", "Provinces"). */
  regionLabelPlural: string;
}

export const COUNTRY_DISPLAY_LABELS: Record<CountryId, CountryDisplayLabel> = {
  US: {
    name: "United States",
    exchangeName: "NYSE",
    flagEmoji: "🇺🇸",
    executiveLabel: "White House",
    regionLabel: "State",
    regionLabelPlural: "States",
  },
  UK: {
    name: "United Kingdom",
    exchangeName: "FTSE",
    flagEmoji: "🇬🇧",
    executiveLabel: "10 Downing Street",
    regionLabel: "Nation",
    regionLabelPlural: "Nations & Regions",
  },
  DE: {
    name: "Germany",
    exchangeName: "DAX",
    flagEmoji: "🇩🇪",
    executiveLabel: "Federal Chancellery",
    regionLabel: "Land",
    regionLabelPlural: "Länder",
  },
  JP: {
    name: "Japan",
    exchangeName: "Nikkei",
    flagEmoji: "🇯🇵",
    executiveLabel: "Naikaku Sōri Daijin Kantei",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
  },
  IE: {
    name: "Ireland",
    exchangeName: "ISEQ",
    flagEmoji: "🇮🇪",
    executiveLabel: "Government Buildings",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
  },
  SCO: {
    name: "Scotland",
    exchangeName: "FTSE",
    flagEmoji: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    executiveLabel: "Bute House",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
  },
  WAL: {
    name: "Wales",
    exchangeName: "FTSE",
    flagEmoji: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
    executiveLabel: "Welsh Government",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
  },
  BR: {
    name: "Brazil",
    exchangeName: "B3",
    flagEmoji: "🇧🇷",
    executiveLabel: "Palácio do Planalto",
    regionLabel: "State",
    regionLabelPlural: "States",
  },
  CN: {
    name: "China",
    exchangeName: "SSE",
    flagEmoji: "🇨🇳",
    executiveLabel: "State Council",
    regionLabel: "Province",
    regionLabelPlural: "Provinces",
  },
  NG: {
    name: "Nigeria",
    exchangeName: "NGX",
    flagEmoji: "🇳🇬",
    executiveLabel: "Aso Rock",
    regionLabel: "Zone",
    regionLabelPlural: "Zones",
  },
  HU: {
    exchangeKind: "stateRegister",
    name: "Hungary",
    exchangeName: "OT",
    flagEmoji: "🇭🇺",
    executiveLabel: "Parliament",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
  },
  PL: {
    exchangeKind: "stateRegister",
    name: "Poland",
    exchangeName: "PKPG",
    flagEmoji: "🇵🇱",
    executiveLabel: "Council of Ministers",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
  },
  RO: {
    exchangeKind: "stateRegister",
    name: "Romania",
    exchangeName: "CSP",
    flagEmoji: "🇷🇴",
    executiveLabel: "Assembly",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
  },
  YU: {
    exchangeKind: "stateRegister",
    name: "Yugoslavia",
    exchangeName: "SZP",
    flagEmoji: "🇾🇺",
    executiveLabel: "Assembly",
    regionLabel: "Republic",
    regionLabelPlural: "Republics",
  },
  BG: {
    exchangeKind: "stateRegister",
    name: "Bulgaria",
    exchangeName: "DKP",
    flagEmoji: "🇧🇬",
    executiveLabel: "Assembly",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
  },
  BLR: {
    exchangeKind: "stateRegister",
    name: "Belarus",
    exchangeName: "GOSPLAN BSSR",
    flagEmoji: "🇧🇾",
    executiveLabel: "Soviet",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
  },
  CS: {
    exchangeKind: "stateRegister",
    name: "Czechoslovakia",
    exchangeName: "SPK",
    flagEmoji: "🇨🇿",
    executiveLabel: "Assembly",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
  },
  UKR: {
    exchangeKind: "stateRegister",
    name: "Ukraine",
    exchangeName: "GOSPLAN URSR",
    flagEmoji: "🇺🇦",
    executiveLabel: "Soviet",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
  },
  BAL: {
    exchangeKind: "stateRegister",
    name: "Baltic Republics",
    exchangeName: "GOSPLAN SSR",
    flagEmoji: "🏴",
    executiveLabel: "Soviet",
    regionLabel: "Republic",
    regionLabelPlural: "Republics",
  },
  RU: {
    exchangeKind: "stateRegister",
    name: "Russia",
    exchangeName: "GOSPLAN",
    flagEmoji: "🇸🇺",
    executiveLabel: "Council of Ministers",
    regionLabel: "Republic",
    regionLabelPlural: "Republics",
  },
  FR: {
    name: "France",
    flagEmoji: "🇫🇷",
    executiveLabel: "Élysée",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
  },
  IT: {
    name: "Italy",
    flagEmoji: "🇮🇹",
    executiveLabel: "Palazzo Chigi",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
  },
  ES: {
    name: "Spain",
    flagEmoji: "🇪🇸",
    executiveLabel: "Moncloa",
    regionLabel: "Autonomous Community",
    regionLabelPlural: "Autonomous Communities",
  },
  SE: {
    name: "Sweden",
    flagEmoji: "🇸🇪",
    executiveLabel: "Rosenbad",
    regionLabel: "County",
    regionLabelPlural: "Counties",
  },
  TR: {
    name: "Turkey",
    flagEmoji: "🇹🇷",
    executiveLabel: "Çankaya",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
  },
  GR: {
    name: "Greece",
    flagEmoji: "🇬🇷",
    executiveLabel: "Maximos Mansion",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
  },
  AT: {
    name: "Austria",
    flagEmoji: "🇦🇹",
    executiveLabel: "Ballhausplatz",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
  },
  FI: {
    name: "Finland",
    flagEmoji: "🇫🇮",
    executiveLabel: "Government Palace",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
  },
  DD: {
    exchangeKind: "stateRegister",
    name: "East Germany",
    exchangeName: "VVB",
    flagEmoji: "🇩🇩",
    executiveLabel: "Council of Ministers",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
  },
};
