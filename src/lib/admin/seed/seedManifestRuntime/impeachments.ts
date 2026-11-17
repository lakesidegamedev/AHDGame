import type { CollectionEntry } from "@/lib/admin/seed/seedManifestTypes";

export const RUNTIME_IMPEACHMENTS: CollectionEntry[] = [
  {
    name: "impeachments",
    category: "runtime",
    notes: "Impeachment articles and votes. Owned by gameplay.",
  },

  {
    name: "speakerVacateMotions",
    category: "runtime",
    notes: "Motions to vacate the Speaker's chair. Owned by gameplay.",
  },

  {
    name: "ukJudicialReviewCases",
    category: "runtime",
    notes: "UK judicial-review cases spawned by the turn pipeline (ukJrSurpriseTurn).",
  },

  {
    name: "manifestos",
    category: "runtime",
    notes:
      "Westminster party manifestos (#901). Owned by gameplay; no seeder writes them. Accessed via db/collections/manifestos.ts.",
  },

  {
    name: "ukBudgets",
    category: "runtime",
    notes:
      "UK Westminster Budgets (#901). Owned by gameplay; no seeder writes them. Accessed via db/collections/ukBudgets.ts. Distinct from the regional ukBudget budget rows.",
  },

  {
    name: "ukNhsState",
    category: "runtime",
    notes:
      "UK NHS state (#901). Owned by gameplay and the turn pipeline; no seeder writes it. Accessed via uk/nhs/nhsStore.ts.",
  },

  // 2026-10 backfill: world state omitted from the reset inventory
  {
    name: "procurementRestrictions",
    category: "runtime",
    notes: "Peace-term procurement restrictions belong to one world.",
  },

  {
    name: "truces",
    category: "runtime",
    notes: "Turn-expiring bilateral war restrictions belong to one world.",
  },

  {
    name: "vietnamEscalation",
    category: "runtime",
    notes: "Vietnam crisis singleton state belongs to one world.",
  },

  {
    name: "appliedWorldTransitions",
    category: "runtime",
    notes: "Idempotency ledger for world-specific transition rules.",
  },

  {
    name: "sphereFlowLedger",
    category: "runtime",
    notes: "Foreign-aid and tribute history is scoped to one world.",
  },

  {
    name: "bankingTelemetry",
    category: "runtime",
    notes: "Turn-keyed banking health telemetry belongs to one world.",
  },

  {
    name: "acquisitionSettlements",
    category: "runtime",
    notes: "Settlement receipts reference world-specific offers and corporations.",
  },

  {
    name: "mergerReviews",
    category: "runtime",
    notes: "Merger decisions reference world-specific corporations.",
  },

  {
    name: "corporationExits",
    category: "runtime",
    notes: "Exit records reference world-specific corporations that were deleted.",
  },

  {
    name: "indexListingPetitions",
    category: "runtime",
    notes: "Listing decisions reference world-specific corporations and characters.",
  },

  {
    name: "speakerLeadershipBallots",
    category: "runtime",
    notes: "Leadership ballots reference world-specific nominations and characters.",
  },

  {
    name: "senateLeadershipBallots",
    category: "runtime",
    notes: "Leadership ballots reference world-specific nominations and characters.",
  },

  {
    name: "bargainingRatificationBallots",
    category: "runtime",
    notes: "Ratification ballots reference world-specific campaigns and characters.",
  },

  {
    name: "balanceSnapshotCheckpoints",
    category: "runtime",
    notes: "Turn-keyed balance checkpoints belong to one world.",
  },

  {
    name: "equityLiquidityFacilitySnapshots",
    category: "runtime",
    notes: "Turn-keyed facility snapshots belong to one world.",
  },

  {
    name: "nppOperatorDiagnostics",
    category: "runtime",
    notes: "Turn-keyed operator diagnostics belong to one world.",
  },

  {
    name: "capacityDecisionFunnels",
    category: "runtime",
    notes: "Turn-keyed capacity diagnostics belong to one world.",
  },

  {
    name: "bondSaleIntents",
    category: "runtime",
    notes: "In-flight bond sale recovery state belongs to one world.",
  },

  {
    name: "ngChamberLeadershipElections",
    category: "runtime",
    notes: "Nigerian chamber leadership elections belong to one world.",
  },

  {
    name: "ngChamberLeadershipNominations",
    category: "runtime",
    notes: "Nigerian chamber nominations belong to one world.",
  },
];
