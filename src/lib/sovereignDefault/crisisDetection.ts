/**
 * Sovereign auction outcome detection, once per country at fiscal-year close.
 *
 * Loads the budget row, skips terminal-for-detection states and cases with no
 * required issuance, classifies the outcome, and persists state, counter, and
 * last-demand. On entry into `crisisPending` it writes fire timestamps, inserts
 * the crisis decision, and emits crisis news; otherwise it emits
 * undersubscribed/failed news. Resolution and recovery are Phase 5+.
 */

import { ObjectId, type Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { FederalBudget, SovereignCrisisState } from "@/lib/db/types/budget";
import type { SovereignCrisisDecision } from "@/lib/db/types/sovereignCrisisDecision";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import { loadCountrySovereignSnapshot } from "./snapshotLoader";
import { computeMarketDemand } from "./marketDemand";
import { computeRequiredIssuance } from "./requiredIssuance";
import { classifyAuctionOutcome, type AuctionOutcome } from "./auctionOutcome";
import { computeNextCrisisState } from "./crisisState";
import {
  emitAuctionUndersubscribedNews,
  emitAuctionFailedNews,
  emitCrisisFiredNews,
} from "./crisisNews";
import {
  AUTONOMOUS_CRISIS_MIN_DEBT_TO_GDP,
  EXECUTIVE_DECISION_HOURS,
  EXECUTIVE_DECISION_TURNS,
} from "./constants";
import { EXTREME_DISTRESS_DEBT_TO_GDP } from "@/lib/budget/debt";
import { npcExecutiveAutoPropose } from "./npc/npcExecutiveAutoPropose";
import { applyPopulistSurgeOnCrisis } from "./political/applyPopulistSurge";
import { getCountryAccessFromDb } from "@/lib/countryAccess";

const MS_PER_HOUR = 60 * 60 * 1000;

export interface EvaluationSummary {
  countryCode: string;
  outcome: AuctionOutcome;
  demandRatio: number;
  newConsecutiveFailedCount: number;
  nextState: SovereignCrisisState;
  firedThisEvaluation: boolean;
}

/** Open the decision row a fired sovereign crisis is resolved against. */
export async function insertSovereignCrisisDecision(
  db: Db,
  countryCode: CountryId,
  currentTurn: number,
  realtimeMs: number
): Promise<SovereignCrisisDecision> {
  const decision: SovereignCrisisDecision = {
    _id: new ObjectId(),
    countryCode,
    state: "open",
    firedAtTurn: currentTurn,
    firedAtRealtimeMs: realtimeMs,
    executiveChoice: null,
    executiveProposedAtRealtimeMs: null,
    // Phase 9 will derive this from country government type. Defaulting to
    // false here means the decision row is structurally complete but
    // legislative ratification wiring is intentionally deferred.
    requiresLegislativeRatification: false,
    legislativeBillId: null,
    resolvedAt: null,
    resolvedReason: null,
    createdAt: new Date(realtimeMs),
  };
  await db.collection<SovereignCrisisDecision>("sovereignCrisisDecisions").insertOne(decision);
  return decision;
}

export async function evaluateSovereignAuctionForCountry(
  db: Db,
  countryCode: CountryId,
  currentTurn: number,
  realtimeMs: number
): Promise<EvaluationSummary | null> {
  const budgetId = getNationalBudgetId(countryCode);
  const budget = await db.collection<FederalBudget>("federalBudget").findOne({ _id: budgetId });
  if (!budget) return null;

  const currentState: SovereignCrisisState = budget.sovereignCrisisState ?? "normal";
  // "recovering" is normally terminal for detection, but a country with a
  // structural deficit can sit there forever: unconditional per-turn interest
  // can reflate debt/GDP past extreme distress with no further check. Once a
  // "recovering" country reflates past that band, re-allow detection as if
  // "normal" instead of shielding it indefinitely.
  const recoveringButReflated =
    currentState === "recovering" && (budget.debtToGdpRatio ?? 0) >= EXTREME_DISTRESS_DEBT_TO_GDP;
  if (
    (currentState === "crisisPending" ||
      currentState === "crisisResolving" ||
      currentState === "recovering") &&
    !recoveringButReflated
  ) {
    return null;
  }
  const detectionState: SovereignCrisisState = recoveringButReflated ? "normal" : currentState;

  const required = await computeRequiredIssuance(db, countryCode, currentTurn);
  if (required <= 0) return null;

  const snapshot = await loadCountrySovereignSnapshot(db, countryCode, currentTurn);
  if (!snapshot) return null;

  const demand = computeMarketDemand(snapshot);
  // The pool's real fill on the latest quarterly auction caps the synthetic
  // ratio: a market that could only absorb 40% of the paper is a 0.4, however
  // the model feels about the fundamentals. A full fill leaves the model in
  // charge, since it can still be oversubscribed.
  const fill = budget.lastPrimaryFillRatio;
  const effectiveRatio =
    typeof fill === "number" && Number.isFinite(fill) && fill < 1
      ? Math.min(demand.demandRatio, fill)
      : demand.demandRatio;
  const classified = classifyAuctionOutcome(effectiveRatio);

  // Player-disabled countries are scored but never default: no counter
  // increment, state transition, decisions, news, or populist surge. We do persist
  // lastAuctionDemandRatio as a record of the last market signal.
  // Exception: an NPP-governed country at extreme debt/GDP runs the full pipeline,
  // otherwise autonomous worlds freeze the crisis state machine entirely.
  const access = await getCountryAccessFromDb(db, countryCode);
  const autonomousCrisisEligible =
    access.nppGoverned && snapshot.debtToGdp >= AUTONOMOUS_CRISIS_MIN_DEBT_TO_GDP;
  if (!access.enabledForPlayers && !autonomousCrisisEligible) {
    await db
      .collection<FederalBudget>("federalBudget")
      .updateOne({ _id: budgetId }, { $set: { lastAuctionDemandRatio: demand.demandRatio } });
    return {
      countryCode,
      outcome: classified.outcome,
      demandRatio: demand.demandRatio,
      // Counter is intentionally NOT incremented while disabled so a flip of
      // the toggle to Active doesn't immediately fire a crisis from auctions
      // accumulated during the preview window.
      newConsecutiveFailedCount: budget.failedAuctionConsecutiveCount ?? 0,
      nextState: currentState,
      firedThisEvaluation: false,
    };
  }

  const previousCount = budget.failedAuctionConsecutiveCount ?? 0;
  const newCount = classified.counterDelta === 0 ? 0 : previousCount + 1;

  const transition = computeNextCrisisState({
    current: detectionState,
    outcome: classified.outcome,
    newConsecutiveFailedCount: newCount,
  });

  const baseUpdate: Partial<FederalBudget> = {
    sovereignCrisisState: transition.nextState,
    failedAuctionConsecutiveCount: newCount,
    lastAuctionDemandRatio: demand.demandRatio,
  };

  if (transition.firedThisEvaluation) {
    baseUpdate.crisisFiredAt = { turn: currentTurn, realtimeMs };
    baseUpdate.crisisAutoActionAt = {
      turn: currentTurn + EXECUTIVE_DECISION_TURNS,
      realtimeMs: realtimeMs + EXECUTIVE_DECISION_HOURS * MS_PER_HOUR,
    };
  }

  await db
    .collection<FederalBudget>("federalBudget")
    .updateOne({ _id: budgetId }, { $set: baseUpdate });

  if (transition.firedThisEvaluation) {
    const decision = await insertSovereignCrisisDecision(db, countryCode, currentTurn, realtimeMs);
    await emitCrisisFiredNews(countryCode, currentTurn);
    // Phase 10: NPC-controlled and vacant executives auto-propose immediately —
    // no 12-hour wait. Player executives skip this and use the UI within the
    // existing window. The auto-propose itself transitions the decision to
    // `executiveProposed` and the budget to `crisisResolving`.
    //
    // Wrap in try/catch: the crisis-fire transition above is already
    // committed (state, decision row, news). A failure in auto-propose must
    // not roll those back; the country falls through to the 12-hour
    // auto-Repudiate timer as the safety net.
    try {
      await npcExecutiveAutoPropose(db, {
        countryCode,
        decisionId: decision._id,
        currentTurn,
        realtimeMs,
      });
    } catch (err) {
      console.error("npcExecutiveAutoPropose threw at crisis-fire", err);
    }

    // Phase 11b: anti-establishment sentiment rises — populist/nationalist
    // NPPs in the affected country get a temporary favorability bump.
    // Best-effort.
    try {
      await applyPopulistSurgeOnCrisis(db, countryCode);
    } catch (err) {
      console.error("applyPopulistSurgeOnCrisis threw at crisis-fire", err);
    }
  } else if (classified.outcome === "undersubscribed") {
    await emitAuctionUndersubscribedNews(countryCode, demand.demandRatio);
  } else if (classified.outcome === "failed") {
    await emitAuctionFailedNews(countryCode, demand.demandRatio, newCount);
  }

  return {
    countryCode,
    outcome: classified.outcome,
    demandRatio: demand.demandRatio,
    newConsecutiveFailedCount: newCount,
    nextState: transition.nextState,
    firedThisEvaluation: transition.firedThisEvaluation,
  };
}
