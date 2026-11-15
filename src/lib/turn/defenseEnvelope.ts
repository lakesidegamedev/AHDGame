import type { Db } from "mongodb";
import type { FederalBudget } from "@/lib/db/types/budget";
import { DEFENSE_ENVELOPE_FALLBACK_GDP_FRACTION } from "@/lib/constants/military";
import { getFederalBudgetCollection } from "@/lib/db/collections/federalBudget";

/** The budget fields the defence-line cascade reads. */
export type DefenseLineSource = Pick<
  FederalBudget,
  "spending" | "baselineSpendingByCategory" | "gdp"
>;

/**
 * A country's defence appropriation for the year, in absolute local currency:
 * enacted, else baseline category, else a fraction of GDP.
 *
 * UNSLICED and UNCAPPED: the appropriation accrues the whole enacted line.
 * The Defense metrics do not vary with this line (see `upkeepBurden`, where
 * the accrual cancels); it still bounds what procurement can afford.
 *
 * Shared by the appropriation and the metrics on purpose: a line one read
 * and the other did not would silently diverge the charge from the measured
 * burden.
 */
export function resolveDefenseLineFrom(budget: DefenseLineSource | null): number {
  if (!budget) return 0;
  const enacted = budget.spending?.byCategory?.defense;
  if (typeof enacted === "number" && enacted > 0) return enacted;
  const baseline = budget.baselineSpendingByCategory?.defense;
  if (typeof baseline === "number" && baseline > 0) return baseline;
  const gdp = budget.gdp;
  if (typeof gdp === "number" && gdp > 0) return gdp * DEFENSE_ENVELOPE_FALLBACK_GDP_FRACTION;
  return 0;
}

/** DB-reading form of {@link resolveDefenseLineFrom}. */
export async function resolveDefenseLine(db: Db, countryId: string): Promise<number> {
  const budget = await (await getFederalBudgetCollection(db)).findOne({ countryId });
  return resolveDefenseLineFrom(budget);
}
