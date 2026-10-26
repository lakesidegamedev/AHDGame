/**
 * GENERATED FILE. DO NOT EDIT BY HAND.
 *
 *   npx tsx scripts/countries/gen-country-client-config.ts
 *
 * The institutional slice of the country registry: chambers, office types,
 * government type and the regional executive.
 *
 * The elections list groups races into office sections and builds its race
 * filter from these tables, `officeResolution.ts` maps an election type to the
 * office and chamber it fills, and the state legislature and bill pages need
 * the chamber that signs regional bills and what that office is called.
 * Reading them from `countryClientConfig` shipped that whole 154 KB projection
 * (names, routes, currencies, central banks, election systems, descriptors) to
 * the browser for it; this file carries only the institutions those modules
 * read.
 *
 * `countryOfficesClient.test.ts` pins every entry, including the per-era
 * overlays, to `COUNTRY_CLIENT_CONFIGS`.
 */
import type { CountryId, GovernmentType } from "./countriesCore";

/** One chamber, as the office tables need it. */
export interface CountryOfficeChamberConfig {
  key: string;
  name: string;
  shortName: string;
  seats: number;
  description?: string;
  elected?: boolean;
  regionElectedClasses?: boolean;
  regionalModel?: boolean;
}

/** The national chambers a country's offices sit in. */
export interface CountryOfficeLegislatureConfig {
  /** Chamber name for the whole legislature ("Congress", "Bundestag"). */
  name: string;
  lowerChamber: CountryOfficeChamberConfig;
  upperChamber?: CountryOfficeChamberConfig;
}

/** One office type an election can fill. */
export interface CountryOfficeTypeConfig {
  key: string;
  label: string;
  labelPlural: string;
  chamberKey?: string;
  isExecutive: boolean;
  isSubNational: boolean;
  isHeadOfState?: boolean;
}

/** Everything a country contributes to office resolution and the race filter. */
export interface CountryOfficeConfig {
  governmentType: GovernmentType;
  /** Singular label for the country's regions ("State", "Land"). */
  regionLabel: string;
  /** Era-neutral title of the office that signs or vetoes regional bills. */
  regionalBillAssentTitle?: string;
  legislature: CountryOfficeLegislatureConfig;
  subNationalChamber?: Pick<
    CountryOfficeChamberConfig,
    "key" | "name" | "shortName" | "regionalModel"
  >;
  officeTypes: CountryOfficeTypeConfig[];
  lowerElectionSystem: { snapElectionsAllowed: boolean };
  upperElectionSystem?: { snapElectionsAllowed: boolean };
}

/** Every country's chambers and offices. */
export const COUNTRY_OFFICES: Record<CountryId, CountryOfficeConfig> = {
  US: {
    governmentType: "presidential",
    regionLabel: "State",
    legislature: {
      name: "Congress",
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
        labelPlural: "Presidents",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "vicePresident",
        label: "Vice President",
        labelPlural: "Vice Presidents",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "senate",
        label: "Senator",
        labelPlural: "Senators",
        chamberKey: "senate",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "house",
        label: "Representative",
        labelPlural: "Representatives",
        chamberKey: "house",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "governor",
        label: "Governor",
        labelPlural: "Governors",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "stateSenate",
        label: "State Senator",
        labelPlural: "State Senators",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "centralBankChair",
        label: "Federal Reserve Chair",
        labelPlural: "Federal Reserve Chairs",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    upperElectionSystem: {
      snapElectionsAllowed: false,
    },
  },
  UK: {
    governmentType: "parliamentaryMonarchy",
    regionLabel: "Nation",
    regionalBillAssentTitle: "First Minister",
    legislature: {
      name: "Parliament",
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
        labelPlural: "Prime Ministers",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "commons",
        label: "Member of Parliament",
        labelPlural: "Members of Parliament",
        chamberKey: "commons",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "regionalCouncil",
        label: "Regional Councillor",
        labelPlural: "Regional Councillors",
        chamberKey: "regionalCouncil",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "governor",
        label: "First Minister",
        labelPlural: "First Ministers",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "centralBankChair",
        label: "Governor of the Bank of England",
        labelPlural: "Governors of the Bank of England",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
  },
  DE: {
    governmentType: "parliamentaryRepublic",
    regionLabel: "Land",
    regionalBillAssentTitle: "Minister-President",
    legislature: {
      name: "Bundestag",
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
        labelPlural: "Chancellors",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "bundestag",
        label: "Member of Bundestag",
        labelPlural: "Members of Bundestag",
        chamberKey: "bundestag",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "ministerPresident",
        label: "Minister-President",
        labelPlural: "Minister-Presidents",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "landtag",
        label: "Mitglied des Landtags",
        labelPlural: "Mitglieder des Landtags",
        chamberKey: "landtag",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "centralBankChair",
        label: "President of the ECB",
        labelPlural: "Presidents of the ECB",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
  },
  JP: {
    governmentType: "parliamentaryMonarchy",
    regionLabel: "Region",
    legislature: {
      name: "Kokkai",
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
        labelPlural: "Prime Ministers",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "shugiin",
        label: "Member of the House of Representatives",
        labelPlural: "Members of the House of Representatives",
        chamberKey: "shugiin",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "sangiin",
        label: "Member of the House of Councillors",
        labelPlural: "Members of the House of Councillors",
        chamberKey: "sangiin",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "regionalCouncil",
        label: "Regional Councillor",
        labelPlural: "Regional Councillors",
        chamberKey: "regionalCouncil",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "governor",
        label: "Governor",
        labelPlural: "Governors",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "centralBankChair",
        label: "Governor of the Bank of Japan",
        labelPlural: "Governors of the Bank of Japan",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
    upperElectionSystem: {
      snapElectionsAllowed: false,
    },
  },
  IE: {
    governmentType: "parliamentaryRepublic",
    regionLabel: "Region",
    regionalBillAssentTitle: "Cathaoirleach",
    legislature: {
      name: "Oireachtas",
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
        labelPlural: "Taoisigh",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "tanaiste",
        label: "Tánaiste",
        labelPlural: "Tánaistí",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "uachtaran",
        label: "Uachtarán",
        labelPlural: "Uachtaráin",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "dail",
        label: "Teachta Dála",
        labelPlural: "Teachtaí Dála",
        chamberKey: "dail",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "centralBankChair",
        label: "Governor of the Central Bank of Ireland",
        labelPlural: "Governors of the Central Bank of Ireland",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "localCouncil",
        label: "Councillor",
        labelPlural: "Councillors",
        chamberKey: "localCouncil",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "governor",
        label: "Cathaoirleach",
        labelPlural: "Cathaoirligh",
        isExecutive: false,
        isSubNational: true,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
  },
  SCO: {
    governmentType: "parliamentaryRepublic",
    regionLabel: "Region",
    regionalBillAssentTitle: "Provost",
    legislature: {
      name: "Scottish Parliament",
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
        labelPlural: "First Ministers",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "holyrood",
        label: "Member of the Scottish Parliament",
        labelPlural: "Members of the Scottish Parliament",
        chamberKey: "holyrood",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "governor",
        label: "Provost",
        labelPlural: "Provosts",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "regionalCouncil",
        label: "Regional Councillor",
        labelPlural: "Regional Councillors",
        chamberKey: "regionalCouncil",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "centralBankChair",
        label: "Governor of the Bank of England",
        labelPlural: "Governors of the Bank of England",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
  },
  WAL: {
    governmentType: "parliamentaryRepublic",
    regionLabel: "Region",
    regionalBillAssentTitle: "Leader",
    legislature: {
      name: "Senedd Cymru",
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
        labelPlural: "First Ministers",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "senedd",
        label: "Member of the Senedd",
        labelPlural: "Members of the Senedd",
        chamberKey: "senedd",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "governor",
        label: "Leader",
        labelPlural: "Leaders",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "regionalCouncil",
        label: "Regional Councillor",
        labelPlural: "Regional Councillors",
        chamberKey: "regionalCouncil",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "centralBankChair",
        label: "Governor of the Bank of England",
        labelPlural: "Governors of the Bank of England",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
  },
  BR: {
    governmentType: "presidential",
    regionLabel: "State",
    legislature: {
      name: "National Congress",
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
        labelPlural: "Presidents",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "vicePresident",
        label: "Vice President",
        labelPlural: "Vice Presidents",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "senate",
        label: "Senator",
        labelPlural: "Senators",
        chamberKey: "senate",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "chamber",
        label: "Federal Deputy",
        labelPlural: "Federal Deputies",
        chamberKey: "chamber",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "governor",
        label: "Governor",
        labelPlural: "Governors",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "centralBankChair",
        label: "Governor of the BCB",
        labelPlural: "Governors of the BCB",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    upperElectionSystem: {
      snapElectionsAllowed: false,
    },
  },
  CN: {
    governmentType: "onePartyState",
    regionLabel: "Province",
    legislature: {
      name: "National People's Congress",
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
        labelPlural: "Premiers",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "president",
        label: "President",
        labelPlural: "Presidents",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "npcDelegate",
        label: "NPC Delegate",
        labelPlural: "NPC Delegates",
        chamberKey: "npc",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "peoplesCongress",
        label: "Provincial Delegate",
        labelPlural: "Provincial Delegates",
        chamberKey: "peoplesCongress",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "governor",
        label: "Governor",
        labelPlural: "Governors",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "centralBankChair",
        label: "Governor of the PBoC",
        labelPlural: "Governors of the PBoC",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
  },
  NG: {
    governmentType: "presidential",
    regionLabel: "Zone",
    legislature: {
      name: "National Assembly",
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
        labelPlural: "Presidents",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "vicePresident",
        label: "Vice President",
        labelPlural: "Vice Presidents",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "senate",
        label: "Senator",
        labelPlural: "Senators",
        chamberKey: "senate",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "house",
        label: "Representative",
        labelPlural: "Representatives",
        chamberKey: "house",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "regionalCouncil",
        label: "Assembly Member",
        labelPlural: "Assembly Members",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "governor",
        label: "Governor",
        labelPlural: "Governors",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "centralBankChair",
        label: "Governor of the CBN",
        labelPlural: "Governors of the CBN",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    upperElectionSystem: {
      snapElectionsAllowed: false,
    },
  },
  HU: {
    governmentType: "onePartyState",
    regionLabel: "Region",
    legislature: {
      name: "National Assembly",
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
        labelPlural: "General Secretaries",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "chairmanOfPresidentialCouncil",
        label: "Chairman of the Presidential Council",
        labelPlural: "Chairmen of the Presidential Council",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "assemblyDelegate",
        label: "Deputy",
        labelPlural: "Deputies",
        chamberKey: "nationalAssembly",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "centralBankChair",
        label: "Governor of the MNB",
        labelPlural: "Governors of the MNB",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
  },
  PL: {
    governmentType: "onePartyState",
    regionLabel: "Region",
    legislature: {
      name: "Sejm",
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
        labelPlural: "First Secretaries",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "chairmanOfStateCouncil",
        label: "Chairman of the Council of State",
        labelPlural: "Chairmen of the Council of State",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "sejmDeputy",
        label: "Deputy",
        labelPlural: "Deputies",
        chamberKey: "sejm",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "centralBankChair",
        label: "President of the NBP",
        labelPlural: "Presidents of the NBP",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
  },
  RO: {
    governmentType: "onePartyState",
    regionLabel: "Region",
    legislature: {
      name: "Grand National Assembly",
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
        labelPlural: "General Secretaries",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "presidentOfStateCouncil",
        label: "President of the State Council",
        labelPlural: "Presidents of the State Council",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "assemblyDeputy",
        label: "Deputy",
        labelPlural: "Deputies",
        chamberKey: "grandNationalAssembly",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "centralBankChair",
        label: "Governor of the BNR",
        labelPlural: "Governors of the BNR",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
  },
  YU: {
    governmentType: "onePartyState",
    regionLabel: "Republic",
    legislature: {
      name: "Federal Assembly",
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
        labelPlural: "Presidents",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "assemblyDelegate",
        label: "Delegate",
        labelPlural: "Delegates",
        chamberKey: "federalAssembly",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "centralBankChair",
        label: "Governor of the NBY",
        labelPlural: "Governors of the NBY",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
  },
  BG: {
    governmentType: "onePartyState",
    regionLabel: "Region",
    legislature: {
      name: "National Assembly",
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
        labelPlural: "General Secretaries",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "chairmanOfStateCouncil",
        label: "Chairman of the State Council",
        labelPlural: "Chairmen of the State Council",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "assemblyDeputy",
        label: "Deputy",
        labelPlural: "Deputies",
        chamberKey: "nationalAssembly",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "centralBankChair",
        label: "Governor of the BNB",
        labelPlural: "Governors of the BNB",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
  },
  BLR: {
    governmentType: "onePartyState",
    regionLabel: "Region",
    legislature: {
      name: "Supreme Soviet",
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
        labelPlural: "First Secretaries",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "chairmanOfPresidium",
        label: "Chairman of the Presidium",
        labelPlural: "Chairmen of the Presidium",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "sovietDeputy",
        label: "Deputy",
        labelPlural: "Deputies",
        chamberKey: "supremeSoviet",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "centralBankChair",
        label: "Gosbank Chair",
        labelPlural: "Gosbank Chairs",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
  },
  CS: {
    governmentType: "onePartyState",
    regionLabel: "Region",
    legislature: {
      name: "Federal Assembly",
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
        labelPlural: "General Secretaries",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "president",
        label: "President",
        labelPlural: "Presidents",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "assemblyDeputy",
        label: "Deputy",
        labelPlural: "Deputies",
        chamberKey: "chamberOfThePeople",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "centralBankChair",
        label: "Governor of the SBČS",
        labelPlural: "Governors of the SBČS",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
  },
  UKR: {
    governmentType: "onePartyState",
    regionLabel: "Region",
    legislature: {
      name: "Supreme Soviet",
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
        labelPlural: "First Secretaries",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "chairmanOfPresidium",
        label: "Chairman of the Presidium",
        labelPlural: "Chairmen of the Presidium",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "sovietDeputy",
        label: "Deputy",
        labelPlural: "Deputies",
        chamberKey: "supremeSoviet",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "centralBankChair",
        label: "Gosbank Chair",
        labelPlural: "Gosbank Chairs",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
  },
  BAL: {
    governmentType: "onePartyState",
    regionLabel: "Republic",
    legislature: {
      name: "Supreme Soviet",
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
        labelPlural: "First Secretaries",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "chairmanOfPresidium",
        label: "Chairman of the Presidium",
        labelPlural: "Chairmen of the Presidium",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "sovietDeputy",
        label: "Deputy",
        labelPlural: "Deputies",
        chamberKey: "supremeSoviet",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "centralBankChair",
        label: "Gosbank Chair",
        labelPlural: "Gosbank Chairs",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
  },
  RU: {
    governmentType: "onePartyState",
    regionLabel: "Republic",
    legislature: {
      name: "Supreme Soviet",
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
        labelPlural: "Premiers",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "chairmanOfPresidium",
        label: "Chairman of the Presidium",
        labelPlural: "Chairmen of the Presidium",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "supremeSovietDeputy",
        label: "Supreme Soviet Deputy",
        labelPlural: "Supreme Soviet Deputies",
        chamberKey: "sovietOfTheUnion",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "nationalitiesDeputy",
        label: "Nationalities Deputy",
        labelPlural: "Nationalities Deputies",
        chamberKey: "sovietOfNationalities",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "republicSupremeSoviet",
        label: "Republic Deputy",
        labelPlural: "Republic Deputies",
        chamberKey: "republicSupremeSoviet",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "governor",
        label: "Republic First Secretary",
        labelPlural: "Republic First Secretaries",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "centralBankChair",
        label: "Chairman of Gosbank",
        labelPlural: "Chairmen of Gosbank",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
    upperElectionSystem: {
      snapElectionsAllowed: false,
    },
  },
  FR: {
    governmentType: "presidential",
    regionLabel: "Region",
    legislature: {
      name: "Parliament",
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
        labelPlural: "Presidents",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "primeMinister",
        label: "Prime Minister",
        labelPlural: "Prime Ministers",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "deputy",
        label: "Deputy",
        labelPlural: "Deputies",
        chamberKey: "assembleeNationale",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "senator",
        label: "Senator",
        labelPlural: "Senators",
        chamberKey: "senat",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "centralBankChair",
        label: "Governor of the Banque de France",
        labelPlural: "Governors of the Banque de France",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
    upperElectionSystem: {
      snapElectionsAllowed: false,
    },
  },
  IT: {
    governmentType: "parliamentaryRepublic",
    regionLabel: "Region",
    legislature: {
      name: "Parliament",
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
        labelPlural: "Prime Ministers",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "president",
        label: "President",
        labelPlural: "Presidents",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "deputy",
        label: "Deputy",
        labelPlural: "Deputies",
        chamberKey: "cameraDeputati",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "senator",
        label: "Senator",
        labelPlural: "Senators",
        chamberKey: "senato",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "centralBankChair",
        label: "Governor of the Banca d'Italia",
        labelPlural: "Governors of the Banca d'Italia",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
    upperElectionSystem: {
      snapElectionsAllowed: true,
    },
  },
  ES: {
    governmentType: "parliamentaryMonarchy",
    regionLabel: "Autonomous Community",
    legislature: {
      name: "Cortes Generales",
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
        labelPlural: "Prime Ministers",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "monarch",
        label: "King",
        labelPlural: "Kings",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "deputy",
        label: "Deputy",
        labelPlural: "Deputies",
        chamberKey: "congresoDiputados",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "senator",
        label: "Senator",
        labelPlural: "Senators",
        chamberKey: "senado",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "centralBankChair",
        label: "Governor of the Banco de España",
        labelPlural: "Governors of the Banco de España",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
    upperElectionSystem: {
      snapElectionsAllowed: true,
    },
  },
  SE: {
    governmentType: "parliamentaryMonarchy",
    regionLabel: "County",
    legislature: {
      name: "Riksdag",
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
        labelPlural: "Prime Ministers",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "monarch",
        label: "King",
        labelPlural: "Kings",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "member",
        label: "Member of the Riksdag",
        labelPlural: "Members of the Riksdag",
        chamberKey: "riksdag",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "centralBankChair",
        label: "Governor of the Riksbank",
        labelPlural: "Governors of the Riksbank",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
  },
  TR: {
    governmentType: "parliamentaryRepublic",
    regionLabel: "Region",
    legislature: {
      name: "Grand National Assembly",
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
        labelPlural: "Prime Ministers",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "president",
        label: "President",
        labelPlural: "Presidents",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "deputy",
        label: "Deputy",
        labelPlural: "Deputies",
        chamberKey: "milletMeclisi",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "senator",
        label: "Senator",
        labelPlural: "Senators",
        chamberKey: "senato",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "centralBankChair",
        label: "Governor of the Central Bank of Turkey",
        labelPlural: "Governors of the Central Bank of Turkey",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
    upperElectionSystem: {
      snapElectionsAllowed: false,
    },
  },
  GR: {
    governmentType: "parliamentaryRepublic",
    regionLabel: "Region",
    legislature: {
      name: "Hellenic Parliament",
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
        labelPlural: "Prime Ministers",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "president",
        label: "President",
        labelPlural: "Presidents",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "deputy",
        label: "Deputy",
        labelPlural: "Deputies",
        chamberKey: "vouli",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "centralBankChair",
        label: "Governor of the Bank of Greece",
        labelPlural: "Governors of the Bank of Greece",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
  },
  AT: {
    governmentType: "parliamentaryRepublic",
    regionLabel: "Region",
    legislature: {
      name: "Nationalrat",
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
        labelPlural: "Chancellors",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "president",
        label: "President",
        labelPlural: "Presidents",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "deputy",
        label: "Deputy",
        labelPlural: "Deputies",
        chamberKey: "nationalrat",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "centralBankChair",
        label: "Governor of the Oesterreichische Nationalbank",
        labelPlural: "Governors of the Oesterreichische Nationalbank",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
  },
  FI: {
    governmentType: "parliamentaryRepublic",
    regionLabel: "Region",
    legislature: {
      name: "Eduskunta",
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
        labelPlural: "Prime Ministers",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "president",
        label: "President",
        labelPlural: "Presidents",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "deputy",
        label: "Member of Parliament",
        labelPlural: "Members of Parliament",
        chamberKey: "eduskunta",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "centralBankChair",
        label: "Governor of the Bank of Finland",
        labelPlural: "Governors of the Bank of Finland",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: true,
    },
  },
  DD: {
    governmentType: "onePartyState",
    regionLabel: "Region",
    legislature: {
      name: "Volkskammer",
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
        labelPlural: "General Secretaries",
        isExecutive: true,
        isSubNational: false,
      },
      {
        key: "chairmanOfStateCouncil",
        label: "Chairman of the Council of State",
        labelPlural: "Chairmen of the Council of State",
        isExecutive: true,
        isSubNational: false,
        isHeadOfState: true,
      },
      {
        key: "volkskammerDeputy",
        label: "Deputy",
        labelPlural: "Deputies",
        chamberKey: "volkskammer",
        isExecutive: false,
        isSubNational: false,
      },
      {
        key: "landAssembly",
        label: "Landtag Deputy",
        labelPlural: "Landtag Deputies",
        chamberKey: "landAssembly",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "governor",
        label: "Land First Secretary",
        labelPlural: "Land First Secretaries",
        isExecutive: false,
        isSubNational: true,
      },
      {
        key: "centralBankChair",
        label: "President of the Staatsbank",
        labelPlural: "Presidents of the Staatsbank",
        isExecutive: false,
        isSubNational: false,
      },
    ],
    lowerElectionSystem: {
      snapElectionsAllowed: false,
    },
  },
};

/** Per-era chamber and office overlays, applied by {@link getCountryOfficeConfig}. */
const COUNTRY_OFFICE_ERA_OVERRIDES: Record<
  string,
  Partial<Record<CountryId, Partial<CountryOfficeConfig>>>
> = {
  "2027-default": {
    HU: {
      governmentType: "parliamentaryRepublic",
      legislature: {
        name: "National Assembly",
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
          labelPlural: "Prime Ministers",
          isExecutive: true,
          isSubNational: false,
        },
        {
          key: "president",
          label: "President",
          labelPlural: "Presidents",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
        },
        {
          key: "assemblyDelegate",
          label: "Deputy",
          labelPlural: "Deputies",
          chamberKey: "nationalAssembly",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "centralBankChair",
          label: "Governor of the MNB",
          labelPlural: "Governors of the MNB",
          isExecutive: false,
          isSubNational: false,
        },
      ],
      lowerElectionSystem: {
        snapElectionsAllowed: true,
      },
    },
    RO: {
      governmentType: "presidential",
      legislature: {
        name: "Parliament",
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
          labelPlural: "Presidents",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
        },
        {
          key: "primeMinister",
          label: "Prime Minister",
          labelPlural: "Prime Ministers",
          isExecutive: true,
          isSubNational: false,
        },
        {
          key: "deputy",
          label: "Deputy",
          labelPlural: "Deputies",
          chamberKey: "chamberOfDeputies",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "senator",
          label: "Senator",
          labelPlural: "Senators",
          chamberKey: "senat",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "centralBankChair",
          label: "Governor of the BNR",
          labelPlural: "Governors of the BNR",
          isExecutive: false,
          isSubNational: false,
        },
      ],
      lowerElectionSystem: {
        snapElectionsAllowed: true,
      },
      upperElectionSystem: {
        snapElectionsAllowed: true,
      },
    },
    BG: {
      governmentType: "parliamentaryRepublic",
      legislature: {
        name: "National Assembly",
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
          labelPlural: "Prime Ministers",
          isExecutive: true,
          isSubNational: false,
        },
        {
          key: "president",
          label: "President",
          labelPlural: "Presidents",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
        },
        {
          key: "assemblyDeputy",
          label: "Deputy",
          labelPlural: "Deputies",
          chamberKey: "nationalAssembly",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "centralBankChair",
          label: "Governor of the BNB",
          labelPlural: "Governors of the BNB",
          isExecutive: false,
          isSubNational: false,
        },
      ],
      lowerElectionSystem: {
        snapElectionsAllowed: true,
      },
    },
    PL: {
      governmentType: "parliamentaryRepublic",
      legislature: {
        name: "National Assembly",
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
          labelPlural: "Prime Ministers",
          isExecutive: true,
          isSubNational: false,
        },
        {
          key: "president",
          label: "President",
          labelPlural: "Presidents",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
        },
        {
          key: "sejmDeputy",
          label: "Deputy",
          labelPlural: "Deputies",
          chamberKey: "sejm",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "senator",
          label: "Senator",
          labelPlural: "Senators",
          chamberKey: "senat",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "centralBankChair",
          label: "President of the NBP",
          labelPlural: "Presidents of the NBP",
          isExecutive: false,
          isSubNational: false,
        },
      ],
      lowerElectionSystem: {
        snapElectionsAllowed: true,
      },
      upperElectionSystem: {
        snapElectionsAllowed: true,
      },
    },
    RU: {
      governmentType: "presidential",
      legislature: {
        name: "Federal Assembly",
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
          labelPlural: "Presidents",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
        },
        {
          key: "primeMinister",
          label: "Prime Minister",
          labelPlural: "Prime Ministers",
          isExecutive: true,
          isSubNational: false,
        },
        {
          key: "dumaDeputy",
          label: "Duma Deputy",
          labelPlural: "Duma Deputies",
          chamberKey: "stateDuma",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "federationCouncilMember",
          label: "Federation Council Member",
          labelPlural: "Federation Council Members",
          chamberKey: "federationCouncil",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "centralBankChair",
          label: "Governor of the Bank of Russia",
          labelPlural: "Governors of the Bank of Russia",
          isExecutive: false,
          isSubNational: false,
        },
      ],
      lowerElectionSystem: {
        snapElectionsAllowed: true,
      },
    },
  },
  "1991-default": {
    JP: {
      legislature: {
        name: "Kokkai",
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
    },
    PL: {
      governmentType: "parliamentaryRepublic",
      legislature: {
        name: "National Assembly",
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
          labelPlural: "Prime Ministers",
          isExecutive: true,
          isSubNational: false,
        },
        {
          key: "president",
          label: "President",
          labelPlural: "Presidents",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
        },
        {
          key: "sejmDeputy",
          label: "Deputy",
          labelPlural: "Deputies",
          chamberKey: "sejm",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "senator",
          label: "Senator",
          labelPlural: "Senators",
          chamberKey: "senat",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "centralBankChair",
          label: "President of the NBP",
          labelPlural: "Presidents of the NBP",
          isExecutive: false,
          isSubNational: false,
        },
      ],
      lowerElectionSystem: {
        snapElectionsAllowed: true,
      },
      upperElectionSystem: {
        snapElectionsAllowed: true,
      },
    },
    HU: {
      governmentType: "parliamentaryRepublic",
      legislature: {
        name: "National Assembly",
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
          labelPlural: "Prime Ministers",
          isExecutive: true,
          isSubNational: false,
        },
        {
          key: "president",
          label: "President",
          labelPlural: "Presidents",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
        },
        {
          key: "assemblyDelegate",
          label: "Deputy",
          labelPlural: "Deputies",
          chamberKey: "nationalAssembly",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "centralBankChair",
          label: "Governor of the MNB",
          labelPlural: "Governors of the MNB",
          isExecutive: false,
          isSubNational: false,
        },
      ],
      lowerElectionSystem: {
        snapElectionsAllowed: true,
      },
    },
    CS: {
      governmentType: "parliamentaryRepublic",
      legislature: {
        name: "Federal Assembly",
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
          labelPlural: "Prime Ministers",
          isExecutive: true,
          isSubNational: false,
        },
        {
          key: "president",
          label: "President",
          labelPlural: "Presidents",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
        },
        {
          key: "assemblyDeputy",
          label: "Deputy",
          labelPlural: "Deputies",
          chamberKey: "chamberOfThePeople",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "nationsDeputy",
          label: "Deputy of Nations",
          labelPlural: "Deputies of Nations",
          chamberKey: "chamberOfNations",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "centralBankChair",
          label: "Governor of the SBČS",
          labelPlural: "Governors of the SBČS",
          isExecutive: false,
          isSubNational: false,
        },
      ],
      lowerElectionSystem: {
        snapElectionsAllowed: true,
      },
      upperElectionSystem: {
        snapElectionsAllowed: true,
      },
    },
    BG: {
      governmentType: "parliamentaryRepublic",
      legislature: {
        name: "Grand National Assembly",
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
          labelPlural: "Prime Ministers",
          isExecutive: true,
          isSubNational: false,
        },
        {
          key: "president",
          label: "President",
          labelPlural: "Presidents",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
        },
        {
          key: "assemblyDeputy",
          label: "Deputy",
          labelPlural: "Deputies",
          chamberKey: "nationalAssembly",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "centralBankChair",
          label: "Governor of the BNB",
          labelPlural: "Governors of the BNB",
          isExecutive: false,
          isSubNational: false,
        },
      ],
      lowerElectionSystem: {
        snapElectionsAllowed: true,
      },
    },
    YU: {
      governmentType: "parliamentaryRepublic",
      legislature: {
        name: "Federal Assembly",
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
          labelPlural: "Prime Ministers",
          isExecutive: true,
          isSubNational: false,
        },
        {
          key: "president",
          label: "Chair of the Presidency",
          labelPlural: "Chairs of the Presidency",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
        },
        {
          key: "assemblyDelegate",
          label: "Federal Delegate",
          labelPlural: "Federal Delegates",
          chamberKey: "federalAssembly",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "councilDelegate",
          label: "Republic or Province Delegate",
          labelPlural: "Republic or Province Delegates",
          chamberKey: "councilRepublicsProvinces",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "centralBankChair",
          label: "Governor of the NBY",
          labelPlural: "Governors of the NBY",
          isExecutive: false,
          isSubNational: false,
        },
      ],
    },
    RO: {
      governmentType: "presidential",
      legislature: {
        name: "Constituent Parliament",
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
          labelPlural: "Presidents",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
        },
        {
          key: "primeMinister",
          label: "Prime Minister",
          labelPlural: "Prime Ministers",
          isExecutive: true,
          isSubNational: false,
        },
        {
          key: "deputy",
          label: "Deputy",
          labelPlural: "Deputies",
          chamberKey: "chamberOfDeputies",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "senator",
          label: "Senator",
          labelPlural: "Senators",
          chamberKey: "senat",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "centralBankChair",
          label: "Governor of the BNR",
          labelPlural: "Governors of the BNR",
          isExecutive: false,
          isSubNational: false,
        },
      ],
      upperElectionSystem: {
        snapElectionsAllowed: false,
      },
    },
    RU: {
      governmentType: "parliamentaryRepublic",
      regionLabel: "Economic Region",
      legislature: {
        name: "Congress of People's Deputies of the Soviet Union",
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
          labelPlural: "Chairmen of the Cabinet of Ministers",
          isExecutive: true,
          isSubNational: false,
        },
        {
          key: "sovietPresident",
          label: "President of the Soviet Union",
          labelPlural: "Presidents of the Soviet Union",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
        },
        {
          key: "unionCongressDeputy",
          label: "Union People's Deputy",
          labelPlural: "Union People's Deputies",
          chamberKey: "unionCongress",
          isExecutive: false,
          isSubNational: false,
        },
      ],
      upperElectionSystem: undefined,
    },
  },
  "1953-default": {
    US: {
      legislature: {
        name: "Congress",
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
      legislature: {
        name: "Grand National Assembly",
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
          labelPlural: "Prime Ministers",
          isExecutive: true,
          isSubNational: false,
        },
        {
          key: "president",
          label: "President",
          labelPlural: "Presidents",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
        },
        {
          key: "deputy",
          label: "Deputy",
          labelPlural: "Deputies",
          chamberKey: "milletMeclisi",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "centralBankChair",
          label: "Governor of the Central Bank of Turkey",
          labelPlural: "Governors of the Central Bank of Turkey",
          isExecutive: false,
          isSubNational: false,
        },
      ],
      upperElectionSystem: undefined,
    },
    GR: {
      governmentType: "parliamentaryMonarchy",
      officeTypes: [
        {
          key: "primeMinister",
          label: "Prime Minister",
          labelPlural: "Prime Ministers",
          isExecutive: true,
          isSubNational: false,
        },
        {
          key: "deputy",
          label: "Deputy",
          labelPlural: "Deputies",
          chamberKey: "vouli",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "centralBankChair",
          label: "Governor of the Bank of Greece",
          labelPlural: "Governors of the Bank of Greece",
          isExecutive: false,
          isSubNational: false,
        },
      ],
    },
    AT: {
      legislature: {
        name: "Nationalrat",
        lowerChamber: {
          key: "nationalrat",
          name: "Nationalrat",
          shortName: "Nationalrat",
          seats: 165,
          description:
            "165 deputies of the Nationalrat (the pre-1971 chamber size), elected by proportional representation under the ÖVP–SPÖ grand coalition.",
        },
      },
    },
    FR: {
      governmentType: "parliamentaryRepublic",
      legislature: {
        name: "Parliament",
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
          labelPlural: "Presidents of the Council",
          isExecutive: true,
          isSubNational: false,
        },
        {
          key: "president",
          label: "President",
          labelPlural: "Presidents",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
        },
        {
          key: "deputy",
          label: "Deputy",
          labelPlural: "Deputies",
          chamberKey: "assembleeNationale",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "senator",
          label: "Councillor of the Republic",
          labelPlural: "Councillors of the Republic",
          chamberKey: "senat",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "centralBankChair",
          label: "Governor of the Banque de France",
          labelPlural: "Governors of the Banque de France",
          isExecutive: false,
          isSubNational: false,
        },
      ],
    },
    ES: {
      governmentType: "onePartyState",
      regionLabel: "Province",
      legislature: {
        name: "Cortes Españolas",
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
          labelPlural: "Caudillos",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
        },
        {
          key: "procurador",
          label: "Procurador",
          labelPlural: "Procuradores",
          chamberKey: "congresoDiputados",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "centralBankChair",
          label: "Governor of the Banco de España",
          labelPlural: "Governors of the Banco de España",
          isExecutive: false,
          isSubNational: false,
        },
      ],
      lowerElectionSystem: {
        snapElectionsAllowed: false,
      },
      upperElectionSystem: undefined,
    },
    SE: {
      legislature: {
        name: "Riksdag",
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
          labelPlural: "Prime Ministers",
          isExecutive: true,
          isSubNational: false,
        },
        {
          key: "monarch",
          label: "King",
          labelPlural: "Kings",
          isExecutive: true,
          isSubNational: false,
          isHeadOfState: true,
        },
        {
          key: "member",
          label: "Member of the Second Chamber",
          labelPlural: "Members of the Second Chamber",
          chamberKey: "riksdag",
          isExecutive: false,
          isSubNational: false,
        },
        {
          key: "centralBankChair",
          label: "Governor of the Riksbank",
          labelPlural: "Governors of the Riksbank",
          isExecutive: false,
          isSubNational: false,
        },
      ],
    },
    UK: {
      legislature: {
        name: "Parliament",
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
    },
    IT: {
      legislature: {
        name: "Parliament",
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
    },
    DE: {
      legislature: {
        name: "Bundestag",
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
    },
    JP: {
      legislature: {
        name: "Kokkai",
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
    },
    IE: {
      legislature: {
        name: "Oireachtas",
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
    },
    BR: {
      legislature: {
        name: "National Congress",
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
    },
    CN: {
      legislature: {
        name: "National People's Congress",
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
    },
    NG: {
      legislature: {
        name: "National Assembly",
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
    },
    RU: {
      legislature: {
        name: "Supreme Soviet",
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
    },
  },
};

/** Client-safe office config for a country, honoring a preset's overlays. */
export function getCountryOfficeConfig(id: CountryId, preset?: string): CountryOfficeConfig {
  const base = COUNTRY_OFFICES[id];
  const override = preset ? COUNTRY_OFFICE_ERA_OVERRIDES[preset]?.[id] : undefined;
  if (!override) return base;
  return { ...base, ...override };
}

/** `COUNTRY_OFFICES[id].officeTypes` entry for one office key, or undefined. */
export function getCountryOfficeType(
  id: CountryId,
  officeKey: string
): CountryOfficeTypeConfig | undefined {
  return COUNTRY_OFFICES[id].officeTypes.find((o) => o.key === officeKey);
}

/**
 * The office type of each country's regional chief executive. Countries the
 * registry does not list fall back to the US-style "governor" key.
 */
const REGIONAL_BILL_ASSENT_OFFICE_KEY: Partial<Record<CountryId, string>> = {
  US: "governor",
  UK: "governor",
  JP: "governor",
  IE: "governor",
  DE: "ministerPresident",
  RU: "governor",
  DD: "governor",
};

/** The officeType key of the country's regional chief executive. */
export function getRegionalExecutiveOfficeKey(countryId: CountryId): string {
  return REGIONAL_BILL_ASSENT_OFFICE_KEY[countryId] ?? "governor";
}

/** Short label for the regional chief executive who signs or vetoes regional bills. */
export function getRegionalBillAssentTitle(countryId: CountryId): string {
  const cfg = COUNTRY_OFFICES[countryId];
  if (cfg.regionalBillAssentTitle) return cfg.regionalBillAssentTitle;
  const key = REGIONAL_BILL_ASSENT_OFFICE_KEY[countryId];
  const office = key ? cfg.officeTypes.find((o) => o.key === key) : undefined;
  return office?.label ?? "Governor";
}

/** The United Kingdom's id, for the region-specific executive titles below. */
const UK_COUNTRY_ID: CountryId = "UK";

/**
 * Region-aware regional-executive label. Two countries give particular regions
 * a distinct title (London's mayor, Ireland's lord mayors and mayors), so the
 * plain country title is not always what the page should print.
 */
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
