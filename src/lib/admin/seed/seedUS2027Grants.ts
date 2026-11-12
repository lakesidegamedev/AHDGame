import type { Db } from "mongodb";
import type { FederalBudget, StateBudget } from "@/lib/db/types";
import { processFormulaGrants } from "@/lib/budget/grants";
import { openingRegionalGrantBudget } from "@/lib/budget/rules/formulaGrants";

/** Reconcile fresh regional receipts before snapshots and v2 opening claims are built. */
export async function seedUS2027Grants(db: Db): Promise<void> {
  const budget = await db.collection<FederalBudget>("federalBudget").findOne({ countryId: "US" });
  if (!budget) throw new Error("US grant opening needs its national budget");
  const [distribution, regions] = await Promise.all([
    processFormulaGrants(db, budget.revenue.total, "US"),
    db.collection<StateBudget>("stateBudgets").find({ countryId: "US" }).toArray(),
  ]);
  const total = Object.values(distribution).reduce((sum, n) => sum + n, 0);
  if (Math.abs(total - budget.spending.stateGrants) >= 1)
    throw new Error("US opening grant receipts do not match federal spending");
  if (regions.length !== Object.keys(distribution).length)
    throw new Error("US opening grants need every regional budget");
  await db.collection<StateBudget>("stateBudgets").bulkWrite(
    regions.map((region) => {
      const grant = distribution[region.stateId];
      if (grant === undefined) throw new Error(`No opening grant for ${region.stateId}`);
      const next = openingRegionalGrantBudget({
        revenue: region.revenue.total,
        oldGrant: region.revenue.federalGrants,
        newGrant: grant,
        spending: region.spending.byCategory,
      });
      return {
        updateOne: {
          filter: { _id: region._id, countryId: "US" },
          update: {
            $set: {
              "revenue.federalGrants": grant,
              "revenue.total": next.revenue,
              "spending.byCategory": next.byCategory,
              "spending.total": next.spending,
              surplus: next.surplus,
            },
          },
        },
      };
    })
  );
}
