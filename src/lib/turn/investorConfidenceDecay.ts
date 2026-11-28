/**
 * National-turn phase: heal each country's investor-confidence index toward
 * baseline (spec §12.4). A country already at/above baseline (or unset) is
 * skipped — confidence only recovers from below; it never drifts up past 70.
 */
import type { AnyBulkWriteOperation } from "mongodb";
import type { FederalBudget } from "@/lib/db/types";
import { getDb } from "@/lib/mongodb";
import { INVESTOR_CONFIDENCE_BASELINE } from "@/lib/nationalization/constants";
import { computeConfidenceRecovery } from "@/lib/nationalization/consequences/compute";
import { getFederalBudgetCollection } from "@/lib/db/collections/federalBudget";

export async function processInvestorConfidenceDecay(
  turn: number
): Promise<{ countriesHealed: number }> {
  const db = await getDb();
  const budgets = await (
    await getFederalBudgetCollection(db)
  )
    .find(
      {
        investorConfidence: { $lt: INVESTOR_CONFIDENCE_BASELINE },
        investorConfidenceUpdatedAtTurn: { $ne: turn },
      },
      { projection: { countryId: 1, investorConfidence: 1 } }
    )
    .toArray();

  const ops: AnyBulkWriteOperation<FederalBudget>[] = [];
  for (const b of budgets) {
    const current = b.investorConfidence;
    if (typeof current !== "number" || current >= INVESTOR_CONFIDENCE_BASELINE) continue;
    const next = Math.min(INVESTOR_CONFIDENCE_BASELINE, computeConfidenceRecovery(current));
    ops.push({
      updateOne: {
        filter: {
          countryId: b.countryId,
          investorConfidence: current,
          investorConfidenceUpdatedAtTurn: { $ne: turn },
        },
        update: {
          $set: { investorConfidence: next, investorConfidenceUpdatedAtTurn: turn },
        },
      },
    });
  }
  if (ops.length > 0) {
    const written = await (await getFederalBudgetCollection(db)).bulkWrite(ops);
    return { countriesHealed: written.modifiedCount };
  }
  return { countriesHealed: 0 };
}
