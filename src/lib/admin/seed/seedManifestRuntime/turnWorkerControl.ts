import type { CollectionEntry } from "@/lib/admin/seed/seedManifestTypes";

export const RUNTIME_TURNWORKERCONTROL: CollectionEntry[] = [
  {
    name: "turnWorkerControl",
    category: "runtime",
    notes:
      "Turn worker heartbeat and the admin turn request it claims. Operational state: the worker rewrites the heartbeat within seconds, and a request queued in the old world must not survive a reset.",
  },

  {
    name: "playerIncomeTaxAssessments",
    category: "runtime",
    notes:
      "Immutable player tax liabilities and payment status, scoped to the world. Wiped on reset.",
  },

  {
    name: "playerIncomeTaxBatches",
    category: "runtime",
    notes:
      "One active closing tax batch per world and one latest atomic income payout receipt per source. Turn watermarks prevent stale replay without retaining every payout batch. Wiped on reset.",
  },

  {
    name: "governmentTenders",
    category: "runtime",
    notes:
      "Country tenders, sealed corporate bids and award recovery state. Wiped with contracts on world reset.",
  },

  { name: "demographicFlowReceipts", category: "runtime" },

  { name: "demographicFlowProjections", category: "runtime" },

  // Federation decisions and their applied world state belong to one world.
  { name: "federationPoliticalProposals", category: "runtime" },

  { name: "russianConstitutionalProposals", category: "runtime" },

  { name: "russianPresidentialElectionResults", category: "runtime" },

  { name: "russianPresidentialOfficeArchives", category: "runtime" },

  { name: "russianDumaElectionResults", category: "runtime" },

  { name: "russianDumaRepeatOpenings", category: "runtime" },

  { name: "russianCouncilElectionOpenings", category: "runtime" },

  { name: "russianCouncilElectionResults", category: "runtime" },

  { name: "russianAssemblySeatings", category: "runtime" },

  { name: "russianDumaConvocations", category: "runtime" },

  { name: "russianCouncilFormationProposals", category: "runtime" },

  { name: "russianDumaLawProposals", category: "runtime" },

  { name: "russianRegionalAuthorities", category: "runtime" },

  { name: "russianCouncilCompositionSeatings", category: "runtime" },

  { name: "bgOrdinaryElectionPlans", category: "runtime" },

  { name: "bgFoundingAssemblyCounts", category: "runtime" },

  { name: "bgFoundingAssemblyFilingLocks", category: "runtime" },

  { name: "bgFoundingAssemblyOfficeArchives", category: "runtime" },

  { name: "bg1991ListReplacements", category: "runtime" },

  { name: "bgGrandConstituencyByElections", category: "runtime" },

  { name: "bgAssemblyOfficeArchives", category: "runtime" },

  { name: "russianAssemblyOfficeArchives", category: "runtime" },

  { name: "federationRatifications", category: "runtime" },

  { name: "federationSettlementIntents", category: "runtime" },

  { name: "federationFacilityClaims", category: "runtime" },

  { name: "federationFacilityPaymentTurns", category: "runtime" },

  { name: "federationRelocations", category: "runtime" },

  { name: "federationPublicationPreparations", category: "runtime" },

  { name: "federationPreparedEffects", category: "runtime" },

  { name: "federationArchivedRegionRows", category: "runtime" },

  { name: "federationArchivedPoliticalRows", category: "runtime" },

  { name: "federationCustodyRecords", category: "runtime" },

  { name: "federationArchivedPublicCorporations", category: "runtime" },

  { name: "federationPublicCorporationRebases", category: "runtime" },

  { name: "federationPrivateFirmHolds", category: "runtime" },

  { name: "federationResidentHolds", category: "runtime" },

  { name: "federationFiscalAccounts", category: "runtime" },

  { name: "federationLegacyServiceTurns", category: "runtime" },

  { name: "federationContinuingServiceTurns", category: "runtime" },

  { name: "federationSettlementApplications", category: "runtime" },

  { name: "worldEntityStates", category: "runtime" },

  {
    name: "resetMetricSnapshots",
    category: "runtime",
    notes:
      "World-bound reviewed v2 primary-metric boards, including successor countries. Wiped on every reset, including decoded household references, reviewed income-model calibrations, current economic-owner inputs, latest household/housing production diagnostics, residential stocks, compact housing model/retry anchors and versioned observation/history metadata. Complete 1991 US/UK/JP boards may generate labeled public-calibrated household cohorts and residential source frames in memory; no survey microdata or per-turn cohort/payment arrays are persisted. Incomplete countries retain existing calculations. Never replaces v1 working stores in place.",
  },

  {
    name: "resetLawOpeningBoards",
    category: "runtime",
    notes:
      "World-bound 1991 source-law crosswalk for US, UK, and JP, including regional boards. Wiped on every reset and reseeded only for a verified legislation-v2 opening. It records current law, not reviewed enactment options.",
  },

  {
    name: "resetRegionalOpeningBoards",
    category: "runtime",
    notes:
      "World-bound 1991 regional source-pool allocation for 71 US, UK, and JP regions. The proportional allocation is a provisional opening claim against each regional budget, not a Cabinet account or enactment price.",
  },

  {
    name: "resetDepartmentOpeningBoards",
    category: "runtime",
    notes:
      "World-bound reconciled 1991 Cabinet operating claims for US, UK, and JP. Wiped on reset; these are opening claims, not spendable cash or a live department treasury.",
  },

  {
    name: "resetDepartmentAccounts",
    category: "runtime",
    notes:
      "World-bound v2 Cabinet accounts derived once from reconciled 1991 claims after reserving regional grants. Ordinary law-funded departments open with working capital; offices without law claims have zero-value accounts. Defense and intelligence retain their specialized settlement shell. Wiped on every reset.",
  },

  {
    name: "resetDepartmentContinuity",
    category: "runtime",
    notes:
      "World-bound v2 existing-service continuity and unattributed grant reserve. It is not spendable Cabinet cash and is wiped on every reset.",
  },

  {
    name: "resetNationalTreasuries",
    category: "runtime",
    notes:
      "World-bound v2 national cash, arrears, bond debt, and emergency-advance opening. Kept apart from the legacy signed budget balance and wiped on reset.",
  },

  {
    name: "resetLawPrograms",
    category: "runtime",
    notes:
      "World-bound enacted v2 national and regional law programs. Replaced by family, linked to the enacting bill, and wiped on every reset.",
  },

  {
    name: "resetLawEnactmentReceipts",
    category: "runtime",
    notes:
      "Exactly-once receipts for v2 law fiscal transitions. The turn reconciliation phase uses them to retry a failed enactment hook safely. Wiped on reset.",
  },

  {
    name: "resetCabinetActionStates",
    category: "runtime",
    notes:
      "World-bound cooldown and active-effect state for v2 ministerial actions. Wiped on reset.",
  },

  {
    name: "ukPartyLeadership",
    category: "runtime",
    notes:
      "Per-party Westminster leadership rules, committee history, and active challenge pointer.",
  },

  {
    name: "ukLeadershipChallenges",
    category: "runtime",
    notes: "Westminster leadership challenge gathering, ballot, and resolution state.",
  },

  {
    name: "sentNewsDedup",
    category: "runtime",
    notes:
      "Short-lived Discord news delivery claims. Wiped with the game world and rebuilt on demand.",
  },

  {
    name: "bondMarketPools",
    category: "runtime",
    notes:
      "One bond market pool per currency: the cash side of every bond's publicFloat, with lifetime flow counters. Seeded by migration from a share of M2; wiped with the world.",
  },

  {
    name: "bankTreasuryTrades",
    category: "runtime",
    notes:
      "Durable frozen intents and recovery receipts for funded bank sovereign treasury trades. Wiped with the game world.",
  },

  {
    name: "equityMarketPools",
    category: "runtime",
    notes:
      "One equity market pool per currency: finite cash backing every corporation's publicFloat, with lifetime flow counters. Seeded from a share of M2; wiped with the world.",
  },

  {
    name: "productAdvertisingClearing",
    category: "runtime",
    notes:
      "One product advertising clearing pool per family and buyer currency: funded order cash owed to advertising sellers until the turn's clearing pays them. Wiped with the world.",
  },

  {
    name: "productAdvertisingPayables",
    category: "runtime",
    notes:
      "Owed per-order advertising seller payables (totals only), inserted with each funded order and removed once a clearing pays them. Wiped with the world.",
  },

  {
    name: "productAdvertisingAllocations",
    category: "runtime",
    notes:
      "One frozen per-seller advertising table per funded order, written with the order's move key and removed with its payable. Wiped with the world.",
  },

  {
    name: "productAdvertisingClearances",
    category: "runtime",
    notes:
      "Append-only receipts naming the clearing that paid each advertising payable. Wiped with the world.",
  },

  {
    name: "moneySupplySnapshots",
    category: "runtime",
    notes: "Per-turn M1/M2, credit, sovereign-debt, and central-bank holdings by issuing currency.",
  },

  {
    name: "economicVitalSigns",
    category: "runtime",
    notes:
      "Versioned per-turn aggregate market, production, distribution, money, and reconciliation indicators for economic evaluation.",
  },

  {
    name: "nppMarketEntryFunnels",
    category: "runtime",
    notes:
      "Current and 48-turn retained NPP market-entry outcomes with one exclusive reason per corporation.",
  },

  {
    name: "ledgerTurnoverByTurn",
    category: "runtime",
    notes:
      "Cached per-turn, per-account primary-leg ledger turnover for completed turns, summed for the economic vital signs window. Keyed by turn; wiped with the world.",
  },

  {
    name: "ledgerReconciliations",
    category: "runtime",
    notes:
      "Per-turn shadow-ledger trial-balance, stock-flow, and money-supply reconciliation reports.",
  },

  {
    name: "ledgerEntries",
    category: "runtime",
    notes:
      "Shadow double-entry ledger rows retained for audit, reconciliation, and velocity analysis.",
  },

  {
    name: "balanceSnapshots",
    category: "runtime",
    notes:
      "Per-turn anchor-valued account balances used for stock-flow and money-activity analysis.",
  },

  // Elections + officials
  { name: "elections", category: "runtime" },

  { name: "electionCandidates", category: "runtime" },

  { name: "hu1991AssemblyCounts", category: "runtime" },

  { name: "hu1991AssemblyOfficeArchives", category: "runtime" },

  { name: "hu1991ConstituencyByElections", category: "runtime" },

  { name: "hu1991AssemblyFilingLocks", category: "runtime" },

  { name: "hu1991ListReplacements", category: "runtime" },

  { name: "hu1994ElectoralProposals", category: "runtime" },

  { name: "hu2011ElectoralProposals", category: "runtime" },

  { name: "ro1992ElectoralProposals", category: "runtime" },

  { name: "bg1991ConstitutionalProposals", category: "runtime" },

  { name: "bg1991ConstitutionalInitiatives", category: "runtime" },

  { name: "hu2011AssemblyCounts", category: "runtime" },

  { name: "hu2011ConstituencyByElections", category: "runtime" },

  { name: "hu2011AssemblyOfficeArchives", category: "runtime" },

  {
    name: "electionVoteTallies",
    category: "runtime",
    notes:
      "Includes frozen House district results and geometry; removed with all tallies on reset so no prior-world result survives.",
  },

  {
    name: "electionResultSnapshots",
    category: "runtime",
    notes:
      "Frozen results for ended races. Tied to the world election records, wiped on reset, and rebuilt by the migration or by election resolution.",
  },

  { name: "ukCommonsVacancies", category: "runtime" },

  { name: "ukRecallPetitions", category: "runtime" },

  { name: "ukPartyConferences", category: "runtime" },

  { name: "ukPartyPlatforms", category: "runtime" },

  {
    name: "electedOfficials",
    category: "runtime",
    notes: "Seeded by bootstrap (historical or vacant), then driven by elections.",
  },

  {
    name: "officials",
    category: "runtime",
    notes: "Legacy synonym of electedOfficials; left in place for older code paths.",
  },

  // NPPs
  { name: "npps", category: "runtime" },

  { name: "nppInfluenceAttempts", category: "runtime" },

  { name: "nppRelationships", category: "runtime" },

  { name: "nppEndorsements", category: "runtime" },

  { name: "nppVoteCommitments", category: "runtime" },

  { name: "nppVotePredictions", category: "runtime" },

  {
    name: "nppForeignPolicyDecisions",
    category: "runtime",
    notes:
      "One auditable autonomous foreign-policy intent per country and turn. Shadow-mode rows are wiped on reset and never mutate gameplay state.",
  },

  { name: "playerEndorsements", category: "runtime" },

  { name: "playerEndorsementLocks", category: "runtime" },

  // Bills + legislation runtime
  { name: "bills", category: "runtime" },

  { name: "stateBills", category: "runtime" },

  { name: "billWhips", category: "runtime" },

  { name: "enactedLaws", category: "runtime" },

  { name: "tariffs", category: "runtime" },

  { name: "subsidies", category: "runtime" },

  {
    name: "legislation",
    category: "runtime",
    notes: "Legacy bills collection retained for older code paths.",
  },

  // Caucuses + coalitions
  { name: "coalitions", category: "runtime" },

  { name: "caucuses", category: "runtime" },

  { name: "caucusMemberships", category: "runtime" },

  { name: "caucusPolicyPositions", category: "runtime" },

  { name: "caucusChairCandidates", category: "runtime" },

  { name: "caucusChairElections", category: "runtime" },

  { name: "caucusChairVotes", category: "runtime" },

  // Recruitment + slates
  { name: "recruitmentSlates", category: "runtime" },

  { name: "slateCandidates", category: "runtime" },

  // Treasury + political capital
  { name: "treasuryTransactions", category: "runtime" },

  { name: "politicalCapitalBalances", category: "runtime" },

  { name: "capitalActionLogs", category: "runtime" },

  // State-party elections
  { name: "statePartyElections", category: "runtime" },

  { name: "statePartyVotes", category: "runtime" },

  { name: "statePartyCandidates", category: "runtime" },

  // National party / committee elections
  { name: "nationalPartyCandidates", category: "runtime" },

  { name: "nationalPartyElections", category: "runtime" },

  { name: "nationalPartyVotes", category: "runtime" },

  { name: "nationalCommitteeCandidates", category: "runtime" },

  { name: "nationalCommitteeElections", category: "runtime" },

  { name: "nationalCommitteeVotes", category: "runtime" },

  {
    name: "nationalPartyLeadership",
    category: "runtime",
    notes: "Per-party national leadership (chair/treasurer). Per-game state; cleared on reset.",
  },

  // Legislative leadership
  { name: "leadershipElections", category: "runtime" },

  { name: "houseLeadershipBallots", category: "runtime" },

  { name: "houseLeadershipNominations", category: "runtime" },

  { name: "senateLeadershipNominations", category: "runtime" },

  { name: "speakerElections", category: "runtime" },

  { name: "speakerNominations", category: "runtime" },

  { name: "pmAppointmentVotes", category: "runtime" },

  { name: "noConfidenceVotes", category: "runtime" },

  { name: "confidenceVotes", category: "runtime" },

  { name: "congressLeaders", category: "runtime" },

  // Cabinet + government
  { name: "cabinetMembers", category: "runtime" },

  { name: "cabinetNominations", category: "runtime" },

  { name: "cabinetSettings", category: "runtime" },
];
