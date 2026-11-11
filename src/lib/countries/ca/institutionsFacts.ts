import type { Branch } from "@/lib/constants/military";
import type { CabinetGroup } from "@/lib/constants/cabinetPositionGroups";
import type { CountryConfig } from "@/lib/constants/countries";
import type { LegislativeProcess } from "@/lib/legislature/process";
import type { OrderOfBattleEntry } from "@/lib/seeds/reference/ordersOfBattle";

/**
 * Canada's institutions, as pure data.
 *
 * KEEP THIS FILE FREE OF VALUE IMPORTS: it is the light half of the pair.
 * Registries wanting one seat id import from here; `institutions.ts` composes
 * these with the cabinet and is heavy. `clientSafeLeafModules.test.ts` enforces
 * it.
 *
 * Westminster system: the Prime Minister commands the confidence of the
 * 343-seat House of Commons (172 seats is a majority), the Governor General
 * gives assent on the Crown's behalf, and the 105-seat Senate is appointed.
 */

export const CA_CONFIG: CountryConfig = {
  id: "CA",
  seedEconomicModel: {
    "2019": "resourceExtraction",
  },
  name: "Canada",
  flagEmoji: "🇨🇦",
  code: "CA",
  socialAxisBaseline: -1.5,
  regionLabel: "Province",
  regionLabelPlural: "Provinces & Territories",
  executiveTitle: "Prime Minister",
  executiveRealmPhrase: "Canada",
  governmentType: "parliamentaryMonarchy",
  governmentTypeLabel: "Federal Parliamentary Monarchy",
  coalitionThreshold: 172,
  legislature: {
    name: "Parliament",
    path: "/country/ca/legislature",
    bicameral: false,
    upperChamber: {
      key: "caSenate",
      name: "Senate",
      shortName: "Senate",
      seats: 105,
      description:
        "105 appointed senators, apportioned by region. Revises and delays legislation but rarely defeats the elected House.",
    },
    lowerChamber: {
      key: "caCommons",
      name: "House of Commons",
      shortName: "Commons",
      seats: 343,
      description:
        "343 elected MPs from single-member ridings across 13 provinces and territories. The primary legislative chamber.",
    },
  },
  lowerElectionSystem: {
    termYears: 4,
    seatsContested: "all",
    singleMemberConstituencies: true,
    snapElectionsAllowed: true,
  },
  electionSystems: {
    // Regions elect many MPs each, so seats are allocated by regional vote share
    // (the same approximation the UK Commons uses), not by one winner per region.
    lowerChamber: "pr_hareQuota",
    subNationalChamber: "fptp",
    subNationalExecutive: "parliamentary",
    headOfGovernment: "parliamentary",
    headOfState: "ceremonial",
  },
  subNationalChamber: {
    key: "provincialLegislature",
    name: "Provincial Legislature",
    shortName: "Provincial Legislature",
    seats: 778,
    description:
      "Elected members of the provincial and territorial legislatures, on fixed four-year terms.",
    regionalModel: true,
  },
  regionalBillAssentTitle: "Premier",
  officeTypes: [
    {
      key: "primeMinister",
      label: "Prime Minister",
      labelPlural: "Prime Ministers",
      isExecutive: true,
      isSubNational: false,
      actionBonus: 4,
      partyStrengthWeight: 1,
    },
    {
      key: "caCommons",
      label: "Member of Parliament",
      labelPlural: "Members of Parliament",
      chamberKey: "caCommons",
      isExecutive: false,
      isSubNational: false,
      termYears: 4,
      actionBonus: 1,
      partyStrengthWeight: 0.85,
    },
    {
      key: "provincialLegislature",
      label: "Member of the Provincial Legislature",
      labelPlural: "Members of the Provincial Legislatures",
      chamberKey: "provincialLegislature",
      isExecutive: false,
      isSubNational: true,
      termYears: 4,
      actionBonus: 1,
      partyStrengthWeight: 0.85,
    },
    {
      key: "governor",
      label: "Premier",
      labelPlural: "Premiers",
      isExecutive: false,
      isSubNational: true,
      termYears: 4,
      actionBonus: 2,
      partyStrengthWeight: 1,
    },
    {
      key: "centralBankChair",
      label: "Governor of the Bank of Canada",
      labelPlural: "Governors of the Bank of Canada",
      isExecutive: false,
      isSubNational: false,
      termYears: 7,
      actionBonus: 3,
      partyStrengthWeight: 0,
    },
  ],
  majorPartyIds: ["FUP", "NPA"],
  partyCreationNPPs: {
    statesRequired: 2,
    lockHomeState: false,
    nppsPerState: 1,
  },
  centralBank: {
    name: "Bank of Canada",
    abbreviation: "BoC",
    chairTitle: "Governor of the Bank of Canada",
    defaultPrimeRate: 2.25,
  },
  exchangeName: "TSX",
  usdExchangeRate: 1,
  currencyCode: "CAD",
  fiscalYearStartTurnInYear: 40,
  financeMinisterCabinetId: "minister_of_finance",
  status: "beta",
  tagline:
    "Westminster federalism: 343 ridings across 13 provinces and territories, an appointed Senate, and a Prime Minister who must hold the House.",
  descriptor:
    "A federal parliamentary monarchy where the Prime Minister leads the government through the confidence of the 343-seat House of Commons, provinces hold wide powers, and Quebec's place in the federation is never settled.",
  heroImage: "https://flagcdn.com/w640/ca.png",
  entryPath: "/country/ca",
  overviewPath: "/country/ca",
  mapPath: "/country/ca/map",
  executivePath: "/country/ca/executive",
  executiveLabel: "Office of the Prime Minister",
  centralGovernmentLabel: "Federal Funding",
  imperialTitles: {
    male: "King",
    female: "Queen",
    nonbinary: "Monarch",
  },
  imperialPossessives: {
    male: "His Majesty's",
    female: "Her Majesty's",
    nonbinary: "The Monarch's",
  },
};

export const CA_LEGISLATIVE_PROCESS: LegislativeProcess = {
  executive: {
    title: "The Crown",
    canVeto: false,
    signLabel: "Royal Assent",
    signNote:
      "The Governor General grants Royal Assent on the Crown's behalf. It is a constitutional formality.",
    override: null,
  },
  upperNote:
    "The Senate may amend or delay a bill, but an appointed chamber rarely defeats the elected House, and it does not originate money bills.",
  dissolution: {
    actor: "Prime Minister",
    body: "The PM may ask the Governor General to dissolve Parliament and call a snap general election. Bills still in progress fall.",
  },
  quirks: [
    {
      icon: "building",
      title: "Confidence",
      body: "A government that loses a confidence vote in the House must resign or ask for dissolution.",
    },
    {
      icon: "bolt",
      title: "Snap election",
      body: "A PM-called general election dissolves Parliament and kills all active legislation.",
    },
    {
      icon: "doc",
      title: "Appointed Senate",
      body: "Senators are appointed on the Prime Minister's advice and sit until 75. The Senate revises rather than blocks.",
    },
  ],
  seatingStyle: "benches",
};

export const CA_ORDERS_OF_BATTLE: OrderOfBattleEntry[] = [
  { branchId: "army", type: "Mechanized Brigade", count: 3 },
  { branchId: "army", type: "Artillery Regiment", count: 2 },
  { branchId: "navy", type: "Frigate Squadron", count: 3 },
  { branchId: "navy", type: "Attack Submarine", count: 2 },
  { branchId: "air_force", type: "Fighter Wing", count: 3 },
  { branchId: "air_force", type: "Airlift Wing", count: 1 },
  { branchId: "air_force", type: "Air Defense Wing", count: 1 },
];

export const CA_MILITARY_BRANCHES: Branch[] = [
  { id: "army", name: "Canadian Army", abbr: "Army", domain: "ground" },
  { id: "navy", name: "Royal Canadian Navy", abbr: "RCN", domain: "naval" },
  { id: "air_force", name: "Royal Canadian Air Force", abbr: "RCAF", domain: "air" },
];

export const CA_ESTATE_PORTFOLIO: Record<string, string> = {
  minister_of_foreign_affairs: "foreign",
  minister_of_public_safety: "homeland",
  minister_of_justice: "justice",
  minister_of_health: "health",
  minister_of_education_and_skills: "education",
  minister_of_industry: "commerce",
  minister_of_housing: "housing",
  minister_of_environment: "interior",
  minister_of_labour: "labor",
};

/**
 * Cabinet seat ids: which of this country's positions fills a cross-country
 * role. The cabinet itself is authored in the executive module.
 */
export const CA_CABINET_SEAT_IDS = {
  energy: "minister_of_natural_resources",
  infrastructure: "minister_of_infrastructure",
  defense: "minister_of_national_defence",
  foreignAffairs: "minister_of_foreign_affairs",
  tradeMinister: "minister_of_international_trade",
} as const;

/** Military scale multiplier: a mid-sized NATO force, below the UK. */
export const CA_MILITARY_SCALE = 0.9;

/** Which office assents to provincial bills. */
export const CA_REGIONAL_BILL_ASSENT_OFFICE_KEY = "governor";

export const CA_CABINET_GROUPS: Record<string, CabinetGroup> = {
  director_of_intelligence: "Security & Foreign",
  deputy_prime_minister: "Centre",
  minister_of_finance: "Economy",
  minister_of_industry: "Economy",
  minister_of_international_trade: "Economy",
  minister_of_labour: "Economy",
  minister_of_natural_resources: "Economy",
  minister_of_foreign_affairs: "Security & Foreign",
  minister_of_public_safety: "Security & Foreign",
  minister_of_national_defence: "Security & Foreign",
  minister_of_justice: "Security & Foreign",
  minister_of_health: "Society",
  minister_of_education_and_skills: "Society",
  minister_of_housing: "Society",
  minister_of_infrastructure: "Domestic",
  minister_of_agriculture: "Domestic",
  minister_of_environment: "Domestic",
  minister_of_intergovernmental_affairs: "Nations",
  government_house_leader: "Centre",
};
