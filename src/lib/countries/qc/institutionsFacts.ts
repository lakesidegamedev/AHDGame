import type { Branch } from "@/lib/constants/military";

import type { CountryConfig } from "@/lib/constants/countries";

/**
 * Quebec's institutions as pure data: the latent successor a passed
 * sovereignty referendum stands up. Keep this file free of value imports.
 * The 125-seat National Assembly is Quebec's real size; seats follow each
 * region's vote, as Canada's Commons does. Quebec keeps the Canadian dollar.
 */
export const QC_CONFIG: CountryConfig = {
  id: "QC",
  name: "Quebec",
  flagEmoji: "⚜️",
  code: "QC",
  socialAxisBaseline: -2,
  regionLabel: "Region",
  regionLabelPlural: "Regions",
  executiveTitle: "Premier",
  executiveRealmPhrase: "Quebec",
  governmentType: "parliamentaryRepublic",
  governmentTypeLabel: "Parliamentary Republic",
  coalitionThreshold: 63,
  legislature: {
    name: "National Assembly",
    path: "/country/qc/legislature",
    bicameral: false,
    lowerChamber: {
      key: "qcAssembly",
      name: "National Assembly",
      shortName: "Assembly",
      seats: 125,
      description:
        "125 members elected across Quebec's regions, seats shared by each region's vote.",
      elected: true,
    },
  },
  lowerElectionSystem: {
    termYears: 4,
    seatsContested: "all",
    singleMemberConstituencies: false,
    snapElectionsAllowed: true,
  },
  subNationalChamber: {
    key: "regionalCouncil",
    name: "Regional Council",
    shortName: "Council",
    seats: 100,
    description: "Elected councillors representing Quebec's eight regions.",
    regionalModel: true,
  },
  regionalBillAssentTitle: "Prefect",
  electionSystems: {
    lowerChamber: "pr_hareQuota",
    subNationalChamber: "pr_hareQuota",
    headOfGovernment: "parliamentary",
    headOfState: "ceremonial",
  },
  officeTypes: [
    {
      // Keyed firstMinister so independence carries the sitting Premier over
      // as caretaker head of government, as it does for Scotland and Wales.
      key: "firstMinister",
      label: "Premier",
      labelPlural: "Premiers",
      isExecutive: true,
      isSubNational: false,
      actionBonus: 4,
      partyStrengthWeight: 1,
    },
    {
      key: "qcAssembly",
      label: "Member of the National Assembly",
      labelPlural: "Members of the National Assembly",
      chamberKey: "qcAssembly",
      isExecutive: false,
      isSubNational: false,
      termYears: 4,
      actionBonus: 1,
      partyStrengthWeight: 0.85,
    },
    {
      key: "governor",
      label: "Prefect",
      labelPlural: "Prefects",
      isExecutive: false,
      isSubNational: true,
      termYears: 4,
      actionBonus: 2,
      partyStrengthWeight: 1,
    },
    {
      key: "regionalCouncil",
      label: "Regional Councillor",
      labelPlural: "Regional Councillors",
      chamberKey: "regionalCouncil",
      isExecutive: false,
      isSubNational: true,
      termYears: 4,
      actionBonus: 1,
      partyStrengthWeight: 0.85,
    },
    {
      key: "centralBankChair",
      label: "Governor of the Bank of Canada",
      labelPlural: "Governors of the Bank of Canada",
      isExecutive: false,
      isSubNational: false,
      termYears: 4,
      actionBonus: 3,
      partyStrengthWeight: 0,
    },
  ],
  // Only the Quebec-homed sovereigntist party carries over intact; Canada-wide
  // parties lose their Quebec branches and players re-form them.
  majorPartyIds: ["AL"],
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
    sharedBankId: "CA",
    heroImage: "/api/images/hero/bank-of-canada",
  },
  exchangeName: "Montreal Exchange",
  usdExchangeRate: 1,
  currencyCode: "CAD",
  fiscalYearStartTurnInYear: 40,
  financeMinisterCabinetId: "financeSecretary",
  status: "coming-soon",
  tagline:
    "A sovereign Quebec: a single-chamber National Assembly, a Premier who must hold it, and a Canadian-dollar economy.",
  descriptor:
    "A parliamentary republic where the Premier governs through a majority of the 125-seat National Assembly, elected across Quebec's eight regions.",
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Flag_of_Quebec.svg/500px-Flag_of_Quebec.svg.png",
  entryPath: "/country/qc",
  overviewPath: "/country/qc",
  mapPath: "/country/qc/map",
  executivePath: "/country/qc/executive",
  executiveLabel: "Office of the Premier",
  centralGovernmentLabel: "Quebec Treasury",
};

/* No QC_LEGISLATIVE_PROCESS: readers fall through to DEFAULT_PROCESS, as for Scotland. */

/* No QC_ORDERS_OF_BATTLE: getOrderOfBattle returns null. */

export const QC_MILITARY_BRANCHES: Branch[] = [];

/* No QC_ESTATE_PORTFOLIO: seedCabinetEstates skips the country. */

/** Cabinet seat ids that fill cross-country roles. */
export const QC_CABINET_SEAT_IDS = {
  energy: "netZeroSecretary",
  infrastructure: "transportSecretary",
  defense: null,
  foreignAffairs: null,
  tradeMinister: null,
} as const;

/** Military scale multiplier. */
export const QC_MILITARY_SCALE = 1;
