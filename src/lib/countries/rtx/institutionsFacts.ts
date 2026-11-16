import type { Branch } from "@/lib/constants/military";

import type { CountryConfig } from "@/lib/constants/countries";

/**
 * Texas's institutions as pure data: the latent successor a passed
 * sovereignty referendum stands up. Keep this file free of value imports.
 * The 150-seat House mirrors the Texas House; seats follow each
 * region's vote, as the US House does. Texas keeps the US dollar.
 */
export const RTX_CONFIG: CountryConfig = {
  id: "RTX",
  name: "Republic of Texas",
  flagEmoji: "⭐",
  code: "RTX",
  socialAxisBaseline: 0.5,
  regionLabel: "Region",
  regionLabelPlural: "Regions",
  executiveTitle: "Chief Minister",
  executiveRealmPhrase: "Texas",
  governmentType: "parliamentaryRepublic",
  governmentTypeLabel: "Parliamentary Republic",
  coalitionThreshold: 76,
  legislature: {
    name: "House of Representatives",
    path: "/country/rtx/legislature",
    bicameral: false,
    lowerChamber: {
      key: "rtxAssembly",
      name: "House of Representatives",
      shortName: "House",
      seats: 150,
      description:
        "150 members elected across Texas's regions, seats shared by each region's vote.",
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
    description: "Elected councillors representing Texas's six regions.",
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
      // Keyed firstMinister so independence carries the sitting Chief Minister over
      // as caretaker head of government, as it does for Scotland and Wales.
      key: "firstMinister",
      label: "Chief Minister",
      labelPlural: "Chief Ministers",
      isExecutive: true,
      isSubNational: false,
      actionBonus: 4,
      partyStrengthWeight: 1,
    },
    {
      key: "rtxAssembly",
      label: "Representative",
      labelPlural: "Representatives",
      chamberKey: "rtxAssembly",
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
  // Only the Texas-homed independence party carries over intact; national
  // parties lose their Texas branches and players re-form them.
  majorPartyIds: ["LSI"],
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
  exchangeName: "Texas Stock Exchange",
  usdExchangeRate: 1,
  currencyCode: "USD",
  fiscalYearStartTurnInYear: 40,
  financeMinisterCabinetId: "financeSecretary",
  status: "coming-soon",
  tagline:
    "A sovereign Texas: a single-chamber House of Representatives, a Chief Minister who must hold it, and a US-dollar economy.",
  descriptor:
    "A parliamentary republic where the Chief Minister governs through a majority of the 150-seat House of Representatives, elected across Texas's six regions.",
  heroImage:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Flag_of_Texas.svg/500px-Flag_of_Texas.svg.png",
  entryPath: "/country/rtx",
  overviewPath: "/country/rtx",
  mapPath: "/country/rtx/map",
  executivePath: "/country/rtx/executive",
  executiveLabel: "Office of the Chief Minister",
  centralGovernmentLabel: "Texas Treasury",
};

/* No RTX_LEGISLATIVE_PROCESS: readers fall through to DEFAULT_PROCESS, as for Scotland. */

/* No RTX_ORDERS_OF_BATTLE: getOrderOfBattle returns null. */

export const RTX_MILITARY_BRANCHES: Branch[] = [];

/* No RTX_ESTATE_PORTFOLIO: seedCabinetEstates skips the country. */

/** Cabinet seat ids that fill cross-country roles. */
export const RTX_CABINET_SEAT_IDS = {
  energy: "netZeroSecretary",
  infrastructure: "transportSecretary",
  defense: null,
  foreignAffairs: "externalAffairsSecretary",
  tradeMinister: null,
} as const;

/** Military scale multiplier. */
export const RTX_MILITARY_SCALE = 1;
