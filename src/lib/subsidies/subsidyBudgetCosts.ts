import type { Db } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import { writeGovBudgetLocal } from "@/lib/currency/govBudgetFields";
import {
  getActiveSubsidies,
  corpQualifiesForSubsidy,
  SUBSIDY_MARGIN_BONUS,
} from "@/lib/subsidies/subsidyEffects";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import {
  fxRateForCorpFromMap,
  loadFxRatesByCurrency,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import { sumRealizedRevenue } from "@/lib/turn/gdpGrowth";

/** Real-world fiscal inefficiency premium on top of the corp-delivered benefit. Tunable. */
const SUBSIDY_DEADWEIGHT_FACTOR = 1.4;
/**
 * Multiplier converting one turn's subsidized revenue into annualized budget cost.
 * Ties the fiscal cost to the delivered margin (SUBSIDY_MARGIN_BONUS × deadweight
 * premium), so cost and benefit stay in lockstep.
 *
 * Below the plants tier `revenue` is realized revenue; under plants `revenue` is
 * the capacity nameplate while the margin bonus is earned on realized revenue.
 * Billing nameplate would overcharge by the realization gap, so under plants the
 * basis is `realizedRevenue`.
 *
 * Pinned at the calibration state (`realizedRevenue === revenue`), so a world at
 * full realization bills the identical figure and less-realized worlds bill less.
 */
export const SUBSIDY_COST_MULTIPLIER = (SUBSIDY_MARGIN_BONUS / 100) * SUBSIDY_DEADWEIGHT_FACTOR;

export interface AnnualSubsidyCostMaps {
  nationalCostByBudgetId: Map<string, number>;
  stateCostByStateId: Map<string, number>;
}

/**
 * Build annualized subsidy-cost maps shared by budget writers and budget readers.
 *
 * Sector revenue is stored in each corporation's home currency, so we normalize
 * every qualifying sector contribution to anchor (₳) before summing across
 * corps. Budget money fields (federal/state/regional spending) are stored in
 * the owning country's currency since v0.2.6, so each subsidy's total is
 * re-denominated from ₳ to its country's currency here — callers write these
 * totals directly without a further conversion step.
 */
export async function loadAnnualSubsidyCostMaps(db: Db): Promise<AnnualSubsidyCostMaps> {
  const [subsidies, corporations, sectors, fxByCurrency, marketMode] = await Promise.all([
    getActiveSubsidies(db),
    db
      .collection<Corporation>("corporations")
      .find({}, { projection: { headquartersState: 1, countryId: 1, liquidCurrencyCode: 1 } })
      .toArray(),
    db
      .collection<CorporateSector>("corporateSectors")
      .find(
        {},
        {
          projection: {
            corporationId: 1,
            stateId: 1,
            countryId: 1,
            sectorType: 1,
            revenue: 1,
            realizedRevenue: 1,
            strategyId: 1,
          },
        }
      )
      .toArray(),
    loadFxRatesByCurrency(db),
    getMarketSystemModeForDb(db),
  ]);
  // P3.5: under plants, bill the subsidy off the basis its benefit lands on.
  const plantsEnabled = marketAtLeast(marketMode, "plants");

  const corpHqStateById = new Map(corporations.map((c) => [c._id.toString(), c.headquartersState]));
  const corpCountryById = new Map(corporations.map((c) => [c._id.toString(), c.countryId]));
  const currencyByCorpId = new Map<string, { code: CurrencyCode | undefined; rate: number }>();
  for (const corp of corporations) {
    currencyByCorpId.set(corp._id.toString(), {
      code: resolveCorpLiquidCurrencyCode(corp),
      rate: fxRateForCorpFromMap(corp, fxByCurrency),
    });
  }

  const nationalCostByBudgetId = new Map<string, number>();
  const stateCostByStateId = new Map<string, number>();

  for (const subsidy of subsidies) {
    let totalSubsidizedRevenue = 0;

    for (const sector of sectors) {
      const corpKey = sector.corporationId.toString();
      // State-owned corps have an empty headquartersState. Do NOT skip them here:
      // the benefit side (getSubsidyMarginModifier) evaluates them via
      // corpQualifiesForSubsidy with the same empty hqState, so skipping them on
      // the COST side alone let SOE sectors collect subsidy margin for free.
      // Pass the empty string through so cost and benefit stay symmetric.
      const corpHqState = corpHqStateById.get(corpKey) ?? "";

      if (
        corpQualifiesForSubsidy(
          subsidy,
          corpHqState,
          sector.sectorType,
          sector.stateId,
          sector.strategyId,
          sector.countryId,
          corpCountryById.get(corpKey)
        )
      ) {
        const fx = currencyByCorpId.get(corpKey);
        // Non-plants: `revenue` verbatim, exactly as before. Plants: the
        // realized basis, via the same shared helper the GDP rollup uses so the
        // two never drift apart.
        const basis = sumRealizedRevenue([sector], plantsEnabled);
        totalSubsidizedRevenue += readCorpEconomicAnchor(basis, fx?.code, fx?.rate ?? 1);
      }
    }

    if (totalSubsidizedRevenue === 0) continue;

    const annualCostAnchor = totalSubsidizedRevenue * TURNS_PER_YEAR * SUBSIDY_COST_MULTIPLIER;
    // Budget spending fields are country-currency; a raw ₳ write would land
    // 1/fxRate of the true cost in weak-currency countries. Missing currency
    // or rate (forex off / unseeded) passes through unchanged.
    const countryCurrency =
      COUNTRY_CURRENCY_MAP[subsidy.countryId as keyof typeof COUNTRY_CURRENCY_MAP];
    const annualCost = writeGovBudgetLocal(
      annualCostAnchor,
      countryCurrency,
      (countryCurrency ? fxByCurrency.get(countryCurrency) : undefined) ?? 0
    );
    if (subsidy.scope === "state" && subsidy.stateId) {
      stateCostByStateId.set(
        subsidy.stateId,
        (stateCostByStateId.get(subsidy.stateId) ?? 0) + annualCost
      );
      continue;
    }

    const budgetId = getNationalBudgetId(subsidy.countryId);
    nationalCostByBudgetId.set(budgetId, (nationalCostByBudgetId.get(budgetId) ?? 0) + annualCost);
  }

  return { nationalCostByBudgetId, stateCostByStateId };
}
