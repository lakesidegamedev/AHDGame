import type { FederalBudget } from "@/lib/db/types";
import { withTurnValueSettlement } from "@/lib/turn/withTurnValueSettlement";
import { afterCommit } from "@/lib/db/sessionDb";
/**
 * Per-turn recovery processor — runs from the bond turn pipeline.
 *
 * Iterates every country in `recovering` state, computes the transition,
 * persists, and emits a recovery-complete news event on exit.
 */

import type { AnyBulkWriteOperation, Db } from "mongodb";
import { isInGoodFiscalStanding } from "./fiscalStanding";
import { computeRecoveryTransition } from "./computeTransition";
import { emitRecoveryCompleteNews } from "../crisisNews";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";

export interface RecoveryTurnReport {
  countriesEvaluated: number;
  countriesExited: string[];
}

export async function processSovereignRecoveryTurn(
  db: Db,
  currentTurn: number
): Promise<RecoveryTurnReport> {
  return withTurnValueSettlement(db, "sovereign-recovery", currentTurn, (db) =>
    applyRecovery(db, currentTurn)
  );
}

async function applyRecovery(db: Db, currentTurn: number): Promise<RecoveryTurnReport> {
  const recovering = await federalBudgetCollection(db)
    .find({ sovereignCrisisState: "recovering" })
    .toArray();

  const countriesExited: string[] = [];
  const ops: AnyBulkWriteOperation<FederalBudget>[] = [];

  for (const budget of recovering) {
    const inGoodStanding = isInGoodFiscalStanding({
      revenueTotal: budget.revenue?.total ?? 0,
      spendingTotal: budget.spending?.total ?? 0,
      spendingDebtInterest: budget.spending?.debtInterest ?? 0,
    });

    const transition = computeRecoveryTransition({
      currentState: budget.sovereignCrisisState,
      recoveryStartedAtTurn: budget.recoveryStartedAt?.turn ?? null,
      fiscalDisciplineStreak: budget.recoveryFiscalDisciplineStreak ?? 0,
      inGoodStanding,
      currentTurn,
      recoveryGdpPenaltyTurnsRemaining: budget.recoveryGdpPenaltyTurnsRemaining ?? null,
    });

    if (Object.keys(transition.set).length === 0) continue;

    ops.push({ updateOne: { filter: { _id: budget._id }, update: { $set: transition.set } } });

    if (transition.exitedRecovery) {
      const code = budget.countryId ?? String(budget._id);
      countriesExited.push(code);
      await afterCommit(db, () => emitRecoveryCompleteNews(code, currentTurn));
    }
  }

  if (ops.length) await federalBudgetCollection(db).bulkWrite(ops);
  return {
    countriesEvaluated: recovering.length,
    countriesExited,
  };
}
