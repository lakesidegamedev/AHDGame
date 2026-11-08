/**
 * Shell for background countries' national budgets.
 *
 * A background country's budget is derived from its macro economy instead of
 * regional tax bases and enacted laws (see
 * `world/macro/rules/backgroundBudget.ts`). Per-turn refresh and fiscal-year
 * close write the derived revenue, spending and GDP onto the ordinary budget
 * document, so treasury, bond issuance, ratings and the default path run on it
 * unchanged.
 */
import type { Db } from "mongodb";
import type { FederalBudget, FederalRevenue, FederalSpending } from "@/lib/db/types/budget";
import type { MacroCountryState } from "@/lib/world/macro/types";
import { ACTIVE_MACRO_COUNTRY_FILTER } from "@/lib/world/macro/retirement";
import {
  backgroundAnnualGdp,
  backgroundBudgetFigures,
  macroAggregateOutput,
  PROGRAMME_CATEGORY,
  type BackgroundFiscalState,
} from "@/lib/world/macro/rules/backgroundBudget";
import { governmentEconomicPosition } from "@/lib/world/macro/rules/nationalPolitics";

export interface BackgroundBudgetSource {
  countryId: string;
  fiscalCapacity: number;
  output: number;
  fiscal: BackgroundFiscalState;
  /** Governing parties' economic position on the party grid (-5..+5), or null. */
  governmentEconomicPosition: number | null;
}

/**
 * Every background country whose budget derives from its macro economy, keyed
 * by country id. One projected read. A country appears once its kernel has
 * fixed the fiscal baseline (its first tick); before that its budget keeps the
 * ordinary path.
 */
export async function loadBackgroundBudgetSources(
  db: Db
): Promise<Map<string, BackgroundBudgetSource>> {
  const docs = await db
    .collection<MacroCountryState>("macroCountries")
    .find(
      {
        simulationTier: "background-macro",
        "dataQuality.provenance": "authored-2027",
        nationalFiscal: { $exists: true },
        ...ACTIVE_MACRO_COUNTRY_FILTER,
      },
      {
        projection: {
          entityId: 1,
          fiscalCapacity: 1,
          sectors: 1,
          nationalFiscal: 1,
          "nationalPolitics.parties": 1,
          "nationalPolitics.governmentPartyIds": 1,
        },
      }
    )
    .toArray();
  const out = new Map<string, BackgroundBudgetSource>();
  for (const doc of docs) {
    if (!doc.nationalFiscal) continue;
    out.set(doc.entityId, {
      countryId: doc.entityId,
      fiscalCapacity: doc.fiscalCapacity,
      output: macroAggregateOutput(doc.sectors),
      fiscal: doc.nationalFiscal,
      governmentEconomicPosition: doc.nationalPolitics
        ? governmentEconomicPosition(doc.nationalPolitics)
        : null,
    });
  }
  return out;
}

/**
 * The derived revenue and spending documents for one background budget, or
 * null when the baseline cannot price a GDP (the caller keeps the ordinary
 * path then).
 */
export function backgroundBudgetDocuments(
  source: BackgroundBudgetSource,
  debtInterest: number,
  fiscal: BackgroundFiscalState = source.fiscal
): { gdp: number; revenue: FederalRevenue; spending: FederalSpending } | null {
  const gdp = backgroundAnnualGdp(fiscal, source.output);
  if (gdp === null) return null;
  const figures = backgroundBudgetFigures({
    gdp,
    fiscalCapacity: source.fiscalCapacity,
    fiscal,
    debtInterest,
  });
  return {
    gdp,
    revenue: {
      incomeTax: 0,
      domesticCorporateTax: 0,
      foreignCorporateTax: 0,
      payrollTax: 0,
      tariffs: 0,
      salesTax: 0,
      healthcareIncome: 0,
      other: figures.revenueTotal,
      total: figures.revenueTotal,
    },
    spending: {
      byCategory: { [PROGRAMME_CATEGORY]: figures.programmes },
      stateGrants: 0,
      debtInterest: figures.debtInterest,
      total: figures.spendingTotal,
    },
  };
}

/** The per-turn budget write for a background country, or null to keep the ordinary path. */
export function backgroundBudgetRefresh(
  budget: Pick<FederalBudget, "_id">,
  source: BackgroundBudgetSource,
  debtInterest: number,
  now: Date
) {
  const derived = backgroundBudgetDocuments(source, debtInterest);
  if (!derived) return null;
  return {
    updateOne: {
      filter: { _id: budget._id },
      update: {
        $set: {
          revenue: derived.revenue,
          spending: derived.spending,
          surplus: derived.revenue.total - derived.spending.total,
          gdp: derived.gdp,
          updatedAt: now,
        },
      },
    },
  };
}
