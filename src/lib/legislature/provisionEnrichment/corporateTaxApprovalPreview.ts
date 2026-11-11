import type { Db } from "mongodb";
import type { StateBudget, LegislationType } from "@/lib/db/types";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import { corporateTaxApprovalForCountry } from "@/lib/resetLegislation/rules/voterReactions";
import type { FiscalScope } from "./types";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { stateBudgetsCollection } from "@/lib/db/repositories/stateBudgets";

/** Undefined preserves legacy display for other types; empty means no known reaction. */
export async function corporateTaxApprovalPreview(
  db: Db,
  scope: FiscalScope,
  lt: LegislationType | null | undefined,
  proposedRate: number | undefined
): Promise<Record<string, number> | undefined> {
  const change = lt?.taxRateChange ?? lt?.taxSlider;
  if (change?.taxType !== "domesticCorporateTax" && change?.taxType !== "foreignCorporateTax")
    return undefined;
  if (proposedRate === undefined) return {};
  const budget =
    change.scope === "federal"
      ? await federalBudgetCollection(db).findOne(
          { _id: getNationalBudgetId(scope.countryId) },
          { projection: { taxRates: 1, taxRatePhaseIn: 1 } }
        )
      : scope.scope === "region"
        ? await stateBudgetsCollection(db)
            .findOne(
              { _id: scope.regionId, countryId: scope.countryId },
              { projection: { taxRates: 1 } }
            )
        : null;
  const pending =
    budget && "taxRatePhaseIn" in budget ? budget.taxRatePhaseIn?.[change.taxType] : undefined;
  const rate = pending ?? budget?.taxRates?.[change.taxType];
  return typeof rate === "number" && Number.isFinite(rate)
    ? corporateTaxApprovalForCountry(rate, proposedRate, scope.countryId)
    : {};
}
