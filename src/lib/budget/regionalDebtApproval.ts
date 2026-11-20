import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { ActiveModifier } from "@/lib/approval/activeModifier";
import { stateBudgetsCollection } from "@/lib/db/repositories/stateBudgets";
import { regionalBudgetsCollection } from "@/lib/db/repositories/regionalBudgets";
import { regionalDebtApprovalPenalty } from "./rules/regionalDebt";

export async function loadRegionalDebtApprovalModifiers(
  db: Db,
  countryId: CountryId,
  regions: readonly { _id: string; gdp?: number }[]
): Promise<Map<string, ActiveModifier[]>> {
  const filter = { countryId };
  const [stateBudgets, regionalBudgets] = await Promise.all([
    stateBudgetsCollection(db)
      .find(filter, { projection: { _id: 1, financing: 1 } })
      .toArray(),
    regionalBudgetsCollection(db)
      .find(filter, { projection: { _id: 1, financing: 1 } })
      .toArray(),
  ]);
  const debtByRegion = new Map(
    [...stateBudgets, ...regionalBudgets].map((b) => [b._id, b.financing?.principal ?? 0])
  );
  return new Map(
    regions.map((region) => {
      const effect = regionalDebtApprovalPenalty(
        debtByRegion.get(region._id) ?? 0,
        (region.gdp ?? 0) * 1_000_000
      );
      return [
        region._id,
        effect < 0
          ? [
              {
                id: "regionalDebt",
                label: "Regional debt burden",
                effect,
                source: "fiscal",
                marginEffect: 0,
              },
            ]
          : [],
      ];
    })
  );
}
