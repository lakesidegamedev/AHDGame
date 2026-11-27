import { SUPPLY_CASH_PLAN_INDEX } from "@/lib/corporations/supplyExchange/planIndexes";
import { createPlannedIndexes } from "../indexPlans";
import type { Migration } from "../types";
export const migration: Migration = {
  id: "2026-11-26-supply-agreement-plan-index",
  description:
    "Add the bounded unfinished supply cash-plan recovery index without rewriting balances.",
  idempotent: true,
  execute: async (db, ctx) =>
    createPlannedIndexes(db, ctx.dryRun, [
      {
        collection: "bankMoneyMoves",
        keys: SUPPLY_CASH_PLAN_INDEX.keys,
        options: SUPPLY_CASH_PLAN_INDEX.options,
      },
    ]),
};
