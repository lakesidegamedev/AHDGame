import type { CountryId, GovernmentType } from "@/lib/constants/countriesCore";

/**
 * The slice of a country's config that navigation labels need: government type,
 * executive and legislature names plus their routes.
 *
 * The Nation dropdown built these labels from `countryClientConfig`, which put
 * the whole 154 KB projected config in the shared navbar chunk for five fields
 * per country. `countryNavLabels.test.ts` pins every entry to the generated
 * config.
 */
export interface CountryNavLabels {
  id: CountryId;
  governmentType: GovernmentType;
  executiveLabel: string;
  executivePath: string;
  legislatureName: string;
  legislaturePath: string;
}

export const COUNTRY_NAV_LABELS: Record<CountryId, Omit<CountryNavLabels, "id">> = {
  US: {
    governmentType: "presidential",
    executiveLabel: "White House",
    executivePath: "/country/us/executive",
    legislatureName: "Congress",
    legislaturePath: "/country/us/legislature",
  },
  UK: {
    governmentType: "parliamentaryMonarchy",
    executiveLabel: "10 Downing Street",
    executivePath: "/country/uk/executive",
    legislatureName: "Parliament",
    legislaturePath: "/country/uk/legislature",
  },
  DE: {
    governmentType: "parliamentaryRepublic",
    executiveLabel: "Federal Chancellery",
    executivePath: "/country/de/executive",
    legislatureName: "Bundestag",
    legislaturePath: "/country/de/legislature",
  },
  JP: {
    governmentType: "parliamentaryMonarchy",
    executiveLabel: "Naikaku Sōri Daijin Kantei",
    executivePath: "/country/jp/executive",
    legislatureName: "Kokkai",
    legislaturePath: "/country/jp/legislature",
  },
  IE: {
    governmentType: "parliamentaryRepublic",
    executiveLabel: "Government Buildings",
    executivePath: "/country/ie/executive",
    legislatureName: "Oireachtas",
    legislaturePath: "/country/ie/legislature",
  },
  SCO: {
    governmentType: "parliamentaryRepublic",
    executiveLabel: "Bute House",
    executivePath: "/country/sco/executive",
    legislatureName: "Scottish Parliament",
    legislaturePath: "/country/sco/legislature",
  },
  WAL: {
    governmentType: "parliamentaryRepublic",
    executiveLabel: "Welsh Government",
    executivePath: "/country/wal/executive",
    legislatureName: "Senedd Cymru",
    legislaturePath: "/country/wal/legislature",
  },
  BR: {
    governmentType: "presidential",
    executiveLabel: "Palácio do Planalto",
    executivePath: "/country/br/executive",
    legislatureName: "National Congress",
    legislaturePath: "/country/br/legislature",
  },
  CN: {
    governmentType: "onePartyState",
    executiveLabel: "State Council",
    executivePath: "/country/cn/executive",
    legislatureName: "National People's Congress",
    legislaturePath: "/country/cn/legislature",
  },
  NG: {
    governmentType: "presidential",
    executiveLabel: "Aso Rock",
    executivePath: "/country/ng/executive",
    legislatureName: "National Assembly",
    legislaturePath: "/country/ng/legislature",
  },
  HU: {
    governmentType: "onePartyState",
    executiveLabel: "Parliament",
    executivePath: "/country/hu/executive",
    legislatureName: "National Assembly",
    legislaturePath: "/country/hu/legislature",
  },
  PL: {
    governmentType: "onePartyState",
    executiveLabel: "Council of Ministers",
    executivePath: "/country/pl/executive",
    legislatureName: "Sejm",
    legislaturePath: "/country/pl/legislature",
  },
  RO: {
    governmentType: "onePartyState",
    executiveLabel: "Assembly",
    executivePath: "/country/ro/executive",
    legislatureName: "Grand National Assembly",
    legislaturePath: "/country/ro/legislature",
  },
  YU: {
    governmentType: "onePartyState",
    executiveLabel: "Assembly",
    executivePath: "/country/yu/executive",
    legislatureName: "Federal Assembly",
    legislaturePath: "/country/yu/legislature",
  },
  BG: {
    governmentType: "onePartyState",
    executiveLabel: "Assembly",
    executivePath: "/country/bg/executive",
    legislatureName: "National Assembly",
    legislaturePath: "/country/bg/legislature",
  },
  BLR: {
    governmentType: "onePartyState",
    executiveLabel: "Soviet",
    executivePath: "/country/blr/executive",
    legislatureName: "Supreme Soviet",
    legislaturePath: "/country/blr/legislature",
  },
  CS: {
    governmentType: "onePartyState",
    executiveLabel: "Assembly",
    executivePath: "/country/cs/executive",
    legislatureName: "Federal Assembly",
    legislaturePath: "/country/cs/legislature",
  },
  UKR: {
    governmentType: "onePartyState",
    executiveLabel: "Soviet",
    executivePath: "/country/ua/executive",
    legislatureName: "Supreme Soviet",
    legislaturePath: "/country/ua/legislature",
  },
  BAL: {
    governmentType: "onePartyState",
    executiveLabel: "Soviet",
    executivePath: "/country/bal/executive",
    legislatureName: "Supreme Soviet",
    legislaturePath: "/country/bal/legislature",
  },
  RU: {
    governmentType: "onePartyState",
    executiveLabel: "Council of Ministers",
    executivePath: "/country/ru/executive",
    legislatureName: "Supreme Soviet",
    legislaturePath: "/country/ru/legislature",
  },
  FR: {
    governmentType: "presidential",
    executiveLabel: "Élysée",
    executivePath: "/country/fr/executive",
    legislatureName: "Parliament",
    legislaturePath: "/country/fr/legislature",
  },
  IT: {
    governmentType: "parliamentaryRepublic",
    executiveLabel: "Palazzo Chigi",
    executivePath: "/country/it/executive",
    legislatureName: "Parliament",
    legislaturePath: "/country/it/legislature",
  },
  ES: {
    governmentType: "parliamentaryMonarchy",
    executiveLabel: "Moncloa",
    executivePath: "/country/es/executive",
    legislatureName: "Cortes Generales",
    legislaturePath: "/country/es/legislature",
  },
  SE: {
    governmentType: "parliamentaryMonarchy",
    executiveLabel: "Rosenbad",
    executivePath: "/country/se/executive",
    legislatureName: "Riksdag",
    legislaturePath: "/country/se/legislature",
  },
  TR: {
    governmentType: "parliamentaryRepublic",
    executiveLabel: "Çankaya",
    executivePath: "/country/tr/executive",
    legislatureName: "Grand National Assembly",
    legislaturePath: "/country/tr/legislature",
  },
  GR: {
    governmentType: "parliamentaryRepublic",
    executiveLabel: "Maximos Mansion",
    executivePath: "/country/gr/executive",
    legislatureName: "Hellenic Parliament",
    legislaturePath: "/country/gr/legislature",
  },
  AT: {
    governmentType: "parliamentaryRepublic",
    executiveLabel: "Ballhausplatz",
    executivePath: "/country/at/executive",
    legislatureName: "Nationalrat",
    legislaturePath: "/country/at/legislature",
  },
  FI: {
    governmentType: "parliamentaryRepublic",
    executiveLabel: "Government Palace",
    executivePath: "/country/fi/executive",
    legislatureName: "Eduskunta",
    legislaturePath: "/country/fi/legislature",
  },
  DD: {
    governmentType: "onePartyState",
    executiveLabel: "Council of Ministers",
    executivePath: "/country/dd/executive",
    legislatureName: "Volkskammer",
    legislaturePath: "/country/dd/legislature",
  },
};

export function getCountryNavLabels(id: CountryId): CountryNavLabels {
  return { id, ...COUNTRY_NAV_LABELS[id] };
}
