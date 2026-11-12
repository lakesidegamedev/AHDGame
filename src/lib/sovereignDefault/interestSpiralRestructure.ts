/**
 * Restructuring as an outcome of an interest spiral.
 *
 * When debt interest has taken more than half of revenue for two fiscal years
 * running, no consolidation package can catch the interest bill. An AI-run
 * country then restructures through the ordinary sovereign-default path: the
 * crisis fires as after failed auctions, and `applyRestructureResolution`
 * applies the haircut, market access lock and recovery. No parallel mechanism
 * is invented here; this only decides that the crisis fires.
 */

import type { Db, Filter } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { FederalBudget, SovereignCrisisState } from "@/lib/db/types/budget";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import { shouldRestructureForInterest } from "@/lib/budget/rules/fiscalStabilizer";
import { insertSovereignCrisisDecision } from "./crisisDetection";
import { emitInterestSpiralCrisisNews } from "./crisisNews";
import { applyRestructureResolution } from "./resolution/restructure";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";

export interface InterestSpiralRestructureResult {
  ok: boolean;
  reason?: "no-budget" | "not-due" | "crisis-in-progress" | "state-changed" | "restructure-failed";
  bondsAffected?: number;
}

/** States from which a new crisis may fire; later ones already own the country. */
const FIREABLE_STATES: readonly SovereignCrisisState[] = ["normal", "warning"];

export interface InterestSpiralRestructureOptions {
  /**
   * Spiral years counted by the caller. Background countries track the count in
   * their macro fiscal state and never write it onto the budget, so they pass it
   * here; full countries leave it unset and the budget's own counter is read.
   */
  spiralYears?: number;
}

export async function restructureForInterestSpiral(
  db: Db,
  countryCode: CountryId,
  currentTurn: number,
  realtimeMs: number,
  options: InterestSpiralRestructureOptions = {}
): Promise<InterestSpiralRestructureResult> {
  const budgetId = getNationalBudgetId(countryCode);
  const budgets = federalBudgetCollection(db);
  const budget = await budgets.findOne(
    { _id: budgetId },
    { projection: { sovereignCrisisState: 1, "fiscalConsolidation.interestSpiralYears": 1 } }
  );
  if (!budget) return { ok: false, reason: "no-budget" };
  const spiralYears = options.spiralYears ?? budget.fiscalConsolidation?.interestSpiralYears ?? 0;
  if (!shouldRestructureForInterest(spiralYears)) return { ok: false, reason: "not-due" };
  const state: SovereignCrisisState = budget.sovereignCrisisState ?? "normal";
  if (!FIREABLE_STATES.includes(state)) return { ok: false, reason: "crisis-in-progress" };

  // Guarded on the state just read, so a crisis fired elsewhere this turn wins.
  const fired = await budgets.updateOne(
    // `null` matches a missing state too, which reads as "normal".
    {
      _id: budgetId,
      sovereignCrisisState: budget.sovereignCrisisState ?? null,
    } as Filter<FederalBudget>,
    {
      $set: {
        sovereignCrisisState: "crisisPending",
        crisisFiredAt: { turn: currentTurn, realtimeMs },
      },
    }
  );
  if (fired.matchedCount !== 1) return { ok: false, reason: "state-changed" };

  const decision = await insertSovereignCrisisDecision(db, countryCode, currentTurn, realtimeMs);
  await emitInterestSpiralCrisisNews(countryCode, currentTurn, spiralYears);
  const result = await applyRestructureResolution(db, {
    countryCode,
    currentTurn,
    realtimeMs,
    decisionId: decision._id,
    executiveCharacterId: null,
  });
  if (!result.ok) return { ok: false, reason: "restructure-failed" };

  // The haircut resets the clock: a further restructuring needs two more years.
  await budgets.updateOne(
    { _id: budgetId },
    { $set: { "fiscalConsolidation.interestSpiralYears": 0 } }
  );
  return { ok: true, bondsAffected: result.bondsAffected };
}
