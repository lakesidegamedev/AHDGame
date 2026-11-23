import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { ActiveModifier } from "@/lib/approval/activeModifier";
import { stateBudgetsCollection } from "@/lib/db/repositories/stateBudgets";
import { regionalBudgetsCollection } from "@/lib/db/repositories/regionalBudgets";
import { fiscalApprovalModifiers } from "@/lib/approval/rules/performance";

export async function loadRegionalDebtApprovalModifiers(
  db: Db,
  countryId: CountryId,
  regions: readonly { _id: string; gdp?: number }[]
): Promise<Map<string, ActiveModifier[]>> {
  const filter = { countryId };
  const [stateBudgets, regionalBudgets] = await Promise.all([
    stateBudgetsCollection(db)
      .find(filter, { projection: { _id: 1, financing: 1, surplus: 1 } })
      .toArray(),
    regionalBudgetsCollection(db)
      .find(filter, { projection: { _id: 1, financing: 1, surplus: 1 } })
      .toArray(),
  ]);
  const budgetByRegion = new Map(
    [...stateBudgets, ...regionalBudgets].map((budget) => [budget._id, budget])
  );
  return new Map(
    regions.map((region) => {
      const budget = budgetByRegion.get(region._id);
      const gdp = (region.gdp ?? 0) * 1_000_000;
      return [
        region._id,
        fiscalApprovalModifiers(
          gdp > 0 ? ((budget?.financing?.principal ?? 0) / gdp) * 100 : 0,
          gdp > 0 ? ((budget?.surplus ?? 0) / gdp) * 100 : 0,
          true
        ),
      ];
    })
  );
}
