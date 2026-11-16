import type { Branch } from "@/lib/constants/military";

import type { CountryConfig } from "@/lib/constants/countries";

/**
 * Alberta's institutions as pure data: the latent successor a passed
 * sovereignty referendum stands up. Keep this file free of value imports.
 * The 87-seat Legislative Assembly is Alberta's real size; seats follow each
 * region's vote, as Canada's Commons does. Alberta keeps the Canadian dollar.
 */
export const AB_CONFIG: CountryConfig = {
  id: "AB",
  name: "Alberta",
  flagEmoji: "🌾",
  code: "AB",
  socialAxisBaseline: 0.5,
  regionLabel: "Region",
  regionLabelPlural: "Regions",
  executiveTitle: "Premier",
  executiveRealmPhrase: "Alberta",
  governmentType: "parliamentaryRepublic",
  governmentTypeLabel: "Parliamentary Republic",
  coalitionThreshold: 44,
  legislature: {
    name: "Legislative Assembly",
    path: "/country/ab/legislature",
    bicameral: false,
    lowerChamber: {
      key: "abAssembly",
      name: "Legislative Assembly",
      shortName: "Assembly",
      seats: 87,
      description:
        "87 members elected across Alberta's regions, seats shared by each region's vote.",
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
    description: "Elected councillors representing Alberta's six regions.",
    regionalModel: true,
  },
  regionalBillAssentTitle: "Commissioner",
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
      key: "abAssembly",
      label: "Member of the Legislative Assembly",
      labelPlural: "Members of the Legislative Assembly",
      chamberKey: "abAssembly",
      isExecutive: false,
      isSubNational: false,
      termYears: 4,
      actionBonus: 1,
      partyStrengthWeight: 0.85,
    },
    {
      key: "governor",
      label: "Commissioner",
      labelPlural: "Commissioners",
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
  // Only the Alberta-homed sovereigntist party carries over intact; Canada-wide
  // parties lose their Alberta branches and players re-form them.
  majorPartyIds: ["ASP"],
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
  exchangeName: "Alberta Securities Exchange",
  usdExchangeRate: 1,
  currencyCode: "CAD",
  fiscalYearStartTurnInYear: 40,
  financeMinisterCabinetId: "financeSecretary",
  status: "coming-soon",
  tagline:
    "A sovereign Alberta: a single-chamber Legislative Assembly, a Premier who must hold it, and a Canadian-dollar economy.",
  descriptor:
    "A parliamentary republic where the Premier governs through a majority of the 87-seat Legislative Assembly, elected across Alberta's six regions.",
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Flag_of_Alberta.svg/500px-Flag_of_Alberta.svg.png",
  entryPath: "/country/ab",
  overviewPath: "/country/ab",
  mapPath: "/country/ab/map",
  executivePath: "/country/ab/executive",
  executiveLabel: "Office of the Premier",
  centralGovernmentLabel: "Alberta Treasury",
};

/* No AB_LEGISLATIVE_PROCESS: readers fall through to DEFAULT_PROCESS, as for Scotland. */

/* No AB_ORDERS_OF_BATTLE: getOrderOfBattle returns null. */

export const AB_MILITARY_BRANCHES: Branch[] = [];

/* No AB_ESTATE_PORTFOLIO: seedCabinetEstates skips the country. */

/** Cabinet seat ids that fill cross-country roles. */
export const AB_CABINET_SEAT_IDS = {
  energy: "netZeroSecretary",
  infrastructure: "transportSecretary",
  defense: null,
  foreignAffairs: "externalAffairsSecretary",
  tradeMinister: null,
} as const;

/** Military scale multiplier. */
export const AB_MILITARY_SCALE = 1;
