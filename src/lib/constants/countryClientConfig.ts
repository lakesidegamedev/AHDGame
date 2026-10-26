/**
 * GENERATED FILE. DO NOT EDIT BY HAND.
 *
 *   npx tsx scripts/countries/gen-country-client-config.ts
 *
 * The client-safe slice of the country registry: display names, chamber keys
 * and labels, currency codes, routes, government type and office labels. It
 * imports nothing but `countriesCore` and types, so a client component that
 * needs a country's name no longer pulls the full registry (and its 29
 * institution and era modules) into the browser bundle.
 *
 * The field list is the contract: `scripts/countries/gen-country-client-config.ts`
 * projects `COUNTRY_CONFIGS` down to it, and
 * `countryClientConfig.test.ts` fails when a seed edit is not regenerated.
 */
import {
  COUNTRY_ORDER,
  getExecutiveOrderNameForGovernmentType,
  getExecutiveOrderNamePluralForGovernmentType,
  type CountryId,
  type CountryStatus,
  type ElectionMethod,
  type ElectionPosition,
  type GovernmentType,
  type OpsVoteMultipliers,
} from "./countriesCore";
import type { CurrencyCode } from "./currencies";

/** One chamber as client components render it. */
export interface CountryClientChamberConfig {
  key: string;
  name: string;
  shortName: string;
  seats: number;
  description?: string;
  elected?: boolean;
  regionElectedClasses?: boolean;
  regionalModel?: boolean;
}

/** The legislature block client components read. */
export interface CountryClientLegislatureConfig {
  name: string;
  path: string;
  bicameral: boolean;
  lowerChamber: CountryClientChamberConfig;
  upperChamber?: CountryClientChamberConfig;
}

/** One office type, reduced to the fields client components display. */
export interface CountryClientOfficeType {
  key: string;
  label: string;
  labelPlural: string;
  chamberKey?: string;
  isExecutive: boolean;
  isSubNational: boolean;
  isHeadOfState?: boolean;
}

/** The central-bank identity fields a client page shows. */
export interface CountryClientCentralBankConfig {
  name: string;
  abbreviation: string;
  heroImage?: string;
  heroAlt?: string;
  defaultPrimeRate: number;
  sharedBankId?: string;
  centralBankIntorgId?: string;
}

/** One country, reduced to the fields client modules read. */
export interface CountryClientConfig {
  id: CountryId;
  name: string;
  code: string;
  flagEmoji: string;
  status: CountryStatus;
  regionLabel: string;
  regionLabelPlural: string;
  executiveTitle: string;
  executiveRealmPhrase?: string;
  executiveLabel: string;
  executivePath: string;
  governmentType: GovernmentType;
  governmentTypeLabel: string;
  descriptor: string;
  heroImage?: string;
  overviewHeroImage?: string;
  overviewPath: string;
  mapPath: string;
  currencyCode: CurrencyCode;
  centralGovernmentLabel: string;
  exchangeName?: string;
  financeMinisterCabinetId?: string;
  demographicProfileId: string;
  regionalBillAssentTitle?: string;
  rulingPartyId?: number;
  opsVoteMultipliers?: OpsVoteMultipliers;
  hasLeaderConfidenceModel?: boolean;
  majorPartyIds: string[];
  partyCreationNPPs: {
    statesRequired: number;
    lockHomeState: boolean;
    nppsPerState: number;
  };
  partyRoleLabels?: {
    chair?: string;
    viceChair?: string;
    treasurer?: string;
    committee?: string;
  };
  executiveTermLimit?: {
    officeKey: string;
    maxTermsPerCharacter: number;
    blocksRunningMateSelection: boolean;
  };
  legislature: CountryClientLegislatureConfig;
  /** Sub-national chambers ship without seat counts; no client reads them. */
  subNationalChamber?: Pick<
    CountryClientChamberConfig,
    "key" | "name" | "shortName" | "regionalModel"
  >;
  officeTypes: CountryClientOfficeType[];
  electionSystems: Partial<Record<ElectionPosition, ElectionMethod>>;
  lowerElectionSystem: { snapElectionsAllowed: boolean };
  upperElectionSystem?: { snapElectionsAllowed: boolean };
  centralBank: CountryClientCentralBankConfig;
  usdExchangeRate: number;
}

/** Every country, projected to {@link CountryClientConfig}. */
export const COUNTRY_CLIENT_CONFIGS: Record<CountryId, CountryClientConfig> = {
  US: {
    id: "US",
    name: "United States",
    code: "US",
    status: "active",
    flagEmoji: "🇺🇸",
    regionLabel: "State",
    regionLabelPlural: "States",
    executiveTitle: "President",
    executiveRealmPhrase: "the United States",
    executiveLabel: "White House",
    executivePath: "/country/us/executive",
    governmentType: "presidential",
    governmentTypeLabel: "Presidential Republic",
    descriptor:
      "A federal presidential republic with 50 states, a bicameral Congress, and a directly elected President who serves as both head of state and government.",
    heroImage: "https://flagcdn.com/w640/us.png",
    overviewHeroImage: "/api/images/hero/us-overview-mount-rushmore",
    overviewPath: "/country/us",
    mapPath: "/country/us/map",
    currencyCode: "USD",
    centralGovernmentLabel: "Federal Grants",
    exchangeName: "NYSE",
    financeMinisterCabinetId: "secretary_of_treasury",
    demographicProfileId: "us_archetypes",
    majorPartyIds: ["democrat", "republican"],
    partyCreationNPPs: {
      statesRequired: 4,
      lockHomeState: true,
      nppsPerState: 2,
    },
    executiveTermLimit: {
      officeKey: "president",
      maxTermsPerCharacter: 2,
      blocksRunningMateSelection: true,
    },
    legislature: {
      name: "Congress",
      path: "/country/us/legislature",
      bicameral: true,
      lowerChamber: {
        key: "house",
        name: "House of Representatives",
        shortName: "House",
        seats: 435,
        description: "435 representatives, two-year terms. All revenue bills originate here.",
      },
      upperChamber: {
        key: "senate",
        name: "Senate",
        shortName: "Senate",
        seats: 100,
        description: "100 senators, six-year staggered terms. Confirms judges and cabinet.",
        elected: true,
        regionElectedClasses: true,
      },
    },
    subNationalChamber: {
      key: "stateSenate",
      name: "State Senate",
      shortName: "State Senate",
    },
    officeTypes: [
      {
        key: "president",
        label: "President",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Presidents",
      },
      {
        key: "vicePresident",
        label: "Vice President",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Vice Presidents",
      },
      {
        key: "senate",
        label: "Senator",
        chamberKey: "senate",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Senators",
      },
      {
        key: "house",
        label: "Representative",
        chamberKey: "house",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Representatives",
      },
      {
        key: "governor",
        label: "Governor",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Governors",
      },
      {
        key: "stateSenate",
        label: "State Senator",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "State Senators",
      },
      {
        key: "centralBankChair",
        label: "Federal Reserve Chair",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Federal Reserve Chairs",
      },
    ],
    electionSystems: {
      lowerChamber: "pr_hareQuota",
      upperChamber: "fptp",
      subNationalChamber: "pr_hareQuota",
      subNationalExecutive: "fptp",
      headOfState: "electoralCollege",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    upperElectionSystem: {
      snapElectionsAllowed: false,
    },
    centralBank: {
      name: "Federal Reserve",
      abbreviation: "Fed",
      heroImage: "/api/images/hero/federal-reserve",
      heroAlt: "Marriner S. Eccles Federal Reserve Board Building, Washington D.C.",
      defaultPrimeRate: 3,
    },
    usdExchangeRate: 1,
  },
  UK: {
    id: "UK",
    name: "United Kingdom",
    code: "GB",
    status: "active",
    flagEmoji: "🇬🇧",
    regionLabel: "Nation",
    regionLabelPlural: "Nations & Regions",
    executiveTitle: "Prime Minister",
    executiveRealmPhrase: "the United Kingdom",
    executiveLabel: "10 Downing Street",
    executivePath: "/country/uk/executive",
    governmentType: "parliamentaryMonarchy",
    governmentTypeLabel: "Constitutional Monarchy",
    descriptor:
      "A constitutional monarchy and parliamentary democracy across four nations, where the Prime Minister leads the government through a majority in the 650-seat House of Commons.",
    heroImage: "https://flagcdn.com/w640/gb.png",
    overviewPath: "/country/uk",
    mapPath: "/country/uk/map",
    currencyCode: "GBP",
    centralGovernmentLabel: "Westminster Funding",
    exchangeName: "FTSE",
    financeMinisterCabinetId: "chancellor",
    demographicProfileId: "uk_archetypes",
    regionalBillAssentTitle: "First Minister",
    majorPartyIds: ["LAB", "CON"],
    partyCreationNPPs: {
      statesRequired: 2,
      lockHomeState: false,
      nppsPerState: 1,
    },
    legislature: {
      name: "Parliament",
      path: "/country/uk/legislature",
      bicameral: false,
      lowerChamber: {
        key: "commons",
        name: "House of Commons",
        shortName: "Commons",
        seats: 650,
        description:
          "650 elected MPs from single-member constituencies. The primary legislative chamber.",
      },
      upperChamber: {
        key: "lords",
        name: "House of Lords",
        shortName: "Lords",
        seats: 784,
        description: "Appointed and hereditary peers. Revises and scrutinises legislation.",
      },
    },
    subNationalChamber: {
      key: "regionalCouncil",
      name: "Regional Council",
      shortName: "Regional Council",
      regionalModel: true,
    },
    officeTypes: [
      {
        key: "primeMinister",
        label: "Prime Minister",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Prime Ministers",
      },
      {
        key: "commons",
        label: "Member of Parliament",
        chamberKey: "commons",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Members of Parliament",
      },
      {
        key: "regionalCouncil",
        label: "Regional Councillor",
        chamberKey: "regionalCouncil",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Regional Councillors",
      },
      {
        key: "governor",
        label: "First Minister",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "First Ministers",
      },
      {
        key: "centralBankChair",
        label: "Governor of the Bank of England",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the Bank of England",
      },
    ],
    electionSystems: {
      lowerChamber: "pr_hareQuota",
      subNationalChamber: "pr_hareQuota",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
    centralBank: {
      name: "Bank of England",
      abbreviation: "BoE",
      heroImage: "/api/images/hero/bank-of-england",
      heroAlt: "Bank of England, Threadneedle Street, London",
      defaultPrimeRate: 3,
    },
    usdExchangeRate: 1,
  },
  DE: {
    id: "DE",
    name: "Germany",
    code: "DE",
    status: "active",
    flagEmoji: "🇩🇪",
    regionLabel: "Land",
    regionLabelPlural: "Länder",
    executiveTitle: "Chancellor",
    executiveLabel: "Federal Chancellery",
    executivePath: "/country/de/executive",
    governmentType: "parliamentaryRepublic",
    governmentTypeLabel: "Parliamentary Republic",
    descriptor:
      "A federal parliamentary republic where the Chancellor leads government through a Bundestag majority, elected via mixed-member proportional representation.",
    heroImage: "https://flagcdn.com/w640/de.png",
    overviewPath: "/country/de",
    mapPath: "/country/de/map",
    currencyCode: "EUR",
    centralGovernmentLabel: "Federal Grants",
    exchangeName: "DAX",
    financeMinisterCabinetId: "finance_minister",
    demographicProfileId: "de_archetypes",
    regionalBillAssentTitle: "Minister-President",
    majorPartyIds: ["spd", "cdu"],
    partyCreationNPPs: {
      statesRequired: 2,
      lockHomeState: false,
      nppsPerState: 1,
    },
    legislature: {
      name: "Bundestag",
      path: "/country/de/legislature",
      bicameral: false,
      lowerChamber: {
        key: "bundestag",
        name: "Bundestag",
        shortName: "Bundestag",
        seats: 630,
        description:
          "630 members elected via mixed-member proportional representation (2023 reform).",
      },
      upperChamber: {
        key: "bundesrat",
        name: "Bundesrat",
        shortName: "Bundesrat",
        seats: 69,
        description: "69 members representing the 16 German Länder.",
      },
    },
    subNationalChamber: {
      key: "landtag",
      name: "Landtag",
      shortName: "Landtag",
      regionalModel: true,
    },
    officeTypes: [
      {
        key: "chancellor",
        label: "Chancellor",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Chancellors",
      },
      {
        key: "bundestag",
        label: "Member of Bundestag",
        chamberKey: "bundestag",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Members of Bundestag",
      },
      {
        key: "ministerPresident",
        label: "Minister-President",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Minister-Presidents",
      },
      {
        key: "landtag",
        label: "Mitglied des Landtags",
        chamberKey: "landtag",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Mitglieder des Landtags",
      },
      {
        key: "centralBankChair",
        label: "President of the ECB",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Presidents of the ECB",
      },
    ],
    electionSystems: {
      lowerChamber: "ams",
      subNationalChamber: "pr_sainteLague",
      subNationalExecutive: "fptp",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
    centralBank: {
      name: "European Central Bank",
      abbreviation: "ECB",
      heroImage: "/api/images/hero/ecb",
      defaultPrimeRate: 3,
      sharedBankId: "ECB",
      centralBankIntorgId: "EU",
    },
    usdExchangeRate: 1,
  },
  JP: {
    id: "JP",
    name: "Japan",
    code: "JP",
    status: "active",
    flagEmoji: "🇯🇵",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
    executiveTitle: "Prime Minister",
    executiveRealmPhrase: "Japan",
    executiveLabel: "Naikaku Sōri Daijin Kantei",
    executivePath: "/country/jp/executive",
    governmentType: "parliamentaryMonarchy",
    governmentTypeLabel: "Constitutional Monarchy",
    descriptor:
      "A parliamentary constitutional monarchy where the Prime Minister leads government through confidence in the House of Representatives, alongside the House of Councillors and elected regional governments.",
    heroImage: "https://flagcdn.com/w640/jp.png",
    overviewPath: "/country/jp",
    mapPath: "/country/jp/map",
    currencyCode: "JPY",
    centralGovernmentLabel: "National Transfers",
    exchangeName: "Nikkei",
    financeMinisterCabinetId: "finance_minister",
    demographicProfileId: "jp_archetypes",
    majorPartyIds: ["ldp", "cdp"],
    partyCreationNPPs: {
      statesRequired: 2,
      lockHomeState: false,
      nppsPerState: 1,
    },
    legislature: {
      name: "Kokkai",
      path: "/country/jp/legislature",
      bicameral: true,
      lowerChamber: {
        key: "shugiin",
        name: "Shūgiin",
        shortName: "Shūgiin",
        seats: 465,
        description:
          "465 members elected by FPTP from regional constituencies. Invests confidence in the Cabinet.",
      },
      upperChamber: {
        key: "sangiin",
        name: "Sangiin",
        shortName: "Sangiin",
        seats: 248,
        description:
          "248 councillors elected on staggered 6-year terms. Half are contested every 3 years. Cannot be dissolved.",
        elected: true,
      },
    },
    subNationalChamber: {
      key: "regionalCouncil",
      name: "Regional Council",
      shortName: "Regional Council",
      regionalModel: true,
    },
    officeTypes: [
      {
        key: "primeMinister",
        label: "Prime Minister",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Prime Ministers",
      },
      {
        key: "shugiin",
        label: "Member of the House of Representatives",
        chamberKey: "shugiin",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Members of the House of Representatives",
      },
      {
        key: "sangiin",
        label: "Member of the House of Councillors",
        chamberKey: "sangiin",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Members of the House of Councillors",
      },
      {
        key: "regionalCouncil",
        label: "Regional Councillor",
        chamberKey: "regionalCouncil",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Regional Councillors",
      },
      {
        key: "governor",
        label: "Governor",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Governors",
      },
      {
        key: "centralBankChair",
        label: "Governor of the Bank of Japan",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the Bank of Japan",
      },
    ],
    electionSystems: {
      lowerChamber: "pr_hareQuota",
      upperChamber: "pr_hareQuota",
      subNationalChamber: "pr_hareQuota",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
    upperElectionSystem: {
      snapElectionsAllowed: false,
    },
    centralBank: {
      name: "Bank of Japan",
      abbreviation: "BoJ",
      heroImage: "/api/images/hero/bank-of-japan",
      defaultPrimeRate: 1,
    },
    usdExchangeRate: 0.00943,
  },
  IE: {
    id: "IE",
    name: "Ireland",
    code: "IE",
    status: "active",
    flagEmoji: "🇮🇪",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
    executiveTitle: "Taoiseach",
    executiveRealmPhrase: "Ireland",
    executiveLabel: "Government Buildings",
    executivePath: "/country/ie/executive",
    governmentType: "parliamentaryRepublic",
    governmentTypeLabel: "Parliamentary Republic",
    descriptor:
      "A parliamentary republic where the Taoiseach leads government through a Dáil majority, elected by proportional representation using the Single Transferable Vote across multi-seat constituencies.",
    heroImage: "https://flagcdn.com/w640/ie.png",
    overviewPath: "/country/ie",
    mapPath: "/country/ie/map",
    currencyCode: "IEP",
    centralGovernmentLabel: "Exchequer Grants",
    exchangeName: "ISEQ",
    financeMinisterCabinetId: "minister_for_finance",
    demographicProfileId: "ie_archetypes",
    regionalBillAssentTitle: "Cathaoirleach",
    majorPartyIds: ["fine_gael", "fianna_fail"],
    partyCreationNPPs: {
      statesRequired: 2,
      lockHomeState: false,
      nppsPerState: 1,
    },
    executiveTermLimit: {
      officeKey: "uachtaran",
      maxTermsPerCharacter: 2,
      blocksRunningMateSelection: false,
    },
    legislature: {
      name: "Oireachtas",
      path: "/country/ie/legislature",
      bicameral: false,
      lowerChamber: {
        key: "dail",
        name: "Dáil Éireann",
        shortName: "Dáil",
        seats: 160,
        description:
          "160 TDs elected by proportional representation using the Single Transferable Vote across multi-seat constituencies.",
      },
      upperChamber: {
        key: "seanad",
        name: "Seanad Éireann",
        shortName: "Seanad",
        seats: 60,
        description:
          "60 senators - 43 elected from vocational panels, 11 nominated by the Taoiseach, 6 from universities.",
      },
    },
    subNationalChamber: {
      key: "localCouncil",
      name: "Local Council",
      shortName: "Council",
      regionalModel: true,
    },
    officeTypes: [
      {
        key: "taoiseach",
        label: "Taoiseach",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Taoisigh",
      },
      {
        key: "tanaiste",
        label: "Tánaiste",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Tánaistí",
      },
      {
        key: "uachtaran",
        label: "Uachtarán",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Uachtaráin",
      },
      {
        key: "dail",
        label: "Teachta Dála",
        chamberKey: "dail",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Teachtaí Dála",
      },
      {
        key: "centralBankChair",
        label: "Governor of the Central Bank of Ireland",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the Central Bank of Ireland",
      },
      {
        key: "localCouncil",
        label: "Councillor",
        chamberKey: "localCouncil",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Councillors",
      },
      {
        key: "governor",
        label: "Cathaoirleach",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Cathaoirligh",
      },
    ],
    electionSystems: {
      lowerChamber: "pr_hareQuota",
      upperChamber: "pr_hareQuota",
      subNationalChamber: "pr_hareQuota",
      headOfGovernment: "parliamentary",
      headOfState: "fptp",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
    centralBank: {
      name: "Central Bank of Ireland",
      abbreviation: "CBI",
      heroImage: "/api/images/hero/ecb",
      defaultPrimeRate: 3,
    },
    usdExchangeRate: 1,
  },
  SCO: {
    id: "SCO",
    name: "Scotland",
    code: "SCO",
    status: "coming-soon",
    flagEmoji: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
    executiveTitle: "First Minister",
    executiveRealmPhrase: "Scotland",
    executiveLabel: "Bute House",
    executivePath: "/country/sco/executive",
    governmentType: "parliamentaryRepublic",
    governmentTypeLabel: "Parliamentary Republic",
    descriptor:
      "A parliamentary republic where the First Minister leads government through a Holyrood majority, elected by the Additional Member System across Scotland's regions.",
    heroImage: "https://flagcdn.com/w640/gb-sct.png",
    overviewPath: "/country/sco",
    mapPath: "/country/sco/map",
    currencyCode: "GBP",
    centralGovernmentLabel: "Scottish Block Grant",
    exchangeName: "FTSE",
    financeMinisterCabinetId: "financeSecretary",
    demographicProfileId: "uk_archetypes",
    regionalBillAssentTitle: "Provost",
    majorPartyIds: ["SNP", "LAB"],
    partyCreationNPPs: {
      statesRequired: 2,
      lockHomeState: false,
      nppsPerState: 1,
    },
    legislature: {
      name: "Scottish Parliament",
      path: "/country/sco/legislature",
      bicameral: false,
      lowerChamber: {
        key: "holyrood",
        name: "Scottish Parliament",
        shortName: "Holyrood",
        seats: 129,
        description:
          "129 MSPs elected by the Additional Member System - 73 constituency seats plus 56 regional list seats.",
      },
    },
    subNationalChamber: {
      key: "regionalCouncil",
      name: "Regional Council",
      shortName: "Council",
      regionalModel: true,
    },
    officeTypes: [
      {
        key: "firstMinister",
        label: "First Minister",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "First Ministers",
      },
      {
        key: "holyrood",
        label: "Member of the Scottish Parliament",
        chamberKey: "holyrood",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Members of the Scottish Parliament",
      },
      {
        key: "governor",
        label: "Provost",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Provosts",
      },
      {
        key: "regionalCouncil",
        label: "Regional Councillor",
        chamberKey: "regionalCouncil",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Regional Councillors",
      },
      {
        key: "centralBankChair",
        label: "Governor of the Bank of England",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the Bank of England",
      },
    ],
    electionSystems: {
      lowerChamber: "ams",
      subNationalChamber: "pr_hareQuota",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
    centralBank: {
      name: "Bank of England",
      abbreviation: "BoE",
      heroImage: "/api/images/hero/bank-of-england",
      defaultPrimeRate: 3,
      sharedBankId: "UK",
    },
    usdExchangeRate: 1,
  },
  WAL: {
    id: "WAL",
    name: "Wales",
    code: "WAL",
    status: "coming-soon",
    flagEmoji: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
    executiveTitle: "First Minister",
    executiveRealmPhrase: "Wales",
    executiveLabel: "Welsh Government",
    executivePath: "/country/wal/executive",
    governmentType: "parliamentaryRepublic",
    governmentTypeLabel: "Parliamentary Republic",
    descriptor:
      "A parliamentary republic where the First Minister leads government through a Senedd majority, elected by the Additional Member System across Wales's regions.",
    heroImage: "https://flagcdn.com/w640/gb-wls.png",
    overviewPath: "/country/wal",
    mapPath: "/country/wal/map",
    currencyCode: "GBP",
    centralGovernmentLabel: "Welsh Block Grant",
    exchangeName: "FTSE",
    financeMinisterCabinetId: "financeSecretary",
    demographicProfileId: "uk_archetypes",
    regionalBillAssentTitle: "Leader",
    majorPartyIds: ["PC", "LAB"],
    partyCreationNPPs: {
      statesRequired: 2,
      lockHomeState: false,
      nppsPerState: 1,
    },
    legislature: {
      name: "Senedd Cymru",
      path: "/country/wal/legislature",
      bicameral: false,
      lowerChamber: {
        key: "senedd",
        name: "Senedd Cymru",
        shortName: "Senedd",
        seats: 60,
        description:
          "60 Members of the Senedd elected by the Additional Member System - 40 constituency seats plus 20 regional list seats.",
      },
    },
    subNationalChamber: {
      key: "regionalCouncil",
      name: "Regional Council",
      shortName: "Council",
      regionalModel: true,
    },
    officeTypes: [
      {
        key: "firstMinister",
        label: "First Minister",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "First Ministers",
      },
      {
        key: "senedd",
        label: "Member of the Senedd",
        chamberKey: "senedd",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Members of the Senedd",
      },
      {
        key: "governor",
        label: "Leader",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Leaders",
      },
      {
        key: "regionalCouncil",
        label: "Regional Councillor",
        chamberKey: "regionalCouncil",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Regional Councillors",
      },
      {
        key: "centralBankChair",
        label: "Governor of the Bank of England",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the Bank of England",
      },
    ],
    electionSystems: {
      lowerChamber: "ams",
      subNationalChamber: "pr_hareQuota",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
    centralBank: {
      name: "Bank of England",
      abbreviation: "BoE",
      heroImage: "/api/images/hero/bank-of-england",
      defaultPrimeRate: 3,
      sharedBankId: "UK",
    },
    usdExchangeRate: 1,
  },
  BR: {
    id: "BR",
    name: "Brazil",
    code: "BR",
    status: "coming-soon",
    flagEmoji: "🇧🇷",
    regionLabel: "State",
    regionLabelPlural: "States",
    executiveTitle: "President",
    executiveRealmPhrase: "Brazil",
    executiveLabel: "Palácio do Planalto",
    executivePath: "/country/br/executive",
    governmentType: "presidential",
    governmentTypeLabel: "Presidential Republic",
    descriptor:
      "A federal presidential republic where the directly elected President governs alongside a National Congress of 513 deputies and 81 senators across five macro-regions.",
    heroImage: "https://flagcdn.com/w640/br.png",
    overviewPath: "/country/br",
    mapPath: "/country/br/map",
    currencyCode: "BRL",
    centralGovernmentLabel: "Federal Transfers",
    exchangeName: "B3",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "br_archetypes",
    majorPartyIds: ["pt", "pl"],
    partyCreationNPPs: {
      statesRequired: 3,
      lockHomeState: true,
      nppsPerState: 2,
    },
    executiveTermLimit: {
      officeKey: "president",
      maxTermsPerCharacter: 2,
      blocksRunningMateSelection: true,
    },
    legislature: {
      name: "National Congress",
      path: "/country/br/legislature",
      bicameral: true,
      lowerChamber: {
        key: "chamber",
        name: "Chamber of Deputies",
        shortName: "Chamber",
        seats: 513,
        description:
          "513 deputies elected by open-list proportional representation from 27 multi-member constituencies. Four-year terms.",
      },
      upperChamber: {
        key: "senate",
        name: "Federal Senate",
        shortName: "Senate",
        seats: 81,
        description:
          "81 senators - three per state - serving eight-year staggered terms. Reviews legislation from the Chamber.",
        elected: true,
      },
    },
    officeTypes: [
      {
        key: "president",
        label: "President",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Presidents",
      },
      {
        key: "vicePresident",
        label: "Vice President",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Vice Presidents",
      },
      {
        key: "senate",
        label: "Senator",
        chamberKey: "senate",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Senators",
      },
      {
        key: "chamber",
        label: "Federal Deputy",
        chamberKey: "chamber",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Federal Deputies",
      },
      {
        key: "governor",
        label: "Governor",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Governors",
      },
      {
        key: "centralBankChair",
        label: "Governor of the BCB",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the BCB",
      },
    ],
    electionSystems: {
      lowerChamber: "pr_hareQuota",
      upperChamber: "fptp",
      headOfState: "fptp",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    upperElectionSystem: {
      snapElectionsAllowed: false,
    },
    centralBank: {
      name: "Banco Central do Brasil",
      abbreviation: "BCB",
      heroImage: "/api/images/hero/banco-central-do-brasil",
      defaultPrimeRate: 8,
    },
    usdExchangeRate: 0.2,
  },
  CN: {
    id: "CN",
    name: "China",
    code: "CN",
    status: "active",
    flagEmoji: "🇨🇳",
    regionLabel: "Province",
    regionLabelPlural: "Provinces",
    executiveTitle: "Premier",
    executiveRealmPhrase: "China",
    executiveLabel: "State Council",
    executivePath: "/country/cn/executive",
    governmentType: "onePartyState",
    governmentTypeLabel: "One Party State",
    descriptor:
      "A unitary state governed by the Chinese Communist Party, where the Premier leads the State Council through confidence of the 2,980-seat National People's Congress across seven geographic regions.",
    heroImage: "https://flagcdn.com/w640/cn.png",
    overviewPath: "/country/cn",
    mapPath: "/country/cn/map",
    currencyCode: "CNY",
    centralGovernmentLabel: "Central Government Transfers",
    exchangeName: "SSE",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "cn_archetypes",
    rulingPartyId: 1,
    hasLeaderConfidenceModel: true,
    majorPartyIds: ["ccp"],
    partyCreationNPPs: {
      statesRequired: 2,
      lockHomeState: false,
      nppsPerState: 1,
    },
    partyRoleLabels: {
      chair: "General Secretary",
      viceChair: "Deputy General Secretary",
      committee: "Secretariat",
    },
    legislature: {
      name: "National People's Congress",
      path: "/country/cn/legislature",
      bicameral: false,
      lowerChamber: {
        key: "npc",
        name: "National People's Congress",
        shortName: "NPC",
        seats: 2980,
        description:
          "2,980 delegates representing provinces, municipalities, autonomous regions, the armed forces, and special administrative regions. Five-year terms.",
      },
      upperChamber: {
        key: "cppcc",
        name: "CPPCC",
        shortName: "CPPCC",
        seats: 2169,
        description:
          "2,169 members of the Chinese People's Political Consultative Conference - an advisory body representing diverse social and economic constituencies.",
      },
    },
    subNationalChamber: {
      key: "peoplesCongress",
      name: "People's Congress",
      shortName: "People's Congress",
      regionalModel: true,
    },
    officeTypes: [
      {
        key: "premier",
        label: "Premier",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Premiers",
      },
      {
        key: "president",
        label: "President",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Presidents",
      },
      {
        key: "npcDelegate",
        label: "NPC Delegate",
        chamberKey: "npc",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "NPC Delegates",
      },
      {
        key: "peoplesCongress",
        label: "Provincial Delegate",
        chamberKey: "peoplesCongress",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Provincial Delegates",
      },
      {
        key: "governor",
        label: "Governor",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Governors",
      },
      {
        key: "centralBankChair",
        label: "Governor of the PBoC",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the PBoC",
      },
    ],
    electionSystems: {
      lowerChamber: "pr_hareQuota",
      subNationalChamber: "pr_hareQuota",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    centralBank: {
      name: "People's Bank of China",
      abbreviation: "PBoC",
      heroImage: "/api/images/hero/peoples-bank-of-china",
      defaultPrimeRate: 4,
    },
    usdExchangeRate: 0.138,
  },
  NG: {
    id: "NG",
    name: "Nigeria",
    code: "NG",
    status: "coming-soon",
    flagEmoji: "🇳🇬",
    regionLabel: "Zone",
    regionLabelPlural: "Zones",
    executiveTitle: "President",
    executiveRealmPhrase: "Nigeria",
    executiveLabel: "Aso Rock",
    executivePath: "/country/ng/executive",
    governmentType: "presidential",
    governmentTypeLabel: "Presidential Republic",
    descriptor:
      "A federal presidential republic where a directly elected President governs alongside a bicameral National Assembly — a 109-seat Senate and a 360-seat House of Representatives — across six geopolitical zones spanning the Nigerian federation.",
    heroImage: "https://flagcdn.com/w640/ng.png",
    overviewPath: "/country/ng",
    mapPath: "/country/ng/map",
    currencyCode: "NGN",
    centralGovernmentLabel: "Federal Allocations",
    exchangeName: "NGX",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "ng_archetypes",
    majorPartyIds: ["apc", "pdp"],
    partyCreationNPPs: {
      statesRequired: 3,
      lockHomeState: true,
      nppsPerState: 2,
    },
    executiveTermLimit: {
      officeKey: "president",
      maxTermsPerCharacter: 2,
      blocksRunningMateSelection: true,
    },
    legislature: {
      name: "National Assembly",
      path: "/country/ng/legislature",
      bicameral: true,
      lowerChamber: {
        key: "house",
        name: "House of Representatives",
        shortName: "House",
        seats: 360,
        description:
          "360 representatives elected from single-member constituencies across the Nigerian federation.",
      },
      upperChamber: {
        key: "senate",
        name: "Senate",
        shortName: "Senate",
        seats: 109,
        description:
          "109 senators elected from constituencies across the Nigerian federation for four-year terms.",
        elected: true,
      },
    },
    officeTypes: [
      {
        key: "president",
        label: "President",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Presidents",
      },
      {
        key: "vicePresident",
        label: "Vice President",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Vice Presidents",
      },
      {
        key: "senate",
        label: "Senator",
        chamberKey: "senate",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Senators",
      },
      {
        key: "house",
        label: "Representative",
        chamberKey: "house",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Representatives",
      },
      {
        key: "regionalCouncil",
        label: "Assembly Member",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Assembly Members",
      },
      {
        key: "governor",
        label: "Governor",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Governors",
      },
      {
        key: "centralBankChair",
        label: "Governor of the CBN",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the CBN",
      },
    ],
    electionSystems: {
      lowerChamber: "fptp",
      upperChamber: "fptp",
      headOfState: "fptp",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    upperElectionSystem: {
      snapElectionsAllowed: false,
    },
    centralBank: {
      name: "Central Bank of Nigeria",
      abbreviation: "CBN",
      heroImage: "/api/images/hero/central-bank-of-nigeria",
      defaultPrimeRate: 12,
    },
    usdExchangeRate: 0.00064,
  },
  HU: {
    id: "HU",
    name: "Hungary",
    code: "HU",
    status: "coming-soon",
    flagEmoji: "🇭🇺",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
    executiveTitle: "General Secretary",
    executiveRealmPhrase: "Hungary",
    executiveLabel: "Parliament",
    executivePath: "/country/hu/executive",
    governmentType: "onePartyState",
    governmentTypeLabel: "One Party State",
    descriptor:
      "A one-party socialist state where the ruling party's General Secretary governs through a single-chamber National Assembly; the economy is centrally planned until reform.",
    heroImage: "https://flagcdn.com/w640/hu.png",
    overviewPath: "/country/hu",
    mapPath: "/country/hu/map",
    currencyCode: "HUF",
    centralGovernmentLabel: "Central Plan",
    exchangeName: "OT",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "hu_archetypes",
    rulingPartyId: 1,
    majorPartyIds: ["mszmp"],
    partyCreationNPPs: {
      statesRequired: 1,
      lockHomeState: true,
      nppsPerState: 2,
    },
    legislature: {
      name: "National Assembly",
      path: "/country/hu/legislature",
      bicameral: false,
      lowerChamber: {
        key: "nationalAssembly",
        name: "National Assembly",
        shortName: "Assembly",
        seats: 352,
        description:
          "352 deputies of the Országgyűlés, elected to five-year terms in the Hungarian People's Republic - in practice a single-list body controlled by the ruling socialist workers' party.",
      },
      upperChamber: {
        key: "presidentialCouncil",
        name: "Presidential Council",
        shortName: "Council",
        seats: 21,
        description:
          "The Elnöki Tanács - a 21-member collective head of state that exercised standing legislative authority between Assembly sessions; members chosen by the National Assembly.",
        elected: false,
      },
    },
    officeTypes: [
      {
        key: "generalSecretary",
        label: "General Secretary",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "General Secretaries",
      },
      {
        key: "chairmanOfPresidentialCouncil",
        label: "Chairman of the Presidential Council",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Chairmen of the Presidential Council",
      },
      {
        key: "assemblyDelegate",
        label: "Deputy",
        chamberKey: "nationalAssembly",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Deputies",
      },
      {
        key: "centralBankChair",
        label: "Governor of the MNB",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the MNB",
      },
    ],
    electionSystems: {
      lowerChamber: "fptp",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    centralBank: {
      name: "Hungarian National Bank",
      abbreviation: "MNB",
      heroImage: "https://flagcdn.com/w640/hu.png",
      defaultPrimeRate: 5,
    },
    usdExchangeRate: 0.031,
  },
  PL: {
    id: "PL",
    name: "Poland",
    code: "PL",
    status: "coming-soon",
    flagEmoji: "🇵🇱",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
    executiveTitle: "First Secretary",
    executiveRealmPhrase: "Poland",
    executiveLabel: "Council of Ministers",
    executivePath: "/country/pl/executive",
    governmentType: "onePartyState",
    governmentTypeLabel: "One Party State",
    descriptor:
      "A one-party socialist state where the ruling workers' party's First Secretary governs through the Sejm; the economy is centrally planned until reform.",
    heroImage: "https://flagcdn.com/w640/pl.png",
    overviewPath: "/country/pl",
    mapPath: "/country/pl/map",
    currencyCode: "PLZ",
    centralGovernmentLabel: "Central Plan",
    exchangeName: "PKPG",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "pl_archetypes",
    rulingPartyId: 1,
    majorPartyIds: ["pzpr"],
    partyCreationNPPs: {
      statesRequired: 1,
      lockHomeState: true,
      nppsPerState: 2,
    },
    legislature: {
      name: "Sejm",
      path: "/country/pl/legislature",
      bicameral: false,
      lowerChamber: {
        key: "sejm",
        name: "Sejm",
        shortName: "Sejm",
        seats: 460,
        description:
          "460 deputies of the Sejm, elected to four-year terms - a single-list body led by the ruling workers' party within the National Unity Front.",
      },
      upperChamber: {
        key: "councilOfState",
        name: "Council of State",
        shortName: "Council",
        seats: 17,
        description:
          "The Rada Państwa - a collective head of state exercising standing authority between Sejm sessions; chosen by the Sejm.",
        elected: false,
      },
    },
    officeTypes: [
      {
        key: "firstSecretary",
        label: "First Secretary",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "First Secretaries",
      },
      {
        key: "chairmanOfStateCouncil",
        label: "Chairman of the Council of State",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Chairmen of the Council of State",
      },
      {
        key: "sejmDeputy",
        label: "Deputy",
        chamberKey: "sejm",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Deputies",
      },
      {
        key: "centralBankChair",
        label: "President of the NBP",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Presidents of the NBP",
      },
    ],
    electionSystems: {
      lowerChamber: "fptp",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    centralBank: {
      name: "National Bank of Poland",
      abbreviation: "NBP",
      heroImage: "https://flagcdn.com/w640/pl.png",
      defaultPrimeRate: 5,
    },
    usdExchangeRate: 0.04,
  },
  RO: {
    id: "RO",
    name: "Romania",
    code: "RO",
    status: "coming-soon",
    flagEmoji: "🇷🇴",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
    executiveTitle: "General Secretary",
    executiveRealmPhrase: "Romania",
    executiveLabel: "Assembly",
    executivePath: "/country/ro/executive",
    governmentType: "onePartyState",
    governmentTypeLabel: "One Party State",
    descriptor:
      "A one-party socialist state where the ruling communist party's General Secretary governs through the Grand National Assembly; the economy is centrally planned until reform.",
    heroImage: "https://flagcdn.com/w640/ro.png",
    overviewPath: "/country/ro",
    mapPath: "/country/ro/map",
    currencyCode: "ROL",
    centralGovernmentLabel: "Central Plan",
    exchangeName: "CSP",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "ro_archetypes",
    rulingPartyId: 1,
    majorPartyIds: ["pcr"],
    partyCreationNPPs: {
      statesRequired: 1,
      lockHomeState: true,
      nppsPerState: 2,
    },
    legislature: {
      name: "Grand National Assembly",
      path: "/country/ro/legislature",
      bicameral: false,
      lowerChamber: {
        key: "grandNationalAssembly",
        name: "Grand National Assembly",
        shortName: "Assembly",
        seats: 369,
        description:
          "369 deputies of the Marea Adunare Națională, elected to five-year terms - a single-list body controlled by the ruling communist party.",
      },
      upperChamber: {
        key: "stateCouncil",
        name: "State Council",
        shortName: "Council",
        seats: 21,
        description:
          "A collective head of state exercising standing authority between Assembly sessions; chosen by the Grand National Assembly.",
        elected: false,
      },
    },
    officeTypes: [
      {
        key: "generalSecretary",
        label: "General Secretary",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "General Secretaries",
      },
      {
        key: "presidentOfStateCouncil",
        label: "President of the State Council",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Presidents of the State Council",
      },
      {
        key: "assemblyDeputy",
        label: "Deputy",
        chamberKey: "grandNationalAssembly",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Deputies",
      },
      {
        key: "centralBankChair",
        label: "Governor of the BNR",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the BNR",
      },
    ],
    electionSystems: {
      lowerChamber: "fptp",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    centralBank: {
      name: "National Bank of Romania",
      abbreviation: "BNR",
      heroImage: "https://flagcdn.com/w640/ro.png",
      defaultPrimeRate: 5,
    },
    usdExchangeRate: 0.22,
  },
  YU: {
    id: "YU",
    name: "Yugoslavia",
    code: "YU",
    status: "coming-soon",
    flagEmoji: "🇾🇺",
    regionLabel: "Republic",
    regionLabelPlural: "Republics",
    executiveTitle: "President",
    executiveRealmPhrase: "Yugoslavia",
    executiveLabel: "Assembly",
    executivePath: "/country/yu/executive",
    governmentType: "onePartyState",
    governmentTypeLabel: "One Party State",
    descriptor:
      "A non-aligned one-party federation governed by a collective presidency and the League of Communists under worker self-management; a market-socialist economy distinct from the Soviet bloc.",
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Flag_of_Yugoslavia_%281946-1992%29.svg/500px-Flag_of_Yugoslavia_%281946-1992%29.svg.png",
    overviewPath: "/country/yu",
    mapPath: "/country/yu/map",
    currencyCode: "YUD",
    centralGovernmentLabel: "Federal Plan",
    exchangeName: "SZP",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "yu_archetypes",
    rulingPartyId: 1,
    majorPartyIds: ["skj"],
    partyCreationNPPs: {
      statesRequired: 1,
      lockHomeState: true,
      nppsPerState: 2,
    },
    legislature: {
      name: "Federal Assembly",
      path: "/country/yu/legislature",
      bicameral: false,
      lowerChamber: {
        key: "federalAssembly",
        name: "Federal Assembly",
        shortName: "Assembly",
        seats: 308,
        description:
          "308 delegates of the Skupština, drawn from the republics and provinces under the self-management system led by the League of Communists.",
      },
      upperChamber: {
        key: "presidency",
        name: "Presidency",
        shortName: "Presidency",
        seats: 9,
        description:
          "The collective State Presidency - a rotating federal head of state representing the republics and provinces.",
        elected: false,
      },
    },
    officeTypes: [
      {
        key: "president",
        label: "President",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Presidents",
      },
      {
        key: "assemblyDelegate",
        label: "Delegate",
        chamberKey: "federalAssembly",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Delegates",
      },
      {
        key: "centralBankChair",
        label: "Governor of the NBY",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the NBY",
      },
    ],
    electionSystems: {
      lowerChamber: "fptp",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    centralBank: {
      name: "National Bank of Yugoslavia",
      abbreviation: "NBY",
      heroImage:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Flag_of_Yugoslavia_%281946-1992%29.svg/500px-Flag_of_Yugoslavia_%281946-1992%29.svg.png",
      defaultPrimeRate: 8,
    },
    usdExchangeRate: 0.055,
  },
  BG: {
    id: "BG",
    name: "Bulgaria",
    code: "BG",
    status: "coming-soon",
    flagEmoji: "🇧🇬",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
    executiveTitle: "General Secretary",
    executiveRealmPhrase: "Bulgaria",
    executiveLabel: "Assembly",
    executivePath: "/country/bg/executive",
    governmentType: "onePartyState",
    governmentTypeLabel: "One Party State",
    descriptor:
      "A one-party socialist state where the ruling communist party's General Secretary governs through the National Assembly; the economy is centrally planned until reform.",
    heroImage: "https://flagcdn.com/w640/bg.png",
    overviewPath: "/country/bg",
    mapPath: "/country/bg/map",
    currencyCode: "BGL",
    centralGovernmentLabel: "Central Plan",
    exchangeName: "DKP",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "bg_archetypes",
    rulingPartyId: 1,
    majorPartyIds: ["bkp"],
    partyCreationNPPs: {
      statesRequired: 1,
      lockHomeState: true,
      nppsPerState: 2,
    },
    legislature: {
      name: "National Assembly",
      path: "/country/bg/legislature",
      bicameral: false,
      lowerChamber: {
        key: "nationalAssembly",
        name: "National Assembly",
        shortName: "Assembly",
        seats: 400,
        description:
          "400 deputies of the Narodno Sabranie, elected to five-year terms - a single-list body controlled by the ruling communist party within the Fatherland Front.",
      },
      upperChamber: {
        key: "stateCouncil",
        name: "State Council",
        shortName: "Council",
        seats: 21,
        description:
          "A collective head of state exercising standing authority between Assembly sessions.",
        elected: false,
      },
    },
    officeTypes: [
      {
        key: "generalSecretary",
        label: "General Secretary",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "General Secretaries",
      },
      {
        key: "chairmanOfStateCouncil",
        label: "Chairman of the State Council",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Chairmen of the State Council",
      },
      {
        key: "assemblyDeputy",
        label: "Deputy",
        chamberKey: "nationalAssembly",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Deputies",
      },
      {
        key: "centralBankChair",
        label: "Governor of the BNB",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the BNB",
      },
    ],
    electionSystems: {
      lowerChamber: "fptp",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    centralBank: {
      name: "Bulgarian National Bank",
      abbreviation: "BNB",
      heroImage: "https://flagcdn.com/w640/bg.png",
      defaultPrimeRate: 5,
    },
    usdExchangeRate: 1,
  },
  BLR: {
    id: "BLR",
    name: "Belarus",
    code: "BLR",
    status: "coming-soon",
    flagEmoji: "🇧🇾",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
    executiveTitle: "First Secretary",
    executiveRealmPhrase: "Belarus",
    executiveLabel: "Soviet",
    executivePath: "/country/blr/executive",
    governmentType: "onePartyState",
    governmentTypeLabel: "One Party State",
    descriptor:
      "A one-party Soviet republic governed by the Communist Party through its Supreme Soviet; a centrally-planned economy on the Soviet ruble.",
    heroImage: "https://flagcdn.com/w640/by.png",
    overviewPath: "/country/blr",
    mapPath: "/country/blr/map",
    currencyCode: "SUR",
    centralGovernmentLabel: "Central Plan",
    exchangeName: "GOSPLAN BSSR",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "by_archetypes",
    rulingPartyId: 1,
    majorPartyIds: ["cpb"],
    partyCreationNPPs: {
      statesRequired: 1,
      lockHomeState: true,
      nppsPerState: 2,
    },
    legislature: {
      name: "Supreme Soviet",
      path: "/country/blr/legislature",
      bicameral: false,
      lowerChamber: {
        key: "supremeSoviet",
        name: "Supreme Soviet",
        shortName: "Soviet",
        seats: 360,
        description:
          "Deputies of the Byelorussian SSR Supreme Soviet, elected to single-list terms under the Communist Party.",
      },
      upperChamber: {
        key: "presidium",
        name: "Presidium",
        shortName: "Presidium",
        seats: 21,
        description:
          "The Presidium of the Supreme Soviet - a standing organ acting between sessions.",
        elected: false,
      },
    },
    officeTypes: [
      {
        key: "firstSecretary",
        label: "First Secretary",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "First Secretaries",
      },
      {
        key: "chairmanOfPresidium",
        label: "Chairman of the Presidium",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Chairmen of the Presidium",
      },
      {
        key: "sovietDeputy",
        label: "Deputy",
        chamberKey: "supremeSoviet",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Deputies",
      },
      {
        key: "centralBankChair",
        label: "Gosbank Chair",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Gosbank Chairs",
      },
    ],
    electionSystems: {
      lowerChamber: "fptp",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    centralBank: {
      name: "State Bank (Gosbank)",
      abbreviation: "Gosbank",
      heroImage: "https://flagcdn.com/w640/by.png",
      defaultPrimeRate: 3,
    },
    usdExchangeRate: 1.35,
  },
  CS: {
    id: "CS",
    name: "Czechoslovakia",
    code: "CS",
    status: "coming-soon",
    flagEmoji: "🇨🇿",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
    executiveTitle: "General Secretary",
    executiveRealmPhrase: "Czechoslovakia",
    executiveLabel: "Assembly",
    executivePath: "/country/cs/executive",
    governmentType: "onePartyState",
    governmentTypeLabel: "One Party State",
    descriptor:
      "A one-party socialist federation where the ruling communist party's General Secretary governs through the bicameral Federal Assembly; the economy is centrally planned until reform.",
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Flag_of_the_Czech_Republic.svg/500px-Flag_of_the_Czech_Republic.svg.png",
    overviewPath: "/country/cs",
    mapPath: "/country/cs/map",
    currencyCode: "CSK",
    centralGovernmentLabel: "Central Plan",
    exchangeName: "SPK",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "cs_archetypes",
    rulingPartyId: 1,
    majorPartyIds: ["ksc"],
    partyCreationNPPs: {
      statesRequired: 1,
      lockHomeState: true,
      nppsPerState: 2,
    },
    legislature: {
      name: "Federal Assembly",
      path: "/country/cs/legislature",
      bicameral: false,
      lowerChamber: {
        key: "chamberOfThePeople",
        name: "Chamber of the People",
        shortName: "People",
        seats: 200,
        description:
          "200 deputies of the Chamber of the People, elected to five-year terms - a single-list body controlled by the ruling communist party within the National Front.",
      },
      upperChamber: {
        key: "chamberOfNations",
        name: "Chamber of Nations",
        shortName: "Nations",
        seats: 150,
        description:
          "The Chamber of Nations - the federal chamber representing the Czech and Slovak republics.",
        elected: true,
      },
    },
    officeTypes: [
      {
        key: "generalSecretary",
        label: "General Secretary",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "General Secretaries",
      },
      {
        key: "president",
        label: "President",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Presidents",
      },
      {
        key: "assemblyDeputy",
        label: "Deputy",
        chamberKey: "chamberOfThePeople",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Deputies",
      },
      {
        key: "centralBankChair",
        label: "Governor of the SBČS",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the SBČS",
      },
    ],
    electionSystems: {
      lowerChamber: "fptp",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    centralBank: {
      name: "State Bank of Czechoslovakia",
      abbreviation: "SBČS",
      heroImage:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Flag_of_the_Czech_Republic.svg/500px-Flag_of_the_Czech_Republic.svg.png",
      defaultPrimeRate: 4,
    },
    usdExchangeRate: 0.13,
  },
  UKR: {
    id: "UKR",
    name: "Ukraine",
    code: "UKR",
    status: "coming-soon",
    flagEmoji: "🇺🇦",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
    executiveTitle: "First Secretary",
    executiveRealmPhrase: "Ukraine",
    executiveLabel: "Soviet",
    executivePath: "/country/ua/executive",
    governmentType: "onePartyState",
    governmentTypeLabel: "One Party State",
    descriptor:
      "A one-party Soviet republic governed by the Communist Party of Ukraine through its Supreme Soviet; the Union's second economy, built on Donbas coal, Dnieper metallurgy and the grain of the steppe.",
    heroImage: "https://flagcdn.com/w640/ukr.png",
    overviewPath: "/country/ua",
    mapPath: "/country/ua/map",
    currencyCode: "SUR",
    centralGovernmentLabel: "Central Plan",
    exchangeName: "GOSPLAN URSR",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "ua_archetypes",
    rulingPartyId: 1,
    majorPartyIds: ["kpu"],
    partyCreationNPPs: {
      statesRequired: 1,
      lockHomeState: true,
      nppsPerState: 2,
    },
    legislature: {
      name: "Supreme Soviet",
      path: "/country/ua/legislature",
      bicameral: false,
      lowerChamber: {
        key: "supremeSoviet",
        name: "Supreme Soviet",
        shortName: "Soviet",
        seats: 435,
        description:
          "Deputies of the Ukrainian SSR Supreme Soviet, elected to single-list terms under the Communist Party.",
      },
      upperChamber: {
        key: "presidium",
        name: "Presidium",
        shortName: "Presidium",
        seats: 21,
        description:
          "The Presidium of the Supreme Soviet - a standing organ acting between sessions.",
        elected: false,
      },
    },
    officeTypes: [
      {
        key: "firstSecretary",
        label: "First Secretary",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "First Secretaries",
      },
      {
        key: "chairmanOfPresidium",
        label: "Chairman of the Presidium",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Chairmen of the Presidium",
      },
      {
        key: "sovietDeputy",
        label: "Deputy",
        chamberKey: "supremeSoviet",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Deputies",
      },
      {
        key: "centralBankChair",
        label: "Gosbank Chair",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Gosbank Chairs",
      },
    ],
    electionSystems: {
      lowerChamber: "fptp",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    centralBank: {
      name: "State Bank (Gosbank)",
      abbreviation: "Gosbank",
      heroImage: "https://flagcdn.com/w640/ukr.png",
      defaultPrimeRate: 3,
    },
    usdExchangeRate: 1.35,
  },
  BAL: {
    id: "BAL",
    name: "Baltic Republics",
    code: "BAL",
    status: "coming-soon",
    flagEmoji: "🏴",
    regionLabel: "Republic",
    regionLabelPlural: "Republics",
    executiveTitle: "First Secretary",
    executiveRealmPhrase: "the Baltic Republics",
    executiveLabel: "Soviet",
    executivePath: "/country/bal/executive",
    governmentType: "onePartyState",
    governmentTypeLabel: "One Party State",
    descriptor:
      "The three Baltic Soviet republics, modelled as one playable unit governed by the Communist Party through their Supreme Soviets; a centrally-planned economy on the Soviet ruble.",
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Flag_of_the_Soviet_Union.svg/500px-Flag_of_the_Soviet_Union.svg.png",
    overviewPath: "/country/bal",
    mapPath: "/country/bal/map",
    currencyCode: "SUR",
    centralGovernmentLabel: "Central Plan",
    exchangeName: "GOSPLAN SSR",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "bal_archetypes",
    majorPartyIds: ["cpsu_baltic"],
    partyCreationNPPs: {
      statesRequired: 1,
      lockHomeState: true,
      nppsPerState: 2,
    },
    legislature: {
      name: "Supreme Soviet",
      path: "/country/bal/legislature",
      bicameral: false,
      lowerChamber: {
        key: "supremeSoviet",
        name: "Supreme Soviet",
        shortName: "Soviet",
        seats: 300,
        description:
          "Combined deputies of the Estonian, Latvian and Lithuanian SSR Supreme Soviets, elected to single-list terms under the Communist Party.",
      },
      upperChamber: {
        key: "presidium",
        name: "Presidium",
        shortName: "Presidium",
        seats: 21,
        description:
          "The Presidium of the Supreme Soviet - a standing organ acting between sessions.",
        elected: false,
      },
    },
    officeTypes: [
      {
        key: "firstSecretary",
        label: "First Secretary",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "First Secretaries",
      },
      {
        key: "chairmanOfPresidium",
        label: "Chairman of the Presidium",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Chairmen of the Presidium",
      },
      {
        key: "sovietDeputy",
        label: "Deputy",
        chamberKey: "supremeSoviet",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Deputies",
      },
      {
        key: "centralBankChair",
        label: "Gosbank Chair",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Gosbank Chairs",
      },
    ],
    electionSystems: {
      lowerChamber: "fptp",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    centralBank: {
      name: "State Bank (Gosbank)",
      abbreviation: "Gosbank",
      heroImage:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Flag_of_the_Soviet_Union.svg/500px-Flag_of_the_Soviet_Union.svg.png",
      defaultPrimeRate: 3,
    },
    usdExchangeRate: 1.35,
  },
  RU: {
    id: "RU",
    name: "Russia",
    code: "RU",
    status: "coming-soon",
    flagEmoji: "🇸🇺",
    regionLabel: "Republic",
    regionLabelPlural: "Republics",
    executiveTitle: "Premier",
    executiveRealmPhrase: "the Soviet Union",
    executiveLabel: "Council of Ministers",
    executivePath: "/country/ru/executive",
    governmentType: "onePartyState",
    governmentTypeLabel: "One Party State",
    descriptor:
      "A one-party socialist federation where the Communist Party's General Secretary holds real power, the Premier leads the Council of Ministers, and the Supreme Soviet ratifies across fifteen union republics under a centrally-planned command economy.",
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Flag_of_the_Soviet_Union.svg/500px-Flag_of_the_Soviet_Union.svg.png",
    overviewPath: "/country/ru",
    mapPath: "/country/ru/map",
    currencyCode: "SUR",
    centralGovernmentLabel: "Central Plan",
    exchangeName: "GOSPLAN",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "su_archetypes",
    rulingPartyId: 1,
    hasLeaderConfidenceModel: true,
    majorPartyIds: ["cpsu"],
    partyCreationNPPs: {
      statesRequired: 2,
      lockHomeState: false,
      nppsPerState: 1,
    },
    partyRoleLabels: {
      chair: "General Secretary",
      viceChair: "Second Secretary",
      committee: "Politburo",
    },
    legislature: {
      name: "Supreme Soviet",
      path: "/country/ru/legislature",
      bicameral: true,
      lowerChamber: {
        key: "sovietOfTheUnion",
        name: "Soviet of the Union",
        shortName: "Union",
        seats: 559,
        description:
          "559 deputies elected by population to the Supreme Soviet of the USSR; four-year terms, single-list elections under the Communist Party.",
      },
      upperChamber: {
        key: "sovietOfNationalities",
        name: "Soviet of Nationalities",
        shortName: "Nationalities",
        seats: 515,
        description:
          "Deputies representing the union republics and autonomous republics of the Soviet Union - the nationalities chamber of the Supreme Soviet, seated by republic rather than by population.",
        elected: true,
      },
    },
    subNationalChamber: {
      key: "republicSupremeSoviet",
      name: "Republic Supreme Soviet",
      shortName: "Republic Soviet",
      regionalModel: true,
    },
    officeTypes: [
      {
        key: "premier",
        label: "Premier",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Premiers",
      },
      {
        key: "chairmanOfPresidium",
        label: "Chairman of the Presidium",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Chairmen of the Presidium",
      },
      {
        key: "supremeSovietDeputy",
        label: "Supreme Soviet Deputy",
        chamberKey: "sovietOfTheUnion",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Supreme Soviet Deputies",
      },
      {
        key: "nationalitiesDeputy",
        label: "Nationalities Deputy",
        chamberKey: "sovietOfNationalities",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Nationalities Deputies",
      },
      {
        key: "republicSupremeSoviet",
        label: "Republic Deputy",
        chamberKey: "republicSupremeSoviet",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Republic Deputies",
      },
      {
        key: "governor",
        label: "Republic First Secretary",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Republic First Secretaries",
      },
      {
        key: "centralBankChair",
        label: "Chairman of Gosbank",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Chairmen of Gosbank",
      },
    ],
    electionSystems: {
      lowerChamber: "fptp",
      subNationalChamber: "fptp",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    upperElectionSystem: {
      snapElectionsAllowed: false,
    },
    centralBank: {
      name: "State Bank of the USSR",
      abbreviation: "Gosbank",
      heroImage:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Flag_of_the_Soviet_Union.svg/500px-Flag_of_the_Soviet_Union.svg.png",
      defaultPrimeRate: 3,
    },
    usdExchangeRate: 1.35,
  },
  FR: {
    id: "FR",
    name: "France",
    code: "FR",
    status: "coming-soon",
    flagEmoji: "🇫🇷",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
    executiveTitle: "President",
    executiveRealmPhrase: "France",
    executiveLabel: "Élysée",
    executivePath: "/country/fr/executive",
    governmentType: "presidential",
    governmentTypeLabel: "Semi-Presidential Republic",
    descriptor:
      "A semi-presidential republic: a directly-elected President leads alongside a Prime Minister answerable to the 491-seat National Assembly, with an indirectly-elected Senate.",
    heroImage: "https://flagcdn.com/w640/fr.png",
    overviewPath: "/country/fr",
    mapPath: "/country/fr/map",
    currencyCode: "FRF",
    centralGovernmentLabel: "State Budget",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "fr_archetypes",
    majorPartyIds: ["fr_rpr", "fr_ps"],
    partyCreationNPPs: {
      statesRequired: 2,
      lockHomeState: false,
      nppsPerState: 1,
    },
    legislature: {
      name: "Parliament",
      path: "/country/fr/legislature",
      bicameral: true,
      lowerChamber: {
        key: "assembleeNationale",
        name: "National Assembly",
        shortName: "Assemblée",
        seats: 491,
        description:
          "491 deputies elected from single-member constituencies by two-round majority vote for five-year terms.",
      },
      upperChamber: {
        key: "senat",
        name: "Senate",
        shortName: "Sénat",
        seats: 305,
        description:
          "305 senators elected indirectly by an electoral college of local officials for nine-year terms.",
        elected: true,
      },
    },
    officeTypes: [
      {
        key: "president",
        label: "President",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Presidents",
      },
      {
        key: "primeMinister",
        label: "Prime Minister",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Prime Ministers",
      },
      {
        key: "deputy",
        label: "Deputy",
        chamberKey: "assembleeNationale",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Deputies",
      },
      {
        key: "senator",
        label: "Senator",
        chamberKey: "senat",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Senators",
      },
      {
        key: "centralBankChair",
        label: "Governor of the Banque de France",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the Banque de France",
      },
    ],
    electionSystems: {
      lowerChamber: "pr_hareQuota",
      upperChamber: "pr_hareQuota",
      headOfState: "fptp",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
    upperElectionSystem: {
      snapElectionsAllowed: false,
    },
    centralBank: {
      name: "Banque de France",
      abbreviation: "BdF",
      heroImage: "https://flagcdn.com/w640/fr.png",
      defaultPrimeRate: 9.5,
    },
    usdExchangeRate: 0.238,
  },
  IT: {
    id: "IT",
    name: "Italy",
    code: "IT",
    status: "coming-soon",
    flagEmoji: "🇮🇹",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
    executiveTitle: "Prime Minister",
    executiveRealmPhrase: "Italy",
    executiveLabel: "Palazzo Chigi",
    executivePath: "/country/it/executive",
    governmentType: "parliamentaryRepublic",
    governmentTypeLabel: "Parliamentary Republic",
    descriptor:
      "A parliamentary republic where a Prime Minister governs at the confidence of a 630-seat Chamber and a 315-seat Senate, amid the unstable DC-led coalitions of the historic-compromise era.",
    heroImage: "https://flagcdn.com/w640/it.png",
    overviewPath: "/country/it",
    mapPath: "/country/it/map",
    currencyCode: "ITL",
    centralGovernmentLabel: "State Budget",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "it_archetypes",
    majorPartyIds: ["it_dc", "it_pci"],
    partyCreationNPPs: {
      statesRequired: 2,
      lockHomeState: false,
      nppsPerState: 1,
    },
    legislature: {
      name: "Parliament",
      path: "/country/it/legislature",
      bicameral: true,
      lowerChamber: {
        key: "cameraDeputati",
        name: "Chamber of Deputies",
        shortName: "Camera",
        seats: 630,
        description: "630 deputies elected by proportional representation for five-year terms.",
      },
      upperChamber: {
        key: "senato",
        name: "Senate of the Republic",
        shortName: "Senato",
        seats: 315,
        description:
          "315 elected senators (plus a few senators-for-life), elected on a regional basis for five-year terms.",
        elected: true,
      },
    },
    officeTypes: [
      {
        key: "primeMinister",
        label: "Prime Minister",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Prime Ministers",
      },
      {
        key: "president",
        label: "President",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Presidents",
      },
      {
        key: "deputy",
        label: "Deputy",
        chamberKey: "cameraDeputati",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Deputies",
      },
      {
        key: "senator",
        label: "Senator",
        chamberKey: "senato",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Senators",
      },
      {
        key: "centralBankChair",
        label: "Governor of the Banca d'Italia",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the Banca d'Italia",
      },
    ],
    electionSystems: {
      lowerChamber: "pr_hareQuota",
      upperChamber: "pr_hareQuota",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
    upperElectionSystem: {
      snapElectionsAllowed: true,
    },
    centralBank: {
      name: "Banca d'Italia",
      abbreviation: "BdI",
      heroImage: "https://flagcdn.com/w640/it.png",
      defaultPrimeRate: 12,
    },
    usdExchangeRate: 0.0012,
  },
  ES: {
    id: "ES",
    name: "Spain",
    code: "ES",
    status: "coming-soon",
    flagEmoji: "🇪🇸",
    regionLabel: "Autonomous Community",
    regionLabelPlural: "Autonomous Communities",
    executiveTitle: "Prime Minister",
    executiveRealmPhrase: "Spain",
    executiveLabel: "Moncloa",
    executivePath: "/country/es/executive",
    governmentType: "parliamentaryMonarchy",
    governmentTypeLabel: "Parliamentary Monarchy",
    descriptor:
      "A parliamentary monarchy under the 1978 Constitution: a Prime Minister governs at the confidence of a 350-seat Congress and a 208-seat Senate, as Spain devolves power to its new autonomous communities.",
    heroImage: "https://flagcdn.com/w640/es.png",
    overviewPath: "/country/es",
    mapPath: "/country/es/map",
    currencyCode: "ESP",
    centralGovernmentLabel: "State Budget",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "es_archetypes",
    majorPartyIds: ["es_ucd", "es_psoe"],
    partyCreationNPPs: {
      statesRequired: 2,
      lockHomeState: false,
      nppsPerState: 1,
    },
    legislature: {
      name: "Cortes Generales",
      path: "/country/es/legislature",
      bicameral: true,
      lowerChamber: {
        key: "congresoDiputados",
        name: "Congress of Deputies",
        shortName: "Congreso",
        seats: 350,
        description:
          "350 deputies elected by proportional representation (D'Hondt) in provincial constituencies for four-year terms.",
      },
      upperChamber: {
        key: "senado",
        name: "Senate",
        shortName: "Senado",
        seats: 208,
        description:
          "208 senators elected on a provincial basis (plus regional appointees) for four-year terms.",
        elected: true,
      },
    },
    officeTypes: [
      {
        key: "primeMinister",
        label: "Prime Minister",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Prime Ministers",
      },
      {
        key: "monarch",
        label: "King",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Kings",
      },
      {
        key: "deputy",
        label: "Deputy",
        chamberKey: "congresoDiputados",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Deputies",
      },
      {
        key: "senator",
        label: "Senator",
        chamberKey: "senado",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Senators",
      },
      {
        key: "centralBankChair",
        label: "Governor of the Banco de España",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the Banco de España",
      },
    ],
    electionSystems: {
      lowerChamber: "pr_hareQuota",
      upperChamber: "pr_hareQuota",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
    upperElectionSystem: {
      snapElectionsAllowed: true,
    },
    centralBank: {
      name: "Banco de España",
      abbreviation: "BdE",
      heroImage: "https://flagcdn.com/w640/es.png",
      defaultPrimeRate: 14,
    },
    usdExchangeRate: 0.0149,
  },
  SE: {
    id: "SE",
    name: "Sweden",
    code: "SE",
    status: "coming-soon",
    flagEmoji: "🇸🇪",
    regionLabel: "County",
    regionLabelPlural: "Counties",
    executiveTitle: "Prime Minister",
    executiveRealmPhrase: "Sweden",
    executiveLabel: "Rosenbad",
    executivePath: "/country/se/executive",
    governmentType: "parliamentaryMonarchy",
    governmentTypeLabel: "Constitutional Monarchy",
    descriptor:
      "A constitutional monarchy with a unicameral 349-seat Riksdag elected by proportional representation, home to the world's most developed social-democratic welfare state.",
    heroImage: "https://flagcdn.com/w640/se.png",
    overviewPath: "/country/se",
    mapPath: "/country/se/map",
    currencyCode: "SEK",
    centralGovernmentLabel: "State Budget",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "se_archetypes",
    majorPartyIds: ["se_sap", "se_m"],
    partyCreationNPPs: {
      statesRequired: 2,
      lockHomeState: false,
      nppsPerState: 1,
    },
    legislature: {
      name: "Riksdag",
      path: "/country/se/legislature",
      bicameral: false,
      lowerChamber: {
        key: "riksdag",
        name: "Riksdag",
        shortName: "Riksdag",
        seats: 349,
        description:
          "349 members elected by proportional representation (with a 4% threshold) for fixed terms.",
      },
      upperChamber: {
        key: "forstaKammaren",
        name: "First Chamber (abolished 1970)",
        shortName: "First Chamber",
        seats: 151,
        description:
          "The former indirectly-elected upper house, abolished in the 1970 unicameral reform. Not part of the legislative loop.",
      },
    },
    officeTypes: [
      {
        key: "primeMinister",
        label: "Prime Minister",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Prime Ministers",
      },
      {
        key: "monarch",
        label: "King",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Kings",
      },
      {
        key: "member",
        label: "Member of the Riksdag",
        chamberKey: "riksdag",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Members of the Riksdag",
      },
      {
        key: "centralBankChair",
        label: "Governor of the Riksbank",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the Riksbank",
      },
    ],
    electionSystems: {
      lowerChamber: "pr_hareQuota",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    centralBank: {
      name: "Sveriges Riksbank",
      abbreviation: "Riksbank",
      heroImage: "https://flagcdn.com/w640/se.png",
      defaultPrimeRate: 9,
    },
    usdExchangeRate: 0.233,
  },
  TR: {
    id: "TR",
    name: "Turkey",
    code: "TR",
    status: "coming-soon",
    flagEmoji: "🇹🇷",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
    executiveTitle: "Prime Minister",
    executiveRealmPhrase: "Turkey",
    executiveLabel: "Çankaya",
    executivePath: "/country/tr/executive",
    governmentType: "parliamentaryRepublic",
    governmentTypeLabel: "Parliamentary Republic",
    descriptor:
      "A parliamentary republic where a Prime Minister governs at the confidence of a 450-seat National Assembly and a 184-seat Senate, amid the unstable AP/CHP coalitions of the late 1970s.",
    heroImage: "https://flagcdn.com/w640/tr.png",
    overviewPath: "/country/tr",
    mapPath: "/country/tr/map",
    currencyCode: "TRL",
    centralGovernmentLabel: "State Budget",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "tr_archetypes",
    majorPartyIds: ["tr_ap", "tr_chp"],
    partyCreationNPPs: {
      statesRequired: 2,
      lockHomeState: false,
      nppsPerState: 1,
    },
    legislature: {
      name: "Grand National Assembly",
      path: "/country/tr/legislature",
      bicameral: true,
      lowerChamber: {
        key: "milletMeclisi",
        name: "National Assembly",
        shortName: "Meclis",
        seats: 450,
        description:
          "450 deputies elected by proportional representation (D'Hondt) for four-year terms.",
      },
      upperChamber: {
        key: "senato",
        name: "Senate of the Republic",
        shortName: "Senato",
        seats: 184,
        description:
          "184 senators (the Cumhuriyet Senatosu, abolished after the 1980 coup), partly elected and partly appointed.",
        elected: true,
      },
    },
    officeTypes: [
      {
        key: "primeMinister",
        label: "Prime Minister",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Prime Ministers",
      },
      {
        key: "president",
        label: "President",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Presidents",
      },
      {
        key: "deputy",
        label: "Deputy",
        chamberKey: "milletMeclisi",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Deputies",
      },
      {
        key: "senator",
        label: "Senator",
        chamberKey: "senato",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Senators",
      },
      {
        key: "centralBankChair",
        label: "Governor of the Central Bank of Turkey",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the Central Bank of Turkey",
      },
    ],
    electionSystems: {
      lowerChamber: "pr_hareQuota",
      upperChamber: "pr_hareQuota",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
    upperElectionSystem: {
      snapElectionsAllowed: false,
    },
    centralBank: {
      name: "Central Bank of the Republic of Turkey",
      abbreviation: "TCMB",
      heroImage: "https://flagcdn.com/w640/tr.png",
      defaultPrimeRate: 20,
    },
    usdExchangeRate: 0.029,
  },
  GR: {
    id: "GR",
    name: "Greece",
    code: "GR",
    status: "coming-soon",
    flagEmoji: "🇬🇷",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
    executiveTitle: "Prime Minister",
    executiveRealmPhrase: "Greece",
    executiveLabel: "Maximos Mansion",
    executivePath: "/country/gr/executive",
    governmentType: "parliamentaryRepublic",
    governmentTypeLabel: "Parliamentary Republic",
    descriptor:
      "A parliamentary republic where a Prime Minister governs at the confidence of the unicameral 300-seat Vouli, elected by reinforced proportional representation.",
    heroImage: "https://flagcdn.com/w640/gr.png",
    overviewPath: "/country/gr",
    mapPath: "/country/gr/map",
    currencyCode: "GRD",
    centralGovernmentLabel: "State Budget",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "gr_archetypes",
    majorPartyIds: ["gr_nd", "gr_pasok"],
    partyCreationNPPs: {
      statesRequired: 2,
      lockHomeState: false,
      nppsPerState: 1,
    },
    legislature: {
      name: "Hellenic Parliament",
      path: "/country/gr/legislature",
      bicameral: false,
      lowerChamber: {
        key: "vouli",
        name: "Hellenic Parliament",
        shortName: "Vouli",
        seats: 300,
        description:
          "300 deputies of the unicameral Vouli ton Ellinon, elected by reinforced proportional representation for four-year terms.",
      },
    },
    officeTypes: [
      {
        key: "primeMinister",
        label: "Prime Minister",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Prime Ministers",
      },
      {
        key: "president",
        label: "President",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Presidents",
      },
      {
        key: "deputy",
        label: "Deputy",
        chamberKey: "vouli",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Deputies",
      },
      {
        key: "centralBankChair",
        label: "Governor of the Bank of Greece",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the Bank of Greece",
      },
    ],
    electionSystems: {
      lowerChamber: "pr_hareQuota",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
    centralBank: {
      name: "Bank of Greece",
      abbreviation: "BoG",
      heroImage: "https://flagcdn.com/w640/gr.png",
      defaultPrimeRate: 16.5,
    },
    usdExchangeRate: 0.027,
  },
  AT: {
    id: "AT",
    name: "Austria",
    code: "AT",
    status: "coming-soon",
    flagEmoji: "🇦🇹",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
    executiveTitle: "Chancellor",
    executiveRealmPhrase: "Austria",
    executiveLabel: "Ballhausplatz",
    executivePath: "/country/at/executive",
    governmentType: "parliamentaryRepublic",
    governmentTypeLabel: "Parliamentary Republic",
    descriptor:
      "A parliamentary republic where a Chancellor governs at the confidence of the unicameral 183-seat Nationalrat; constitutionally neutral since 1955 and outside both alliances.",
    heroImage: "https://flagcdn.com/w640/at.png",
    overviewPath: "/country/at",
    mapPath: "/country/at/map",
    currencyCode: "ATS",
    centralGovernmentLabel: "Federal Budget",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "at_archetypes",
    majorPartyIds: ["at_spo", "at_ovp"],
    partyCreationNPPs: {
      statesRequired: 2,
      lockHomeState: false,
      nppsPerState: 1,
    },
    legislature: {
      name: "Nationalrat",
      path: "/country/at/legislature",
      bicameral: false,
      lowerChamber: {
        key: "nationalrat",
        name: "Nationalrat",
        shortName: "Nationalrat",
        seats: 183,
        description: "183 deputies elected by proportional representation for four-year terms.",
      },
      upperChamber: {
        key: "bundesrat",
        name: "Bundesrat",
        shortName: "Bundesrat",
        seats: 61,
        description:
          "61 members delegated by the nine Landtage in proportion to Land population; a suspensive-veto chamber outside the confidence loop.",
      },
    },
    officeTypes: [
      {
        key: "primeMinister",
        label: "Chancellor",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Chancellors",
      },
      {
        key: "president",
        label: "President",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Presidents",
      },
      {
        key: "deputy",
        label: "Deputy",
        chamberKey: "nationalrat",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Deputies",
      },
      {
        key: "centralBankChair",
        label: "Governor of the Oesterreichische Nationalbank",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the Oesterreichische Nationalbank",
      },
    ],
    electionSystems: {
      lowerChamber: "pr_hareQuota",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
    centralBank: {
      name: "Oesterreichische Nationalbank",
      abbreviation: "OeNB",
      heroImage: "https://flagcdn.com/w640/at.png",
      defaultPrimeRate: 5.5,
    },
    usdExchangeRate: 0.075,
  },
  FI: {
    id: "FI",
    name: "Finland",
    code: "FI",
    status: "coming-soon",
    flagEmoji: "🇫🇮",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
    executiveTitle: "Prime Minister",
    executiveRealmPhrase: "Finland",
    executiveLabel: "Government Palace",
    executivePath: "/country/fi/executive",
    governmentType: "parliamentaryRepublic",
    governmentTypeLabel: "Parliamentary Republic",
    descriptor:
      "A parliamentary republic where a Prime Minister governs at the confidence of the unicameral 200-seat Eduskunta, under a strong presidency that steers foreign policy between East and West.",
    heroImage: "https://flagcdn.com/w640/fi.png",
    overviewPath: "/country/fi",
    mapPath: "/country/fi/map",
    currencyCode: "FIM",
    centralGovernmentLabel: "State Budget",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "fi_archetypes",
    majorPartyIds: ["fi_sdp", "fi_kesk"],
    partyCreationNPPs: {
      statesRequired: 2,
      lockHomeState: false,
      nppsPerState: 1,
    },
    legislature: {
      name: "Eduskunta",
      path: "/country/fi/legislature",
      bicameral: false,
      lowerChamber: {
        key: "eduskunta",
        name: "Eduskunta",
        shortName: "Eduskunta",
        seats: 200,
        description:
          "200 members elected by open-list proportional representation for four-year terms — the unicameral parliament Finland has kept since 1906.",
      },
    },
    officeTypes: [
      {
        key: "primeMinister",
        label: "Prime Minister",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "Prime Ministers",
      },
      {
        key: "president",
        label: "President",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Presidents",
      },
      {
        key: "deputy",
        label: "Member of Parliament",
        chamberKey: "eduskunta",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Members of Parliament",
      },
      {
        key: "centralBankChair",
        label: "Governor of the Bank of Finland",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Governors of the Bank of Finland",
      },
    ],
    electionSystems: {
      lowerChamber: "pr_hareQuota",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
    centralBank: {
      name: "Bank of Finland",
      abbreviation: "BoF",
      heroImage: "https://flagcdn.com/w640/fi.png",
      defaultPrimeRate: 8.5,
    },
    usdExchangeRate: 0.256,
  },
  DD: {
    id: "DD",
    name: "East Germany",
    code: "DD",
    status: "coming-soon",
    flagEmoji: "🇩🇩",
    regionLabel: "Region",
    regionLabelPlural: "Regions",
    executiveTitle: "General Secretary",
    executiveRealmPhrase: "the German Democratic Republic",
    executiveLabel: "Council of Ministers",
    executivePath: "/country/dd/executive",
    governmentType: "onePartyState",
    governmentTypeLabel: "One Party State",
    descriptor:
      "A one-party socialist republic where the SED General Secretary governs through the National Front and the Volkskammer; the economy is centrally planned until reform or reunification.",
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Flag_of_East_Germany.svg/500px-Flag_of_East_Germany.svg.png",
    overviewPath: "/country/dd",
    mapPath: "/country/dd/map",
    currencyCode: "DDM",
    centralGovernmentLabel: "Central Plan",
    exchangeName: "VVB",
    financeMinisterCabinetId: "minister_of_finance",
    demographicProfileId: "dd_archetypes",
    rulingPartyId: 1,
    hasLeaderConfidenceModel: true,
    majorPartyIds: ["sed"],
    partyCreationNPPs: {
      statesRequired: 1,
      lockHomeState: true,
      nppsPerState: 2,
    },
    partyRoleLabels: {
      chair: "General Secretary",
      viceChair: "Second Secretary",
      committee: "Politburo",
    },
    legislature: {
      name: "Volkskammer",
      path: "/country/dd/legislature",
      bicameral: false,
      lowerChamber: {
        key: "volkskammer",
        name: "People's Chamber",
        shortName: "Volkskammer",
        seats: 500,
        description:
          "500 deputies of the Volkskammer elected on the single National Front list, led by the ruling SED.",
      },
      upperChamber: {
        key: "staatsrat",
        name: "Council of State",
        shortName: "Staatsrat",
        seats: 25,
        description:
          "The Staatsrat - a collective head of state exercising standing authority between Volkskammer sessions.",
        elected: false,
      },
    },
    subNationalChamber: {
      key: "landAssembly",
      name: "Landtag",
      shortName: "Landtag",
      regionalModel: true,
    },
    officeTypes: [
      {
        key: "generalSecretary",
        label: "General Secretary",
        isExecutive: true,
        isSubNational: false,
        labelPlural: "General Secretaries",
      },
      {
        key: "chairmanOfStateCouncil",
        label: "Chairman of the Council of State",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
        labelPlural: "Chairmen of the Council of State",
      },
      {
        key: "volkskammerDeputy",
        label: "Deputy",
        chamberKey: "volkskammer",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Deputies",
      },
      {
        key: "landAssembly",
        label: "Landtag Deputy",
        chamberKey: "landAssembly",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Landtag Deputies",
      },
      {
        key: "governor",
        label: "Land First Secretary",
        isExecutive: false,
        isSubNational: true,
        labelPlural: "Land First Secretaries",
      },
      {
        key: "centralBankChair",
        label: "President of the Staatsbank",
        isExecutive: false,
        isSubNational: false,
        labelPlural: "Presidents of the Staatsbank",
      },
    ],
    electionSystems: {
      lowerChamber: "fptp",
      subNationalChamber: "pr_hareQuota",
      subNationalExecutive: "fptp",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    centralBank: {
      name: "Staatsbank der DDR",
      abbreviation: "SBD",
      heroImage:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Flag_of_East_Germany.svg/500px-Flag_of_East_Germany.svg.png",
      defaultPrimeRate: 5,
    },
    usdExchangeRate: 0.45,
  },
};

/**
 * Per-era institutional overlays, projected the same way.
 * Mirrors `ERA_COUNTRY_CONFIG_OVERRIDES`; applied by
 * {@link getCountryClientConfig} with the same shallow merge as the full
 * registry's `getCountryConfig`.
 */
const COUNTRY_CLIENT_ERA_CONFIG_OVERRIDES: Record<
  string,
  Partial<Record<CountryId, Partial<CountryClientConfig>>>
> = {
  "1979-default": {
    BR: {
      electionSystems: {
        lowerChamber: "pr_hareQuota",
        upperChamber: "fptp",
        headOfState: "parliamentary",
      },
    },
  },
  "2027-default": {
    FR: {
      usdExchangeRate: 1.0869565217391304,
    },
    IT: {
      usdExchangeRate: 1.0869565217391304,
    },
    ES: {
      usdExchangeRate: 1.0851086956521736,
    },
    GR: {
      usdExchangeRate: 1.0858695652173913,
    },
    AT: {
      usdExchangeRate: 1.0923913043478262,
    },
    FI: {
      usdExchangeRate: 1.085217391304348,
    },
    HU: {
      executiveTitle: "Prime Minister",
      executiveLabel: "Prime Minister's Office",
      governmentType: "parliamentaryRepublic",
      governmentTypeLabel: "Parliamentary Republic",
      descriptor:
        "The Prime Minister governs with the confidence of the 199-seat National Assembly, elected by a mixed constituency and list vote.",
      centralGovernmentLabel: "National Government",
      exchangeName: "Budapest Stock Exchange",
      rulingPartyId: undefined,
      majorPartyIds: ["tisza", "fidesz-kdnp", "mi hazank"],
      legislature: {
        name: "National Assembly",
        path: "/country/hu/legislature",
        bicameral: false,
        lowerChamber: {
          key: "nationalAssembly",
          name: "National Assembly",
          shortName: "Assembly",
          seats: 199,
          description:
            "199 deputies elected for four-year terms, with 106 single-member constituencies and 93 national-list seats.",
        },
      },
      officeTypes: [
        {
          key: "primeMinister",
          label: "Prime Minister",
          isExecutive: true,
          isSubNational: false,
          labelPlural: "Prime Ministers",
        },
        {
          key: "president",
          label: "President",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
          labelPlural: "Presidents",
        },
        {
          key: "assemblyDelegate",
          label: "Deputy",
          chamberKey: "nationalAssembly",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Deputies",
        },
        {
          key: "centralBankChair",
          label: "Governor of the MNB",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Governors of the MNB",
        },
      ],
      electionSystems: {
        lowerChamber: "ams",
        headOfGovernment: "parliamentary",
        headOfState: "ceremonial",
      },
      lowerElectionSystem: {
        snapElectionsAllowed: true,
      },
      usdExchangeRate: 0.0028312570781426957,
    },
    RO: {
      executiveTitle: "Prime Minister",
      executiveLabel: "Prime Minister's Office",
      governmentType: "presidential",
      governmentTypeLabel: "Semi-Presidential Republic",
      descriptor:
        "The Prime Minister governs with the confidence of the 331-seat Chamber of Deputies and the 134-seat Senate, both elected by closed-list proportional vote.",
      currencyCode: "RON",
      centralGovernmentLabel: "National Government",
      exchangeName: "Bucharest Stock Exchange",
      rulingPartyId: undefined,
      majorPartyIds: ["psd", "aur", "pnl", "usr"],
      legislature: {
        name: "Parliament",
        path: "/country/ro/legislature",
        bicameral: true,
        lowerChamber: {
          key: "chamberOfDeputies",
          name: "Chamber of Deputies",
          shortName: "Chamber",
          seats: 331,
          description:
            "331 deputies elected for four-year terms by closed-list proportional representation with a 5% national threshold.",
        },
        upperChamber: {
          key: "senat",
          name: "Senate",
          shortName: "Senate",
          seats: 134,
          description:
            "134 senators elected for four-year terms by closed-list proportional representation with a 5% national threshold.",
          elected: true,
        },
      },
      officeTypes: [
        {
          key: "president",
          label: "President",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
          labelPlural: "Presidents",
        },
        {
          key: "primeMinister",
          label: "Prime Minister",
          isExecutive: true,
          isSubNational: false,
          labelPlural: "Prime Ministers",
        },
        {
          key: "deputy",
          label: "Deputy",
          chamberKey: "chamberOfDeputies",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Deputies",
        },
        {
          key: "senator",
          label: "Senator",
          chamberKey: "senat",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Senators",
        },
        {
          key: "centralBankChair",
          label: "Governor of the BNR",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Governors of the BNR",
        },
      ],
      electionSystems: {
        lowerChamber: "pr_hareQuota",
        upperChamber: "pr_hareQuota",
        headOfGovernment: "parliamentary",
        headOfState: "fptp",
      },
      lowerElectionSystem: {
        snapElectionsAllowed: true,
      },
      upperElectionSystem: {
        snapElectionsAllowed: true,
      },
      usdExchangeRate: 0.21746694502435632,
    },
    BG: {
      executiveTitle: "Prime Minister",
      governmentType: "parliamentaryRepublic",
      governmentTypeLabel: "Parliamentary Republic",
      currencyCode: "EUR",
      rulingPartyId: undefined,
      majorPartyIds: ["pb", "gerb-sds", "pp-db", "dps", "v"],
      legislature: {
        name: "National Assembly",
        path: "/country/bg/legislature",
        bicameral: false,
        lowerChamber: {
          key: "nationalAssembly",
          name: "National Assembly",
          shortName: "Assembly",
          seats: 240,
          description: "240 deputies elected by proportional representation for a four-year term.",
        },
      },
      officeTypes: [
        {
          key: "primeMinister",
          label: "Prime Minister",
          isExecutive: true,
          isSubNational: false,
          labelPlural: "Prime Ministers",
        },
        {
          key: "president",
          label: "President",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
          labelPlural: "Presidents",
        },
        {
          key: "assemblyDeputy",
          label: "Deputy",
          chamberKey: "nationalAssembly",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Deputies",
        },
        {
          key: "centralBankChair",
          label: "Governor of the BNB",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Governors of the BNB",
        },
      ],
      electionSystems: {
        lowerChamber: "pr_hareQuota",
        headOfGovernment: "parliamentary",
        headOfState: "ceremonial",
      },
      lowerElectionSystem: {
        snapElectionsAllowed: true,
      },
      usdExchangeRate: 1.0869565217391304,
    },
    PL: {
      executiveTitle: "Prime Minister",
      governmentType: "parliamentaryRepublic",
      governmentTypeLabel: "Parliamentary Republic",
      descriptor:
        "The Prime Minister governs with the confidence of the 460-seat Sejm, elected by proportional vote, alongside the 100-seat Senate and a directly elected President.",
      currencyCode: "PLN",
      rulingPartyId: undefined,
      legislature: {
        name: "National Assembly",
        path: "/country/pl/legislature",
        bicameral: true,
        lowerChamber: {
          key: "sejm",
          name: "Sejm",
          shortName: "Sejm",
          seats: 460,
          description:
            "460 deputies elected by proportional representation to four-year terms, resting on the October 2023 result.",
        },
        upperChamber: {
          key: "senat",
          name: "Senate",
          shortName: "Senate",
          seats: 100,
          description:
            "100 senators elected by first-past-the-post in single-member constituencies to four-year terms.",
          elected: true,
        },
      },
      officeTypes: [
        {
          key: "primeMinister",
          label: "Prime Minister",
          isExecutive: true,
          isSubNational: false,
          labelPlural: "Prime Ministers",
        },
        {
          key: "president",
          label: "President",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
          labelPlural: "Presidents",
        },
        {
          key: "sejmDeputy",
          label: "Deputy",
          chamberKey: "sejm",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Deputies",
        },
        {
          key: "senator",
          label: "Senator",
          chamberKey: "senat",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Senators",
        },
        {
          key: "centralBankChair",
          label: "President of the NBP",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Presidents of the NBP",
        },
      ],
      electionSystems: {
        lowerChamber: "pr_hareQuota",
        upperChamber: "fptp",
        headOfGovernment: "parliamentary",
        headOfState: "ceremonial",
      },
      lowerElectionSystem: {
        snapElectionsAllowed: true,
      },
      upperElectionSystem: {
        snapElectionsAllowed: true,
      },
      usdExchangeRate: 0.2511805485783181,
    },
    RU: {
      executiveTitle: "President",
      executiveLabel: "Presidential Administration",
      governmentType: "presidential",
      governmentTypeLabel: "Presidential Federation",
      descriptor:
        "The President governs with a Prime Minister accountable to the 450-seat State Duma, elected by a mixed constituency and list vote, alongside the 178-member delegated Federation Council.",
      centralGovernmentLabel: "Federal Government",
      exchangeName: "Moscow Exchange",
      rulingPartyId: undefined,
      majorPartyIds: ["er", "kprf", "ldpr", "srzp", "np"],
      legislature: {
        name: "Federal Assembly",
        path: "/country/ru/legislature",
        bicameral: true,
        lowerChamber: {
          key: "stateDuma",
          name: "State Duma",
          shortName: "Duma",
          seats: 450,
          description:
            "450 deputies elected for five-year terms, with 225 single-member constituencies and 225 party-list seats subject to a 5% threshold.",
        },
        upperChamber: {
          key: "federationCouncil",
          name: "Federation Council",
          shortName: "Federation Council",
          seats: 178,
          description:
            "178 members delegated two per federal subject by regional legislatures and executives; not popularly elected.",
          elected: false,
        },
      },
      officeTypes: [
        {
          key: "president",
          label: "President",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
          labelPlural: "Presidents",
        },
        {
          key: "primeMinister",
          label: "Prime Minister",
          isExecutive: true,
          isSubNational: false,
          labelPlural: "Prime Ministers",
        },
        {
          key: "dumaDeputy",
          label: "Duma Deputy",
          chamberKey: "stateDuma",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Duma Deputies",
        },
        {
          key: "federationCouncilMember",
          label: "Federation Council Member",
          chamberKey: "federationCouncil",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Federation Council Members",
        },
        {
          key: "centralBankChair",
          label: "Governor of the Bank of Russia",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Governors of the Bank of Russia",
        },
      ],
      electionSystems: {
        lowerChamber: "ams",
        headOfGovernment: "parliamentary",
        headOfState: "fptp",
      },
      lowerElectionSystem: {
        snapElectionsAllowed: true,
      },
      usdExchangeRate: 0.01081,
    },
  },
  "1991-default": {
    UK: {
      usdExchangeRate: 1.7543859649122808,
    },
    JP: {
      legislature: {
        name: "Kokkai",
        path: "/country/jp/legislature",
        bicameral: true,
        lowerChamber: {
          key: "shugiin",
          name: "Shūgiin",
          shortName: "Shūgiin",
          seats: 512,
          description:
            "512 members elected from multi-member constituencies under the pre-1994 system.",
        },
        upperChamber: {
          key: "sangiin",
          name: "Sangiin",
          shortName: "Sangiin",
          seats: 252,
          description:
            "252 councillors elected on staggered 6-year terms. Half are contested every 3 years. Cannot be dissolved.",
          elected: true,
        },
      },
      usdExchangeRate: 0.007434944237918215,
    },
    DE: {
      usdExchangeRate: 1.1764705882352942,
    },
    IE: {
      usdExchangeRate: 1.6095348846567064,
    },
    CN: {
      usdExchangeRate: 0.18796992481203006,
    },
    PL: {
      executiveTitle: "Prime Minister",
      governmentType: "parliamentaryRepublic",
      governmentTypeLabel: "Parliamentary Republic",
      rulingPartyId: undefined,
      legislature: {
        name: "National Assembly",
        path: "/country/pl/legislature",
        bicameral: true,
        lowerChamber: {
          key: "sejm",
          name: "Sejm",
          shortName: "Sejm",
          seats: 460,
          description: "460 deputies elected through proportional representation.",
        },
        upperChamber: {
          key: "senat",
          name: "Senate",
          shortName: "Senate",
          seats: 100,
          description:
            "100 elected senators, two per voivodeship with extra seats for Warsaw and Katowice.",
          elected: true,
        },
      },
      officeTypes: [
        {
          key: "primeMinister",
          label: "Prime Minister",
          isExecutive: true,
          isSubNational: false,
          labelPlural: "Prime Ministers",
        },
        {
          key: "president",
          label: "President",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
          labelPlural: "Presidents",
        },
        {
          key: "sejmDeputy",
          label: "Deputy",
          chamberKey: "sejm",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Deputies",
        },
        {
          key: "senator",
          label: "Senator",
          chamberKey: "senat",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Senators",
        },
        {
          key: "centralBankChair",
          label: "President of the NBP",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Presidents of the NBP",
        },
      ],
      electionSystems: {
        lowerChamber: "pr_hareQuota",
        upperChamber: "fptp",
        headOfGovernment: "parliamentary",
        headOfState: "ceremonial",
      },
      lowerElectionSystem: {
        snapElectionsAllowed: true,
      },
      upperElectionSystem: {
        snapElectionsAllowed: true,
      },
      usdExchangeRate: 0.00010526315789473685,
    },
    HU: {
      executiveTitle: "Prime Minister",
      governmentType: "parliamentaryRepublic",
      governmentTypeLabel: "Parliamentary Republic",
      exchangeName: "Budapest Stock Exchange",
      rulingPartyId: undefined,
      majorPartyIds: ["mdf", "szdsz", "fkgp", "mszp", "fidesz", "kdnp"],
      legislature: {
        name: "National Assembly",
        path: "/country/hu/legislature",
        bicameral: false,
        lowerChamber: {
          key: "nationalAssembly",
          name: "National Assembly",
          shortName: "Assembly",
          seats: 386,
          description: "386 deputies elected in a mixed constituency and list system in 1990.",
        },
      },
      officeTypes: [
        {
          key: "primeMinister",
          label: "Prime Minister",
          isExecutive: true,
          isSubNational: false,
          labelPlural: "Prime Ministers",
        },
        {
          key: "president",
          label: "President",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
          labelPlural: "Presidents",
        },
        {
          key: "assemblyDelegate",
          label: "Deputy",
          chamberKey: "nationalAssembly",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Deputies",
        },
        {
          key: "centralBankChair",
          label: "Governor of the MNB",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Governors of the MNB",
        },
      ],
      electionSystems: {
        lowerChamber: "ams",
        headOfGovernment: "parliamentary",
        headOfState: "ceremonial",
      },
      lowerElectionSystem: {
        snapElectionsAllowed: true,
      },
      usdExchangeRate: 0.01338054286200446,
    },
    CS: {
      executiveTitle: "Prime Minister",
      governmentType: "parliamentaryRepublic",
      governmentTypeLabel: "Parliamentary Republic",
      rulingPartyId: undefined,
      majorPartyIds: ["of", "vpn", "ksc", "kdh"],
      legislature: {
        name: "Federal Assembly",
        path: "/country/cs/legislature",
        bicameral: true,
        lowerChamber: {
          key: "chamberOfThePeople",
          name: "Chamber of the People",
          shortName: "People",
          seats: 150,
          description: "150 deputies elected by proportional representation in 1990.",
        },
        upperChamber: {
          key: "chamberOfNations",
          name: "Chamber of Nations",
          shortName: "Nations",
          seats: 150,
          description: "150 deputies, equally divided between the Czech and Slovak republics.",
          elected: true,
        },
      },
      officeTypes: [
        {
          key: "primeMinister",
          label: "Prime Minister",
          isExecutive: true,
          isSubNational: false,
          labelPlural: "Prime Ministers",
        },
        {
          key: "president",
          label: "President",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
          labelPlural: "Presidents",
        },
        {
          key: "assemblyDeputy",
          label: "Deputy",
          chamberKey: "chamberOfThePeople",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Deputies",
        },
        {
          key: "nationsDeputy",
          label: "Deputy of Nations",
          chamberKey: "chamberOfNations",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Deputies of Nations",
        },
        {
          key: "centralBankChair",
          label: "Governor of the SBČS",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Governors of the SBČS",
        },
      ],
      electionSystems: {
        lowerChamber: "pr_hareQuota",
        upperChamber: "pr_hareQuota",
        headOfGovernment: "parliamentary",
        headOfState: "ceremonial",
      },
      lowerElectionSystem: {
        snapElectionsAllowed: true,
      },
      upperElectionSystem: {
        snapElectionsAllowed: true,
      },
      usdExchangeRate: 0.03617028972402069,
    },
    BG: {
      executiveTitle: "Prime Minister",
      governmentType: "parliamentaryRepublic",
      governmentTypeLabel: "Parliamentary Republic",
      rulingPartyId: undefined,
      majorPartyIds: ["bsp", "sds", "dps", "bzns"],
      legislature: {
        name: "Grand National Assembly",
        path: "/country/bg/legislature",
        bicameral: false,
        lowerChamber: {
          key: "nationalAssembly",
          name: "Grand National Assembly",
          shortName: "Assembly",
          seats: 400,
          description: "400 deputies elected in the multiparty June 1990 election.",
        },
      },
      officeTypes: [
        {
          key: "primeMinister",
          label: "Prime Minister",
          isExecutive: true,
          isSubNational: false,
          labelPlural: "Prime Ministers",
        },
        {
          key: "president",
          label: "President",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
          labelPlural: "Presidents",
        },
        {
          key: "assemblyDeputy",
          label: "Deputy",
          chamberKey: "nationalAssembly",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Deputies",
        },
        {
          key: "centralBankChair",
          label: "Governor of the BNB",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Governors of the BNB",
        },
      ],
      electionSystems: {
        lowerChamber: "ams",
        headOfGovernment: "parliamentary",
        headOfState: "ceremonial",
      },
      lowerElectionSystem: {
        snapElectionsAllowed: true,
      },
      usdExchangeRate: 0.035398230088495575,
    },
    YU: {
      executiveTitle: "Prime Minister",
      governmentType: "parliamentaryRepublic",
      governmentTypeLabel: "Federal Parliamentary Republic",
      rulingPartyId: undefined,
      majorPartyIds: ["srsj", "sps", "hdz", "sda", "demos", "skcg", "vmro-dpmne"],
      legislature: {
        name: "Federal Assembly",
        path: "/country/yu/legislature",
        bicameral: true,
        lowerChamber: {
          key: "federalAssembly",
          name: "Federal Chamber",
          shortName: "Federal",
          seats: 220,
          description: "220 delegates chosen through the republic and province delegate system.",
        },
        upperChamber: {
          key: "councilRepublicsProvinces",
          name: "Council of Republics and Provinces",
          shortName: "Republics",
          seats: 88,
          description: "Twelve delegates per republic and eight per autonomous province.",
          elected: false,
        },
      },
      officeTypes: [
        {
          key: "primeMinister",
          label: "Prime Minister",
          isExecutive: true,
          isSubNational: false,
          labelPlural: "Prime Ministers",
        },
        {
          key: "president",
          label: "Chair of the Presidency",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
          labelPlural: "Chairs of the Presidency",
        },
        {
          key: "assemblyDelegate",
          label: "Federal Delegate",
          chamberKey: "federalAssembly",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Federal Delegates",
        },
        {
          key: "councilDelegate",
          label: "Republic or Province Delegate",
          chamberKey: "councilRepublicsProvinces",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Republic or Province Delegates",
        },
        {
          key: "centralBankChair",
          label: "Governor of the NBY",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Governors of the NBY",
        },
      ],
      usdExchangeRate: 0.07370554634236226,
    },
    RO: {
      executiveTitle: "Prime Minister",
      executiveLabel: "Prime Minister's Office",
      governmentType: "presidential",
      governmentTypeLabel: "Transitional Semi-Presidential Republic",
      descriptor:
        "The President appoints a Prime Minister whose government answers to the elected Assembly of Deputies and Senate.",
      centralGovernmentLabel: "Government of Romania",
      rulingPartyId: undefined,
      majorPartyIds: ["fsn", "pnl", "pntcd", "udmr"],
      legislature: {
        name: "Constituent Parliament",
        path: "/country/ro/legislature",
        bicameral: true,
        lowerChamber: {
          key: "chamberOfDeputies",
          name: "Assembly of Deputies",
          shortName: "Assembly",
          seats: 396,
          description: "396 deputies elected in May 1990 under Decree-Law 92/1990.",
        },
        upperChamber: {
          key: "senat",
          name: "Senate",
          shortName: "Senate",
          seats: 119,
          description: "119 senators elected in May 1990 under Decree-Law 92/1990.",
          elected: true,
        },
      },
      officeTypes: [
        {
          key: "president",
          label: "President",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
          labelPlural: "Presidents",
        },
        {
          key: "primeMinister",
          label: "Prime Minister",
          isExecutive: true,
          isSubNational: false,
          labelPlural: "Prime Ministers",
        },
        {
          key: "deputy",
          label: "Deputy",
          chamberKey: "chamberOfDeputies",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Deputies",
        },
        {
          key: "senator",
          label: "Senator",
          chamberKey: "senat",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Senators",
        },
        {
          key: "centralBankChair",
          label: "Governor of the BNR",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Governors of the BNR",
        },
      ],
      electionSystems: {
        lowerChamber: "pr_hareQuota",
        upperChamber: "pr_hareQuota",
        headOfGovernment: "parliamentary",
        headOfState: "fptp",
      },
      upperElectionSystem: {
        snapElectionsAllowed: false,
      },
      usdExchangeRate: 0.02881844380403458,
    },
    RU: {
      name: "Soviet Union",
      regionLabel: "Economic Region",
      regionLabelPlural: "Economic Regions",
      executiveTitle: "Chairman of the Cabinet of Ministers",
      governmentType: "parliamentaryRepublic",
      governmentTypeLabel: "Transitional Soviet Presidency",
      rulingPartyId: undefined,
      legislature: {
        name: "Congress of People's Deputies of the Soviet Union",
        path: "/country/ru/legislature",
        bicameral: false,
        lowerChamber: {
          key: "unionCongress",
          name: "Congress of People's Deputies of the Soviet Union",
          shortName: "Union Congress",
          seats: 2250,
          description:
            "The 1989 Congress had 1,500 territorial and national-territorial deputies plus 750 representatives of public organizations. It selected the inner Supreme Soviet.",
        },
        upperChamber: undefined,
      },
      subNationalChamber: undefined,
      officeTypes: [
        {
          key: "chairmanOfCabinet",
          label: "Chairman of the Cabinet of Ministers",
          isExecutive: true,
          isSubNational: false,
          labelPlural: "Chairmen of the Cabinet of Ministers",
        },
        {
          key: "sovietPresident",
          label: "President of the Soviet Union",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
          labelPlural: "Presidents of the Soviet Union",
        },
        {
          key: "unionCongressDeputy",
          label: "Union People's Deputy",
          chamberKey: "unionCongress",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Union People's Deputies",
        },
      ],
      electionSystems: {
        lowerChamber: "fptp",
        headOfGovernment: "parliamentary",
        headOfState: "ceremonial",
      },
      upperElectionSystem: undefined,
      usdExchangeRate: 0.4504504504504504,
    },
    NG: {
      usdExchangeRate: 0.10101010101010101,
    },
    FR: {
      usdExchangeRate: 0.17723844774567454,
    },
    IT: {
      usdExchangeRate: 0.0008060529200610472,
    },
    ES: {
      usdExchangeRate: 0.009623566188883369,
    },
    SE: {
      usdExchangeRate: 0.16535849722197743,
    },
    TR: {
      usdExchangeRate: 0.00023970377407599706,
    },
    GR: {
      usdExchangeRate: 0.005486474240774826,
    },
    AT: {
      usdExchangeRate: 0.08564638036984938,
    },
    FI: {
      usdExchangeRate: 0.2472811947803059,
    },
  },
  "1953-default": {
    US: {
      legislature: {
        name: "Congress",
        path: "/country/us/legislature",
        bicameral: true,
        lowerChamber: {
          key: "house",
          name: "House of Representatives",
          shortName: "House",
          seats: 435,
          description: "435 representatives, two-year terms. All revenue bills originate here.",
        },
        upperChamber: {
          key: "senate",
          name: "Senate",
          shortName: "Senate",
          seats: 96,
          description: "96 senators from 48 states, six-year staggered terms.",
          elected: true,
          regionElectedClasses: true,
        },
      },
    },
    TR: {
      descriptor:
        "A parliamentary republic where a Prime Minister governs at the confidence of a unicameral 487-seat Grand National Assembly (TBMM); no Senate existed until the 1961 constitution.",
      majorPartyIds: ["tr_dp", "tr_chp"],
      legislature: {
        name: "Grand National Assembly",
        path: "/country/tr/legislature",
        bicameral: false,
        lowerChamber: {
          key: "milletMeclisi",
          name: "Grand National Assembly",
          shortName: "Meclis",
          seats: 487,
          description:
            "487 deputies of the unicameral Türkiye Büyük Millet Meclisi (1950 election size; Senate created only by the 1961 constitution).",
        },
      },
      officeTypes: [
        {
          key: "primeMinister",
          label: "Prime Minister",
          isExecutive: true,
          isSubNational: false,
          labelPlural: "Prime Ministers",
        },
        {
          key: "president",
          label: "President",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
          labelPlural: "Presidents",
        },
        {
          key: "deputy",
          label: "Deputy",
          chamberKey: "milletMeclisi",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Deputies",
        },
        {
          key: "centralBankChair",
          label: "Governor of the Central Bank of Turkey",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Governors of the Central Bank of Turkey",
        },
      ],
      electionSystems: {
        lowerChamber: "pr_hareQuota",
        headOfGovernment: "parliamentary",
        headOfState: "ceremonial",
      },
      upperElectionSystem: undefined,
      usdExchangeRate: 0.35714285714285715,
    },
    GR: {
      governmentType: "parliamentaryMonarchy",
      governmentTypeLabel: "Parliamentary Monarchy",
      descriptor:
        "A parliamentary monarchy where a Prime Minister governs at the confidence of the unicameral 300-seat Vouli under King Paul I; the majoritarian electoral law magnifies pluralities into landslides.",
      majorPartyIds: ["gr_es", "gr_epek"],
      officeTypes: [
        {
          key: "primeMinister",
          label: "Prime Minister",
          isExecutive: true,
          isSubNational: false,
          labelPlural: "Prime Ministers",
        },
        {
          key: "deputy",
          label: "Deputy",
          chamberKey: "vouli",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Deputies",
        },
        {
          key: "centralBankChair",
          label: "Governor of the Bank of Greece",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Governors of the Bank of Greece",
        },
      ],
      usdExchangeRate: 0.03333333333333333,
    },
    AT: {
      descriptor:
        "A parliamentary republic where a Chancellor governs at the confidence of the unicameral 165-seat Nationalrat, while Allied occupation zones still divide the country.",
      legislature: {
        name: "Nationalrat",
        path: "/country/at/legislature",
        bicameral: false,
        lowerChamber: {
          key: "nationalrat",
          name: "Nationalrat",
          shortName: "Nationalrat",
          seats: 165,
          description:
            "165 deputies of the Nationalrat (the pre-1971 chamber size), elected by proportional representation under the ÖVP–SPÖ grand coalition.",
        },
      },
      usdExchangeRate: 0.038461538461538464,
    },
    FI: {
      descriptor:
        "A parliamentary republic where a Prime Minister governs at the confidence of the unicameral 200-seat Eduskunta, under a presidency that owns the delicate relationship with the Soviet Union.",
      majorPartyIds: ["fi_ml", "fi_sdp"],
      usdExchangeRate: 0.004347826086956522,
    },
    FR: {
      executiveTitle: "President of the Council",
      executiveLabel: "Matignon",
      governmentType: "parliamentaryRepublic",
      governmentTypeLabel: "Parliamentary Republic",
      descriptor:
        "A parliamentary republic: a President elected by Parliament shares the stage with a President of the Council answerable to the 627-seat National Assembly, with an indirectly-elected Council of the Republic.",
      legislature: {
        name: "Parliament",
        path: "/country/fr/legislature",
        bicameral: true,
        lowerChamber: {
          key: "assembleeNationale",
          name: "National Assembly",
          shortName: "Assemblée",
          seats: 627,
          description:
            "627 deputies elected in the June 1951 election by proportional representation. The chamber that made and unmade Fourth Republic cabinets.",
        },
        upperChamber: {
          key: "senat",
          name: "Council of the Republic",
          shortName: "Conseil",
          seats: 320,
          description:
            "320 councillors of the Conseil de la République, elected indirectly by local authorities for six-year terms. A weaker revising chamber under the Fourth Republic.",
          elected: true,
        },
      },
      officeTypes: [
        {
          key: "primeMinister",
          label: "President of the Council",
          isExecutive: true,
          isSubNational: false,
          labelPlural: "Presidents of the Council",
        },
        {
          key: "president",
          label: "President",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
          labelPlural: "Presidents",
        },
        {
          key: "deputy",
          label: "Deputy",
          chamberKey: "assembleeNationale",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Deputies",
        },
        {
          key: "senator",
          label: "Councillor of the Republic",
          chamberKey: "senat",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Councillors of the Republic",
        },
        {
          key: "centralBankChair",
          label: "Governor of the Banque de France",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Governors of the Banque de France",
        },
      ],
      electionSystems: {
        lowerChamber: "pr_hareQuota",
        upperChamber: "pr_hareQuota",
        headOfGovernment: "parliamentary",
        headOfState: "ceremonial",
      },
      usdExchangeRate: 0.002857142857142857,
    },
    ES: {
      regionLabel: "Province",
      regionLabelPlural: "Provinces",
      executiveTitle: "Caudillo",
      executiveLabel: "El Pardo",
      governmentType: "onePartyState",
      governmentTypeLabel: "One Party State",
      descriptor:
        "A one-party state where Franco governs as both Jefe del Estado and Caudillo through FET y de las JONS; the 350-seat Cortes Españolas is a corporatist appointed chamber, and Spain is organised into provinces rather than autonomous communities.",
      rulingPartyId: 1,
      majorPartyIds: ["es_fet"],
      legislature: {
        name: "Cortes Españolas",
        path: "/country/es/legislature",
        bicameral: false,
        lowerChamber: {
          key: "congresoDiputados",
          name: "Cortes Españolas",
          shortName: "Cortes",
          seats: 350,
          description:
            "350 procuradores of the Cortes Españolas — a corporatist chamber seated by 'organic democracy' (syndicates, municipalities, families, and direct Franco appointment), not by competitive election.",
        },
      },
      officeTypes: [
        {
          key: "caudillo",
          label: "Caudillo",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
          labelPlural: "Caudillos",
        },
        {
          key: "procurador",
          label: "Procurador",
          chamberKey: "congresoDiputados",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Procuradores",
        },
        {
          key: "centralBankChair",
          label: "Governor of the Banco de España",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Governors of the Banco de España",
        },
      ],
      electionSystems: {
        lowerChamber: "pr_hareQuota",
        headOfGovernment: "parliamentary",
        headOfState: "ceremonial",
      },
      lowerElectionSystem: {
        snapElectionsAllowed: false,
      },
      upperElectionSystem: undefined,
      usdExchangeRate: 0.025252525252525252,
    },
    SE: {
      descriptor:
        "A constitutional monarchy with a bicameral Riksdag: a 230-seat directly elected Second Chamber and a 150-seat First Chamber indirectly elected by local councils.",
      majorPartyIds: ["se_sap", "se_h"],
      legislature: {
        name: "Riksdag",
        path: "/country/se/legislature",
        bicameral: false,
        lowerChamber: {
          key: "riksdag",
          name: "Second Chamber",
          shortName: "Andra kammaren",
          seats: 230,
          description:
            "230 members elected by proportional representation — the directly elected, confidence-giving chamber of the bicameral Riksdag.",
        },
        upperChamber: {
          key: "forstaKammaren",
          name: "First Chamber",
          shortName: "Första kammaren",
          seats: 150,
          description:
            "150 members indirectly elected by county and city councils on staggered eight-year terms. May revise or delay legislation, but the Second Chamber ultimately prevails. Not player-managed.",
        },
      },
      officeTypes: [
        {
          key: "primeMinister",
          label: "Prime Minister",
          isExecutive: true,
          isSubNational: false,
          labelPlural: "Prime Ministers",
        },
        {
          key: "monarch",
          label: "King",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
          labelPlural: "Kings",
        },
        {
          key: "member",
          label: "Member of the Second Chamber",
          chamberKey: "riksdag",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Members of the Second Chamber",
        },
        {
          key: "centralBankChair",
          label: "Governor of the Riksbank",
          isExecutive: false,
          isSubNational: false,
          labelPlural: "Governors of the Riksbank",
        },
      ],
      usdExchangeRate: 0.19342359767891684,
    },
    HU: {
      majorPartyIds: ["mdp"],
      usdExchangeRate: 0.05,
    },
    RO: {
      majorPartyIds: ["pmr"],
      usdExchangeRate: 0.07407407407407407,
    },
    PL: {
      usdExchangeRate: 0.041666666666666664,
    },
    CS: {
      usdExchangeRate: 0.037037037037037035,
    },
    BG: {
      usdExchangeRate: 0.06535947712418301,
    },
    YU: {
      usdExchangeRate: 0.059998800023999516,
    },
    DD: {
      usdExchangeRate: 0.23809523809523808,
    },
    BLR: {
      usdExchangeRate: 0.1111111111111111,
    },
    BAL: {
      usdExchangeRate: 0.1111111111111111,
    },
    UKR: {
      usdExchangeRate: 0.1111111111111111,
    },
    UK: {
      legislature: {
        name: "Parliament",
        path: "/country/uk/legislature",
        bicameral: false,
        lowerChamber: {
          key: "commons",
          name: "House of Commons",
          shortName: "Commons",
          seats: 625,
          description:
            "625 elected MPs from single-member constituencies (1950–1955 redistribution). The primary legislative chamber.",
        },
        upperChamber: {
          key: "lords",
          name: "House of Lords",
          shortName: "Lords",
          seats: 784,
          description: "Appointed and hereditary peers. Revises and scrutinises legislation.",
        },
      },
      usdExchangeRate: 2.801120448179272,
    },
    IT: {
      legislature: {
        name: "Parliament",
        path: "/country/it/legislature",
        bicameral: true,
        lowerChamber: {
          key: "cameraDeputati",
          name: "Chamber of Deputies",
          shortName: "Camera",
          seats: 590,
          description:
            "590 deputies elected by proportional representation (Camera size in force 1948–1963).",
        },
        upperChamber: {
          key: "senato",
          name: "Senate of the Republic",
          shortName: "Senato",
          seats: 280,
          description:
            "280 elected senators on a regional basis for five-year terms (1953 First Republic apportionment).",
          elected: true,
        },
      },
      usdExchangeRate: 1,
    },
    DE: {
      legislature: {
        name: "Bundestag",
        path: "/country/de/legislature",
        bicameral: true,
        lowerChamber: {
          key: "bundestag",
          name: "Bundestag",
          shortName: "Bundestag",
          seats: 487,
          description:
            "487 members of the 2nd Bundestag (1953) elected via mixed-member proportional representation.",
        },
        upperChamber: {
          key: "bundesrat",
          name: "Bundesrat",
          shortName: "Bundesrat",
          seats: 69,
          description:
            "Members representing the West German Länder (appointed by state governments).",
        },
      },
      usdExchangeRate: 0.23809523809523808,
    },
    JP: {
      majorPartyIds: ["ryo", "jsp"],
      legislature: {
        name: "Kokkai",
        path: "/country/jp/legislature",
        bicameral: true,
        lowerChamber: {
          key: "shugiin",
          name: "Shūgiin",
          shortName: "Shūgiin",
          seats: 466,
          description:
            "466 members elected in the April 1953 general election from regional constituencies.",
        },
        upperChamber: {
          key: "sangiin",
          name: "Sangiin",
          shortName: "Sangiin",
          seats: 248,
          description:
            "248 councillors elected on staggered 6-year terms. Half are contested every 3 years. Cannot be dissolved.",
          elected: true,
        },
      },
      usdExchangeRate: 1,
    },
    IE: {
      legislature: {
        name: "Oireachtas",
        path: "/country/ie/legislature",
        bicameral: false,
        lowerChamber: {
          key: "dail",
          name: "Dáil Éireann",
          shortName: "Dáil",
          seats: 147,
          description:
            "147 TDs elected by PR-STV across multi-seat constituencies (1948 redistribution).",
        },
        upperChamber: {
          key: "seanad",
          name: "Seanad Éireann",
          shortName: "Seanad",
          seats: 60,
          description:
            "60 senators - 43 elected from vocational panels, 11 nominated by the Taoiseach, 6 from universities.",
        },
      },
      usdExchangeRate: 2.801120448179272,
    },
    BR: {
      legislature: {
        name: "National Congress",
        path: "/country/br/legislature",
        bicameral: true,
        lowerChamber: {
          key: "chamber",
          name: "Chamber of Deputies",
          shortName: "Chamber",
          seats: 304,
          description:
            "304 deputies of the 1950 legislature elected by open-list proportional representation.",
        },
        upperChamber: {
          key: "senate",
          name: "Federal Senate",
          shortName: "Senate",
          seats: 81,
          description:
            "81 senators - three per state - serving eight-year staggered terms. Reviews legislation from the Chamber.",
          elected: true,
        },
      },
      usdExchangeRate: 0.05319148936170213,
    },
    CN: {
      legislature: {
        name: "National People's Congress",
        path: "/country/cn/legislature",
        bicameral: false,
        lowerChamber: {
          key: "npc",
          name: "National People's Congress",
          shortName: "NPC",
          seats: 1226,
          description: "1,226 deputies of the First National People's Congress (1954 convocation).",
        },
        upperChamber: {
          key: "cppcc",
          name: "CPPCC",
          shortName: "CPPCC",
          seats: 2169,
          description:
            "Members of the Chinese People's Political Consultative Conference - an advisory body representing diverse social and economic constituencies.",
        },
      },
      usdExchangeRate: 1,
    },
    NG: {
      legislature: {
        name: "National Assembly",
        path: "/country/ng/legislature",
        bicameral: true,
        lowerChamber: {
          key: "house",
          name: "House of Representatives",
          shortName: "House",
          seats: 136,
          description:
            "136 representatives of the Federal House under the Lyttelton Constitution (1954).",
        },
        upperChamber: {
          key: "senate",
          name: "Senate",
          shortName: "Senate",
          seats: 109,
          description: "Senators elected from constituencies across the Nigerian federation.",
          elected: true,
        },
      },
      usdExchangeRate: 1,
    },
    RU: {
      legislature: {
        name: "Supreme Soviet",
        path: "/country/ru/legislature",
        bicameral: true,
        lowerChamber: {
          key: "sovietOfTheUnion",
          name: "Soviet of the Union",
          shortName: "Union",
          seats: 526,
          description:
            "526 deputies of the Soviet of the Union (RU's share of the 1954 convocation), elected by population.",
        },
        upperChamber: {
          key: "sovietOfNationalities",
          name: "Soviet of Nationalities",
          shortName: "Nationalities",
          seats: 515,
          description:
            "Deputies representing the union republics and autonomous republics of the Soviet Union.",
          elected: true,
        },
      },
      usdExchangeRate: 0.1111111111111111,
    },
  },
};

/** Every configured country id, including the latent secession countries. */
export const ALL_COUNTRY_IDS: readonly CountryId[] = Object.keys(
  COUNTRY_CLIENT_CONFIGS
) as CountryId[];

/** Default `countryId` when legacy documents omit it. */
export const DEFAULT_LEGACY_COUNTRY_ID: CountryId = "US";

/** Client-safe `getCountryConfig`: same id, same preset merge, narrow shape. */
export function getCountryClientConfig(id: CountryId, preset?: string): CountryClientConfig {
  const base = COUNTRY_CLIENT_CONFIGS[id];
  const override = preset ? COUNTRY_CLIENT_ERA_CONFIG_OVERRIDES[preset]?.[id] : undefined;
  if (!override) return base;
  return { ...base, ...override };
}

/**
 * Per-era country display-name overrides. Mirrors `ERA_COUNTRY_NAMES`: a
 * country's base `name` is the era-neutral default, and some presets name it
 * differently (the FRG is "West Germany" while the GDR exists).
 */
const COUNTRY_CLIENT_ERA_NAMES: Record<string, Partial<Record<CountryId, string>>> = {
  "1953-default": {
    DE: "West Germany",
    RU: "Soviet Union",
  },
  "1979-default": {
    DE: "West Germany",
    RU: "Soviet Union",
  },
  "1991-default": {
    RU: "Soviet Union",
  },
};

/** Country name for display, honoring per-era overrides when a preset is known. */
export function getCountryDisplayName(id: CountryId, preset?: string): string {
  const override = preset ? COUNTRY_CLIENT_ERA_NAMES[preset]?.[id] : undefined;
  const config = Object.hasOwn(COUNTRY_CLIENT_CONFIGS, id) ? COUNTRY_CLIENT_CONFIGS[id] : undefined;
  return override ?? config?.name ?? id;
}

/** Reverse lookup: full country name ("United Kingdom") to ISO `CountryId` ("UK"). */
const COUNTRY_NAME_TO_ID: Record<string, CountryId> = Object.fromEntries(
  COUNTRY_ORDER.map((id) => [COUNTRY_CLIENT_CONFIGS[id].name, id])
);

export function getCountryIdByName(name: string): CountryId | null {
  return COUNTRY_NAME_TO_ID[name] ?? null;
}

/** `COUNTRY_CONFIGS[id].officeTypes` entry for one office key, or undefined. */
export function getOfficeTypeConfig(
  countryId: CountryId,
  officeKey: string,
  preset?: string
): CountryClientOfficeType | undefined {
  return getCountryClientConfig(countryId, preset).officeTypes.find((o) => o.key === officeKey);
}

/** Maps country to the office key used for regional executive assent on state bills. */
const REGIONAL_BILL_ASSENT_OFFICE_KEY: Partial<Record<CountryId, string>> = {
  US: "governor",
  UK: "governor",
  JP: "governor",
  IE: "governor",
  DE: "ministerPresident",
  RU: "governor",
  DD: "governor",
};

/** Short label for the regional chief executive who signs or vetoes sub-national bills. */
export function getRegionalBillAssentTitle(countryId: CountryId): string {
  const cfg = COUNTRY_CLIENT_CONFIGS[countryId];
  if (cfg.regionalBillAssentTitle) return cfg.regionalBillAssentTitle;
  const key = REGIONAL_BILL_ASSENT_OFFICE_KEY[countryId];
  if (key) {
    const office = getOfficeTypeConfig(countryId, key);
    if (office) return office.label;
  }
  return "Governor";
}

/**
 * State-aware regional-executive label. Overrides the country-level title for
 * regions whose executive has a distinct title (UK LON to "Mayor of London").
 */
const UK_COUNTRY_ID = COUNTRY_CLIENT_CONFIGS.UK.id;

export function getRegionalBillAssentTitleForState(
  countryId: CountryId,
  stateId: string | undefined | null
): string {
  if (countryId === UK_COUNTRY_ID && stateId && stateId.toUpperCase() === "LON") {
    return "Mayor of London";
  }
  if (countryId === "IE" && stateId) {
    const upper = stateId.toUpperCase();
    if (upper === "DUB") return "Lord Mayor of Dublin";
    if (upper === "COR") return "Lord Mayor of Cork";
    if (upper === "LIM") return "Mayor of Limerick";
    if (upper === "GAL") return "Mayor of Galway";
  }
  return getRegionalBillAssentTitle(countryId);
}

/** The officeType key of the country's regional chief executive. */
export function getRegionalExecutiveOfficeKey(countryId: CountryId): string {
  return REGIONAL_BILL_ASSENT_OFFICE_KEY[countryId] ?? "governor";
}

/** Office-type key for the sub-national legislature, defaulting to the US-style key. */
export function getSubNationalLegislatureKey(countryId: CountryId): string {
  const config = getCountryClientConfig(countryId);
  if (config.subNationalChamber) return config.subNationalChamber.key;
  return "stateSenate";
}

/** User-facing name of the national-level address. */
const NATIONAL_ADDRESS_NAME: Partial<Record<CountryId, string>> = {
  US: "State of the Union",
  UK: "Address to the Nation",
  DE: "Government Declaration",
  JP: "Policy Speech",
  IE: "Address to the Oireachtas",
};

export function getNationalAddressName(countryId: CountryId): string {
  return NATIONAL_ADDRESS_NAME[countryId] ?? "Address to the Nation";
}

/** User-facing name for the head-of-government order at the national scope. */
export function getExecutiveOrderName(countryId: CountryId): string {
  const config = COUNTRY_CLIENT_CONFIGS[countryId];
  return getExecutiveOrderNameForGovernmentType(config?.governmentType);
}

/** Plural form for headers ("Executive Orders" vs "Orders in Council"). */
export function getExecutiveOrderNamePlural(countryId: CountryId): string {
  const config = COUNTRY_CLIENT_CONFIGS[countryId];
  return getExecutiveOrderNamePluralForGovernmentType(config?.governmentType);
}
