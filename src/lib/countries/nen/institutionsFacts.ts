import type { Branch } from "@/lib/constants/military";

import type { CountryConfig } from "@/lib/constants/countries";

/**
 * New England's institutions as pure data: the latent successor a passed
 * sovereignty referendum stands up. Keep this file free of value imports.
 * The 90-seat Assembly is elected by population; seats follow each
 * region's vote, as the US House does. New England keeps the US dollar.
 */
export const NEN_CONFIG: CountryConfig = {
  id: "NEN",
  name: "New England",
  flagEmoji: "🌲",
  code: "NEN",
  socialAxisBaseline: 0.5,
  regionLabel: "Region",
  regionLabelPlural: "Regions",
  executiveTitle: "Premier",
  executiveRealmPhrase: "New England",
  governmentType: "parliamentaryRepublic",
  governmentTypeLabel: "Parliamentary Republic",
  coalitionThreshold: 76,
  legislature: {
    name: "Assembly",
    path: "/country/nen/legislature",
    bicameral: false,
    lowerChamber: {
      key: "nenAssembly",
      name: "Assembly",
      shortName: "Assembly",
      seats: 90,
      description:
        "90 members elected across New England's regions, seats shared by each region's vote.",
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
    description: "Elected councillors representing New England's six regions.",
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
      key: "nenAssembly",
      label: "Representative",
      labelPlural: "Representatives",
      chamberKey: "nenAssembly",
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
  // Only the New England-homed independence party carries over intact; national
  // parties lose their New England branches and players re-form them.
  majorPartyIds: ["NEI"],
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
  exchangeName: "New England Stock Exchange",
  usdExchangeRate: 1,
  currencyCode: "USD",
  fiscalYearStartTurnInYear: 40,
  financeMinisterCabinetId: "financeSecretary",
  status: "coming-soon",
  tagline:
    "A sovereign New England: a single-chamber Assembly, a Premier who must hold it, and a US-dollar economy.",
  descriptor:
    "A parliamentary republic where the Premier governs through a majority of the 90-seat Assembly, elected across New England's six regions.",
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Flag_of_New_England.svg/500px-Flag_of_New_England.svg.png",
  entryPath: "/country/nen",
  overviewPath: "/country/nen",
  mapPath: "/country/nen/map",
  executivePath: "/country/nen/executive",
  executiveLabel: "Office of the Premier",
  centralGovernmentLabel: "New England Treasury",
};

/* No NEN_LEGISLATIVE_PROCESS: readers fall through to DEFAULT_PROCESS, as for Scotland. */

/* No NEN_ORDERS_OF_BATTLE: getOrderOfBattle returns null. */

export const NEN_MILITARY_BRANCHES: Branch[] = [];

/* No NEN_ESTATE_PORTFOLIO: seedCabinetEstates skips the country. */

/** Cabinet seat ids that fill cross-country roles. */
export const NEN_CABINET_SEAT_IDS = {
  energy: "netZeroSecretary",
  infrastructure: "transportSecretary",
  defense: null,
  foreignAffairs: "externalAffairsSecretary",
  tradeMinister: null,
} as const;

/** Military scale multiplier. */
export const NEN_MILITARY_SCALE = 1;
