/**
 * Per-phase Mongo round-trip budgets.
 *
 * Production turn time is round trips times latency: Mongo is remote and every
 * command costs milliseconds before any work happens, so a phase that quietly
 * gains a per-row query (an N+1) adds seconds to every turn for every player.
 * The profiler found and removed a dozen of those; this table is what stops
 * the next one landing unnoticed.
 *
 * `runPhase` compares each phase's count against its budget and, when it is
 * over, writes a warning to the log and records `roundTrips`, `roundTripBudget`
 * and `overBudget` on the phase's telemetry (turnLogs.phaseStatuses), where
 * the turndiag tooling and the admin turn view can see it. It never fails the
 * turn.
 *
 * Budgets are measured numbers with headroom, not aspirations. When a phase
 * legitimately grows (a new subsystem, more entities), raise its budget here
 * in the same PR with the measurement that justifies it. Measure with
 * `AHD_TURN_ROUNDTRIP_PROFILE=1 npx tsx scripts/perf/one-turn.ts` and find the
 * call sites with `scripts/perf/trace-callsites.ts`.
 */

/** Phases not listed below get this. A phase with no per-row loop needs far less. */
export const DEFAULT_PHASE_ROUND_TRIP_BUDGET = 500;

/**
 * Budgets are ~1.2x the observed phase p95 on production turnLogs, with headroom
 * for the larger production world. Cadence-gated phases count executed turns only.
 */
export const PHASE_ROUND_TRIP_BUDGETS: Readonly<Record<string, number>> = {
  // One expiry update, one projected read, two batched releases and one completion update.
  governmentContractExpiry: 10,
  // Live turns 233-235 measured 41/9 commands including telemetry and cursor
  // reads. Debt-scan wrap adds at most one command; keep modest headroom.
  playerIncomeTax: 45,
  incomeTaxBases: 10,
  russianCouncilComposition: 100,
  corporationTurn: 4500,
  ministerialOrders: 2000,
  indexFunds: 18000,
  fiscalYear: 7000,
  nppUnionBehavior: 1500,
  nppActionProcessing: 10000,
  approvalSnapshot: 1500,
  nppGovernmentPhases: 1000,
  // Bounded preset/registration reads plus batched government/approval reads and write.
  parliamentaryGovernmentConfidence: 20,
  bondTurn: 1000,
  // At most three 1991 federation applications; real Mongo volume fixtures cap
  // one application at 20 commands, with headroom for all three and cursors.
  federationFacilityCompensation: 75,
  // Native two-chamber Mongo qualification: first opening/admission <=70,
  // both failed-poll repeats 81 commands, and settled replay <=4.
  russianAssemblyCampaigns: 100,
  nppBillSponsorship: 800,
  nppBehavior: 800,
  fiscalBaseGrowth: 800,
  inflationRecalc: 600,
  primaryResolution: 2000,
  voteAccumulation: 4500,
  // A fresh 2027 world measured 1,095 on turns 2-4 (bankMoneyMoves 456,
  // corporations 198, bankLoans 141). The journal share is each settlement's
  // own claim, leg stamps and completion, the crash-safety writes, not a
  // per-row read, so it grows with the bank count rather than batching away.
  bankingTurn: 1300,
  recomputeSharePrices: 1000,
  electionResolution: 2000,
  primarySnapshots: 800,
  politicalMetricsDynamics: 600,
  demographicEffects: 600,
  crisisTurn: 600,
  autoCrisisTurn: 600,
  nppCorporateAttacks: 600,
  stateOwnershipConcentration: 400,
  // One bounded aggregate plus at most one recovery transaction per turn.
  resetLawEnactmentReconciliation: 40,
};

export function roundTripBudgetFor(phase: string): number {
  return PHASE_ROUND_TRIP_BUDGETS[phase] ?? DEFAULT_PHASE_ROUND_TRIP_BUDGET;
}
