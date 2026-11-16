import type { Branch } from "@/lib/constants/military";

import type { CountryConfig } from "@/lib/constants/countries";

/**
 * California's institutions as pure data: the latent successor a passed
 * sovereignty referendum stands up. Keep this file free of value imports.
 * The 80-seat Assembly mirrors the California Assembly; seats follow each
 * region's vote, as the US House does. California keeps the US dollar.
 */
export const RCA_CONFIG: CountryConfig = {
  id: "RCA",
  name: "California Republic",
  flagEmoji: "🐻",
  code: "RCA",
  socialAxisBaseline: 0.5,
  regionLabel: "Region",
  regionLabelPlural: "Regions",
  executiveTitle: "Premier",
  executiveRealmPhrase: "California",
  governmentType: "parliamentaryRepublic",
  governmentTypeLabel: "Parliamentary Republic",
  coalitionThreshold: 76,
  legislature: {
    name: "Assembly",
    path: "/country/rca/legislature",
    bicameral: false,
    lowerChamber: {
      key: "rcaAssembly",
      name: "Assembly",
      shortName: "Assembly",
      seats: 80,
      description:
        "80 members elected across California's regions, seats shared by each region's vote.",
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
    seats: 60,
    description: "Elected councillors representing California's six regions.",
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
      key: "rcaAssembly",
      label: "Representative",
      labelPlural: "Representatives",
      chamberKey: "rcaAssembly",
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
      label: "Federal Reserve Chair",
      labelPlural: "Federal Reserve Chairs",
      isExecutive: false,
      isSubNational: false,
      termYears: 4,
      actionBonus: 3,
      partyStrengthWeight: 0,
    },
  ],
  // Only the California-homed independence party carries over intact; national
  // parties lose their California branches and players re-form them.
  majorPartyIds: ["BFI"],
  partyCreationNPPs: {
    statesRequired: 2,
    lockHomeState: false,
    nppsPerState: 1,
  },
  centralBank: {
    name: "Federal Reserve",
    abbreviation: "Fed",
    chairTitle: "Federal Reserve Chair",
    defaultPrimeRate: 3,
    sharedBankId: "US",
    heroImage: "/api/images/hero/federal-reserve",
  },
  exchangeName: "California Stock Exchange",
  usdExchangeRate: 1,
  currencyCode: "USD",
  fiscalYearStartTurnInYear: 40,
  financeMinisterCabinetId: "financeSecretary",
  status: "coming-soon",
  tagline:
    "A sovereign California: a single-chamber Assembly, a Premier who must hold it, and a US-dollar economy.",
  descriptor:
    "A parliamentary republic where the Premier governs through a majority of the 80-seat Assembly, elected across California's six regions.",
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Flag_of_California.svg/500px-Flag_of_California.svg.png",
  entryPath: "/country/rca",
  overviewPath: "/country/rca",
  mapPath: "/country/rca/map",
  executivePath: "/country/rca/executive",
  executiveLabel: "Office of the Premier",
  centralGovernmentLabel: "California Treasury",
};

/* No RCA_LEGISLATIVE_PROCESS: readers fall through to DEFAULT_PROCESS, as for Scotland. */

/* No RCA_ORDERS_OF_BATTLE: getOrderOfBattle returns null. */

export const RCA_MILITARY_BRANCHES: Branch[] = [];

/* No RCA_ESTATE_PORTFOLIO: seedCabinetEstates skips the country. */

/** Cabinet seat ids that fill cross-country roles. */
export const RCA_CABINET_SEAT_IDS = {
  energy: "netZeroSecretary",
  infrastructure: "transportSecretary",
  defense: null,
  foreignAffairs: "externalAffairsSecretary",
  tradeMinister: null,
} as const;

/** Military scale multiplier. */
export const RCA_MILITARY_SCALE = 1;
