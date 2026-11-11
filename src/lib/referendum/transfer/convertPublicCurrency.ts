import { redenominatePublicRegion } from "./rules/publicCurrency";
/** Reunification redenominates regional public stocks without changing people, rates or turn stamps. */
import type { Db } from "mongodb";
import type { State } from "@/lib/db/types/state";
import { scaleDeep } from "../secede/docScale";
import { statesCollection } from "@/lib/db/repositories/states";
import { macroMetricsCollection } from "@/lib/db/repositories/macroMetrics";
import { infraProjectsCollection } from "@/lib/db/repositories/infraProjects";
import type { Document } from "mongodb";
import { conflictCapacityObligationsCollection } from "@/lib/db/repositories/conflictCapacityObligations";

export async function convertPublicCurrency(
  db: Db,
  regionId: string,
  scale: number
): Promise<void> {
  if (scale === 1) return;
  const state = await statesCollection(db).findOne({ _id: regionId });
  if (!state) throw new Error("Missing transferred region");
  const set = redenominatePublicRegion(state, scale);
  await statesCollection(db).updateOne({ _id: regionId }, { $set: set });
  await convertBudgetMoney(
    db,
    "stateBudgets",
    regionId,
    ["revenue", "taxBases", "spending", "balance", "surplus", "stateGdp"],
    scale
  );
  await convertBudgetMoney(
    db,
    "regionalBudgets",
    regionId,
    [
      "councilTaxRevenue",
      "businessRatesRevenue",
      "westminsterGrant",
      "totalBudget",
      "enactedBillCosts",
      "subsidyCosts",
      "surplus",
    ],
    scale
  );
  await macroMetricsCollection<{ _id: string }>(db).updateOne(
    { _id: regionId },
    { $mul: { "economic.medianIncome.value": scale } }
  );
  await infraProjectsCollection<Document>(db).updateMany(
    { regionId },
    { $mul: { upkeepBase: scale, constructionCostBase: scale } }
  );
  await conflictCapacityObligationsCollection<Document>(db).updateMany(
    { regionId },
    { $mul: { capitalStockBefore: scale, destroyedCapital: scale } }
  );
}

async function convertBudgetMoney(
  db: Db,
  name: "stateBudgets" | "regionalBudgets",
  regionId: string,
  fields: string[],
  scale: number
) {
  const doc = await db
    .collection<Record<string, unknown> & { _id: string }>(name)
    .findOne({ _id: regionId });
  if (!doc) return;
  const money = Object.fromEntries(
    fields
      .filter((field) => doc[field] !== undefined)
      .map((field) => [field, scaleDeep(doc[field], scale)])
  );
  await db
    .collection<Record<string, unknown> & { _id: string }>(name)
    .updateOne({ _id: regionId }, { $set: money });
}
