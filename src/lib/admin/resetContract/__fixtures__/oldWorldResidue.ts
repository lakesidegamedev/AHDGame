import { ObjectId } from "mongodb";
import type { InMemoryDb } from "@/lib/test-utils/inMemoryDb";

/** When the outgoing world wrote its state: long before any reset under test. */
export const OLD_WORLD_AT = new Date("2026-06-01T00:00:00Z");

const oldId = () => ObjectId.createFromTime(Math.floor(OLD_WORLD_AT.getTime() / 1000));

/**
 * Runtime collections that past resets left populated. Each row is a world
 * record the reset must remove: wars and their peace terms, truces whose
 * expiry turns restart with the counter, in-flight ballots for deleted
 * characters, old elections and bills, embargoes and blockades, defence
 * contracts, and turn-keyed telemetry that collides with the new turn numbers.
 */
export const OLD_WORLD_RUNTIME_ROWS: Readonly<Record<string, Record<string, unknown>>> = {
  conflicts: { status: "active", startTurn: 390, hostCountryId: "DE" },
  livingConflicts: { status: "active", startTurn: 390 },
  peaceOffers: { status: "pending" },
  truces: { expiresTurn: 785 },
  vietnamEscalation: { opened: true, level: 1, westSupport: 24 },
  crises: { status: "active", startTurn: 1100 },
  alignmentCrises: { status: "active" },
  settlementCrises: { status: "active" },
  elections: { status: "active", countryId: "US" },
  electionCandidates: { status: "running" },
  stateBills: { status: "introduced" },
  speakerLeadershipBallots: { round: 2 },
  senateLeadershipBallots: { round: 1 },
  bargainingRatificationBallots: { vote: "yes" },
  ngChamberLeadershipElections: { status: "open" },
  ngChamberLeadershipNominations: { status: "open" },
  tradeEmbargoes: { createdTurn: 1200, commodity: "all" },
  embargoCooldowns: { untilTurn: 1300 },
  navairChannels: { blockaded: true },
  organizationLegislation: { type: "sanctions", status: "passed", sanctionsExpiresOnTurn: 1400 },
  defenceContracts: { status: "active", encumbered: 4_000_000 },
  defenceProcurementAllocations: { turn: 1261 },
  sphereFlowLedger: { turn: 1200 },
  appliedWorldTransitions: { ruleId: "decolonization-1960" },
  acquisitionSettlements: { status: "applied" },
  mergerReviews: { status: "resolved" },
  indexListingPetitions: { status: "refused" },
  bankingTelemetry: { turn: 1261 },
  balanceSnapshotCheckpoints: { turn: 1261 },
  equityLiquidityFacilitySnapshots: { turn: 1261 },
  nppOperatorDiagnostics: { turn: 1261 },
  capacityDecisionFunnels: { turn: 1261 },
  bondSaleIntents: { status: "pending" },
  regionalBudgets: { regionId: "NORTHEAST", countryId: "CN" },
  fundWritedownCompensationLedger: { amount: 10 },
  actionLogs: { action: "campaign" },
  npps: { countryId: "US" },
  electedOfficials: { countryId: "US", office: "senator" },
  enactedLaws: { legislationTypeId: "de_minimum_wage", countryId: "DE", scope: "national" },
  bills: { status: "in_committee", legislationTypeId: "us_federal_education_funding" },
};

/** Law type rows of the retired catalogues, as a world seeded before the one law book holds them. */
export const OLD_BOOK_LEGISLATION_TYPES: ReadonlyArray<Record<string, unknown>> = [
  { _id: "us_federal_education_funding", name: "Federal education funding" },
  { _id: "de_minimum_wage", name: "Minimum wage" },
  { _id: "cn_ai_strategy", name: "AI strategy" },
];

const priorityRef = (lawTypeId: string) => ({ lawTypeId, policyOptionId: "o1" });

/** Admin electorate priorities: one naming a retired law, one on the new book. */
export const OLD_BOOK_PRIORITY_OVERRIDES: ReadonlyArray<Record<string, unknown>> = [
  {
    _id: "US:US_CA:economic:workers",
    countryId: "US",
    priorities: {
      primary: priorityRef("us_federal_education_funding"),
      secondary: [
        priorityRef("us.health.universalCare.primary"),
        priorityRef("a"),
        priorityRef("b"),
      ],
    },
  },
  {
    _id: "US:US_TX:economic:workers",
    countryId: "US",
    priorities: {
      primary: priorityRef("us.education.universalSchooling.primary"),
      secondary: [
        priorityRef("us.health.universalCare.primary"),
        priorityRef("a"),
        priorityRef("b"),
      ],
    },
  },
];

/** Reference rows carrying old-world state in fields a seeder no longer writes. */
export const OLD_WORLD_REFERENCE_ROWS: ReadonlyArray<{
  collection: string;
  doc: Record<string, unknown>;
}> = [
  {
    collection: "federalBudget",
    doc: {
      _id: "US",
      countryId: "US",
      defenseAppropriation: {
        balance: 9e11,
        accruedThroughTurn: 1261,
        arrearsRatio: 0.2,
        encumbered: 4_000_000,
        governmentTenderReservations: { t1: { state: "held", amount: 1_000_000 } },
      },
      intelligenceAppropriation: { balance: 5e9, accruedThroughTurn: 1261 },
    },
  },
  {
    collection: "politicalMetrics",
    doc: {
      _id: "UK_LON",
      countryId: "UK",
      cabinetResiduals: { workerSecurity: 21.8857 },
      labourResiduals: { workerSecurity: 3.6 },
    },
  },
  { collection: "politicalMetrics", doc: { _id: "RU_KAZ", countryId: "RU" } },
  { collection: "macroMetrics", doc: { _id: "US_CA", simBaseline: 1, trend: 2, outputGap: 0.1 } },
  { collection: "states", doc: { _id: "UKR_KYI", countryId: "UKR", outputGap: 0.3 } },
  { collection: "stateBaselines", doc: { _id: "UKR_KYI" } },
  { collection: "congressionalDistricts", doc: { _id: "CA-53", redistrictedTurn: 1100 } },
  { collection: "macroCountries", doc: { _id: "ZA", heldContribution: 77 } },
];

/** gameState as a long-lived world leaves it: high counters, guards, undeclared fields. */
export const OLD_WORLD_GAME_STATE: Record<string, unknown> = {
  _id: "current",
  currentTurn: 1262,
  currentYear: 1979,
  startingYear: 1953,
  preset: "1953-default",
  isActive: true,
  resetWorldId: "old-world",
  lastCensusYear: 2010,
  lastAutoSeedTurn: 944,
  lastStatehoodYear: 1979,
  lastMilitaryBranchYearProcessed: 1979,
  lastBundestagReconciledCycle: 6,
  coldWarEndedTurn: 1250,
  votingAgeEligibleByCountry: { US: 25, UK: 16 },
  registrationAccessBiasByCountry: { US: -50 },
  europeanIntegration: { stage: "settled", settledTurn: 1262 },
  manuallyEnabledSeats: ["secretary_of_energy"],
  legacyWarExhaustion: { US: 0.4 },
};

/**
 * Write a world that holds every leftover seen after a real reset. Returns
 * the ids the tests check by name.
 */
export function seedOldWorldResidue(memory: InMemoryDb): {
  playerUserId: ObjectId;
  imperialId: ObjectId;
} {
  for (const [collection, row] of Object.entries(OLD_WORLD_RUNTIME_ROWS)) {
    memory.seed(collection, [{ _id: oldId(), ...row, createdAt: OLD_WORLD_AT }]);
  }
  memory.seed(
    "truces",
    Array.from({ length: 3 }, () => ({ _id: oldId(), expiresTurn: 1539 }))
  );
  for (const { collection, doc } of OLD_WORLD_REFERENCE_ROWS) {
    memory.seed(collection, [{ ...doc }]);
  }
  memory.seed(
    "legislationTypes",
    OLD_BOOK_LEGISLATION_TYPES.map((row) => ({ ...row }))
  );
  memory.seed(
    "electoratePriorityOverrides",
    OLD_BOOK_PRIORITY_OVERRIDES.map((row) => ({ ...row }))
  );
  memory.seed("gameState", [
    { ...OLD_WORLD_GAME_STATE },
    { _id: "debt_ceiling_crisis", active: true, triggeredYear: 1993 },
  ]);
  memory.seed("gameConfig", [
    { _id: "default", economyPauseUntilTurn: 1300, sandboxTesterAccessEnabled: true },
  ]);
  memory.seed("counters", [
    { _id: "party_US", seq: 4 },
    { _id: "characters", seq: 900 },
    { _id: "imperial", seq: 1 },
  ]);
  memory.seed("activityLog", [
    { _id: oldId(), type: "turn_summary", turnNumber: 1261, createdAt: OLD_WORLD_AT },
    { _id: oldId(), type: "login", ip: "kept", createdAt: OLD_WORLD_AT },
  ]);

  const playerUserId = oldId();
  const characterId = oldId();
  memory.seed("users", [
    {
      _id: playerUserId,
      email: "player@example.test",
      username: "player",
      role: "player",
      hasCompletedSetup: true,
      activeCharacterId: characterId,
      activeCharacterCount: 1,
      lastCorporationFoundedTurn: 944,
      bannedShareReleaseCorporationIds: [oldId()],
      widgetWatchlist: [{ kind: "corporation", id: "old-corp" }],
      wireQuotaUsed: 50_000,
      wireQuotaWindowStart: OLD_WORLD_AT,
      theme: "coldwar",
      createdAt: OLD_WORLD_AT,
    },
  ]);
  memory.seed("characters", [
    { _id: characterId, userId: playerUserId, countryId: "US", createdAt: OLD_WORLD_AT },
  ]);
  const imperialId = oldId();
  memory.seed("imperialCharacters", [
    {
      _id: imperialId,
      userId: playerUserId,
      countryId: "JP",
      sequentialId: 1,
      cashOnHand: 5_000_000,
      currencyBalances: { personal: { JPY: 1e9 } },
      incomeTier: "top",
      initialIncomeTier: "high",
      incomeTaxStartTurn: 900,
      pendingStockTaxReceipts: [{ turn: 1261 }],
      createdAt: OLD_WORLD_AT,
    },
  ]);
  return { playerUserId, imperialId };
}
