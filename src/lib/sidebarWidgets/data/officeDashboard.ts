import type { Db } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencyCodes";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencyCodes";
import { getCountryConfig, type CountryId } from "@/lib/constants/countries";
import { isParliamentarySystem } from "@/lib/constants/countriesCore";
import { getRegionalExecutiveOfficeKey } from "@/lib/constants/countryOfficesClient";
import type { ElectedOfficial, State } from "@/lib/db/types";
import type { FederalBudget, StateBudget } from "@/lib/db/types/budget";
import type { RegionalBudget } from "@/lib/db/types/regionalBudget";
import type { GovernmentApproval } from "@/lib/db/types/governmentApproval";
import type { StateApprovalHistory } from "@/lib/db/types/stateApproval";
import type { MacroMetricsDoc } from "@/lib/db/types/macroMetrics";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import { federalSurplus } from "@/lib/budget/federalSurplus";
import { normalizeStateSpending } from "@/lib/budget/spending";
import { resolveCountryCurrencyCode } from "@/lib/currency/govBudgetFields";
import { isExecutiveOffice } from "@/lib/elections/executiveOffice";
import { populationWeightedAverage } from "@/lib/metrics/populationWeightedAverage";
import { loadViewerCharacter } from "./viewerContext";

export interface OfficeDashboardWidgetData {
  scope: "state" | "nation";
  countryId: CountryId;
  /** Region code for a state office; null for a national one. */
  stateId: string | null;
  /** Region name, or the country name for national offices. */
  name: string;
  approval: number | null;
  budgetBalance: number | null;
  currencyCode: CurrencyCode | null;
  gdpGrowth: number | null;
  unemployment: number | null;
}

type MetricsRow = Pick<MacroMetricsDoc, "_id"> & {
  economic?: {
    gdpGrowth?: { value?: number };
    unemploymentRate?: { value?: number };
  };
};

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

async function stateOffice(
  db: Db,
  countryId: CountryId,
  stateId: string
): Promise<OfficeDashboardWidgetData | null> {
  const parliamentary = isParliamentarySystem(getCountryConfig(countryId));
  const [state, approval, metrics, regionalBudget, stateBudget] = await Promise.all([
    db
      .collection<State>("states")
      .findOne({ _id: stateId, countryId }, { projection: { name: 1 } }),
    db
      .collection<StateApprovalHistory>("stateApprovalHistory")
      .findOne({ _id: stateId, countryId }, { projection: { approvalRating: 1 } }),
    db
      .collection<MetricsRow>("macroMetrics")
      .findOne(
        { _id: stateId, countryId },
        { projection: { "economic.gdpGrowth.value": 1, "economic.unemploymentRate.value": 1 } }
      ),
    // Same split as the region budget page: parliamentary regions keep their
    // balance on regionalBudgets, the rest derive it from stateBudgets.
    parliamentary
      ? db
          .collection<RegionalBudget>("regionalBudgets")
          .findOne({ _id: stateId, countryId }, { projection: { surplus: 1 } })
      : null,
    parliamentary
      ? null
      : db
          .collection<StateBudget>("stateBudgets")
          .findOne({ _id: stateId, countryId }, { projection: { revenue: 1, spending: 1 } }),
  ]);
  if (!state) return null;
  const budgetBalance = regionalBudget
    ? finite(regionalBudget.surplus)
    : stateBudget
      ? (stateBudget.revenue?.total ?? 0) - normalizeStateSpending(stateBudget.spending).total
      : null;
  return {
    scope: "state",
    countryId,
    stateId,
    name: state.name,
    approval: finite(approval?.approvalRating),
    budgetBalance,
    currencyCode: resolveCountryCurrencyCode({ countryId }) ?? null,
    gdpGrowth: finite(metrics?.economic?.gdpGrowth?.value),
    unemployment: finite(metrics?.economic?.unemploymentRate?.value),
  };
}

async function nationOffice(db: Db, countryId: CountryId): Promise<OfficeDashboardWidgetData> {
  const [approval, budget, states] = await Promise.all([
    db
      .collection<GovernmentApproval>("governmentApprovals")
      .findOne({ _id: countryId }, { projection: { approvalRating: 1 } }),
    db
      .collection<FederalBudget>("federalBudget")
      .findOne({ _id: getNationalBudgetId(countryId) } as { _id: "federal" }, {
        projection: {
          countryId: 1,
          currencyCode: 1,
          "revenue.total": 1,
          "spending.total": 1,
          "economicFactors.gdpGrowth": 1,
        },
      }),
    db
      .collection<State>("states")
      .find({ countryId }, { projection: { _id: 1, population: 1 } })
      .toArray(),
  ]);
  // Population-weighted, as on the national Economy page. Scoped to the
  // country because region ids repeat across countries.
  const metrics = await db
    .collection<MetricsRow>("macroMetrics")
    .find(
      { _id: { $in: states.map((s) => s._id) }, countryId },
      { projection: { "economic.unemploymentRate.value": 1 } }
    )
    .toArray();
  const population = new Map(states.map((s) => [s._id, s.population ?? 0]));
  const unemployment = populationWeightedAverage(
    metrics.map((m) => ({
      value: m.economic?.unemploymentRate?.value,
      population: population.get(m._id) ?? 0,
    }))
  ).value;
  return {
    scope: "nation",
    countryId,
    stateId: null,
    name: getCountryConfig(countryId).name,
    approval: finite(approval?.approvalRating),
    budgetBalance: budget ? federalSurplus(budget) : null,
    currencyCode:
      (budget ? resolveCountryCurrencyCode(budget) : undefined) ??
      COUNTRY_CURRENCY_MAP[countryId] ??
      null,
    gdpGrowth: finite(budget?.economicFactors?.gdpGrowth),
    unemployment,
  };
}

/**
 * The place the viewer runs: their region as its regional executive, or their
 * nation as head of state or government or a cabinet member. Null otherwise.
 */
export async function loadOfficeDashboard(
  db: Db,
  viewer: { userId: string }
): Promise<OfficeDashboardWidgetData | null> {
  const character = await loadViewerCharacter(db, viewer);
  if (!character) return null;
  const countryId = character.countryId;
  const [regional, cabinetSeat] = await Promise.all([
    db.collection<ElectedOfficial>("electedOfficials").findOne(
      {
        officeType: getRegionalExecutiveOfficeKey(countryId),
        characterId: character._id,
        countryId,
      },
      { projection: { state: 1 } }
    ),
    db
      .collection<{ countryId: CountryId }>("cabinetMembers")
      .findOne({ characterId: character._id }, { projection: { countryId: 1 } }),
  ]);
  if (regional?.state) return stateOffice(db, countryId, regional.state);
  if (cabinetSeat) return nationOffice(db, cabinetSeat.countryId ?? countryId);
  if (isExecutiveOffice(character.currentOffice)) return nationOffice(db, countryId);
  return null;
}
