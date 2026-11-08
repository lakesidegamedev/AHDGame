/**
 * Shell for the fiscal stabilizer. The rules live in
 * `./rules/fiscalStabilizer.ts`; this file loads what they need, turns a
 * package into budget writes, and reports it in the news and approval.
 *
 * The package goes through the ordinary budget write path, not bill
 * sponsorship: spending cuts become a per-category scale that
 * `calculateFederalSpending` applies on every recompute, and tax rises become
 * `taxRatePhaseIn` targets that the treasury turn ramps toward a point a turn.
 */
import type { Db } from "mongodb";
import type {
  FederalBudget,
  FederalRevenue,
  FederalSpending,
  FiscalConsolidationRecord,
  FiscalConsolidationState,
} from "@/lib/db/types/budget";
import type { GovernmentFormation } from "@/lib/db/types/governmentFormation";
import type { PoliticalParty } from "@/lib/db/types/party";
import type { ActiveModifier } from "@/lib/utils/approvalModifiers";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { createSystemNewsPost } from "@/lib/news";
import { TERRORISM_SPENDING_KEY } from "@/lib/livingConflict/rules/transnationalTerrorism";
import { REFUGEE_SERVICE_SPENDING_KEY } from "@/lib/livingConflict/rules/refugeeReception";
import { CAPACITY_REPAIR_SPENDING_KEY } from "@/lib/livingConflict/rules/capacityDestruction";
import { NI_SECURITY_SPENDING_KEY } from "@/lib/countries/uk/northernIreland/rules";
import { getDebtThreshold } from "./debt";
import { normalizeFederalSpending } from "./spending";
import {
  applyCategoryScale,
  fiscalConsolidationApprovalEffect,
  nextInterestSpiralYears,
  planFiscalConsolidation,
  type FiscalConsolidationPackage,
  type StabilizerTaxLine,
} from "./rules/fiscalStabilizer";

/** Party economic positions run on a -5..+5 scale (see formNppCabinet). */
const PARTY_POSITION_SCALE = 5;

/** Spending lines that are obligations a government cannot simply trim. */
const OBLIGATION_CATEGORIES = [
  TERRORISM_SPENDING_KEY,
  REFUGEE_SERVICE_SPENDING_KEY,
  CAPACITY_REPAIR_SPENDING_KEY,
  NI_SECURITY_SPENDING_KEY,
];

/** Revenue lines the stabilizer raises, with the rate keys that drive each. */
const TAX_LINE_KEYS: ReadonlyArray<{ revenue: keyof FederalRevenue; rates: string[] }> = [
  { revenue: "incomeTax", rates: ["incomeTaxLow", "incomeTaxMiddle", "incomeTaxHigh"] },
  { revenue: "salesTax", rates: ["salesTax"] },
  { revenue: "payrollTax", rates: ["payrollTax"] },
  { revenue: "domesticCorporateTax", rates: ["domesticCorporateTax"] },
  { revenue: "foreignCorporateTax", rates: ["foreignCorporateTax"] },
];

/**
 * Ruling party economic position per country, scaled to [-1, 1]. Two reads for
 * the whole fiscal pass; a country with no formed government is absent (centre).
 */
export async function loadRulingEconomicPositions(
  db: Db,
  countryIds: readonly string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (countryIds.length === 0) return out;
  const governments = await db
    .collection<GovernmentFormation>("governmentFormations")
    .find({ _id: { $in: [...countryIds] } }, { projection: { _id: 1, governingPartyId: 1 } })
    .toArray();
  const partyByCountry = new Map<string, number>();
  for (const gov of governments) {
    const sequentialId = Number(gov.governingPartyId);
    if (gov.governingPartyId && Number.isFinite(sequentialId)) {
      partyByCountry.set(String(gov._id), sequentialId);
    }
  }
  if (partyByCountry.size === 0) return out;
  const parties = await db
    .collection<PoliticalParty>("politicalParties")
    .find(
      {
        countryId: { $in: [...partyByCountry.keys()] as CountryId[] },
        sequentialId: { $in: [...new Set(partyByCountry.values())] },
      },
      { projection: { countryId: 1, sequentialId: 1, economicPosition: 1 } }
    )
    .toArray();
  for (const party of parties) {
    if (partyByCountry.get(party.countryId) !== party.sequentialId) continue;
    if (typeof party.economicPosition !== "number" || !Number.isFinite(party.economicPosition))
      continue;
    out.set(
      party.countryId,
      Math.max(-1, Math.min(1, party.economicPosition / PARTY_POSITION_SCALE))
    );
  }
  return out;
}

function taxLinesFor(budget: FederalBudget, revenue: FederalRevenue): StabilizerTaxLine[] {
  const rates = { ...budget.taxRates };
  const pending = (budget.taxRatePhaseIn ?? {}) as Record<string, number | undefined>;
  return TAX_LINE_KEYS.map(({ revenue: revenueKey, rates: keys }) => ({
    revenue: Number(revenue[revenueKey]) || 0,
    // A rise builds on a change already ramping in, never undoes it.
    rates: Object.fromEntries(
      keys.map((key) => [key, Math.max(Number(rates[key]) || 0, Number(pending[key]) || 0)])
    ),
  }));
}

export interface FiscalStabilizerOutcome {
  /** Spending to persist for the coming year (cuts already applied). */
  spending: FederalSpending;
  /** The package enacted, or null when none was needed. */
  package: FiscalConsolidationRecord | null;
  /** Dotted `$set` fields for the fiscal-close budget write. */
  set: Record<string, unknown>;
  /** Consecutive fiscal years in which debt interest took over half of revenue. */
  interestSpiralYears: number;
}

/**
 * Run the stabilizer for one AI-run country at fiscal close. `spending` is the
 * year's spending after any crisis austerity; the result's `spending` replaces
 * it in the budget write.
 */
export function applyFiscalStabilizer(input: {
  budget: FederalBudget;
  revenue: FederalRevenue;
  spending: FederalSpending;
  gdp: number;
  debtToGdpRatio: number;
  rulingEconomicPosition: number | null;
  fiscalYear: number;
  currentTurn: number;
  /** False while crisis austerity or an IMF programme already caps spending. */
  consolidate?: boolean;
}): FiscalStabilizerOutcome {
  const { budget, revenue, spending, gdp, debtToGdpRatio, fiscalYear, currentTurn } = input;
  const prior: FiscalConsolidationState = budget.fiscalConsolidation ?? {};
  const interestSpiralYears = nextInterestSpiralYears(prior.interestSpiralYears ?? 0, {
    debtInterest: spending.debtInterest,
    revenueTotal: revenue.total,
  });

  const set: Record<string, unknown> = {
    "fiscalConsolidation.interestSpiralYears": interestSpiralYears,
  };
  if (input.consolidate === false) return { spending, package: null, set, interestSpiralYears };

  const plan: FiscalConsolidationPackage | null = planFiscalConsolidation({
    gdp,
    revenueTotal: revenue.total,
    spendingTotal: spending.total,
    debtInterest: spending.debtInterest,
    debtToGdpRatio,
    previousDebtToGdpRatio:
      typeof budget.debtToGdpRatio === "number" && Number.isFinite(budget.debtToGdpRatio)
        ? budget.debtToGdpRatio
        : null,
    debtThreshold: getDebtThreshold(debtToGdpRatio, budget.sovereignRiskAnchor),
    rulingEconomicPosition: input.rulingEconomicPosition,
    spendingByCategory: spending.byCategory ?? {},
    categoryScale: prior.categoryScale,
    protectedCategories: OBLIGATION_CATEGORIES,
    taxLines: taxLinesFor(budget, revenue),
  });

  if (!plan || plan.taxRise + plan.spendingCut <= 0) {
    return { spending, package: null, set, interestSpiralYears };
  }

  const record: FiscalConsolidationRecord = {
    fiscalYear,
    appliedTurn: currentTurn,
    primaryBalanceGdpShare: plan.primaryBalanceGdpShare,
    targetPrimaryBalanceGdpShare: plan.targetPrimaryBalanceGdpShare,
    size: plan.size,
    sizeGdpShare: plan.sizeGdpShare,
    plannedTaxShare: plan.plannedTaxShare,
    taxRise: plan.taxRise,
    spendingCut: plan.spendingCut,
    unfunded: plan.unfunded,
    categoryCuts: plan.categoryCuts,
    taxRateTargets: plan.taxRateTargets,
    approvalCost: plan.approvalCost,
  };
  const cutFactors = Object.fromEntries(
    Object.entries(plan.categoryCuts).map(([key, cut]) => [key, 1 - cut])
  );
  const nextSpending = normalizeFederalSpending({
    ...spending,
    byCategory: applyCategoryScale(spending.byCategory ?? {}, cutFactors),
  });
  set["fiscalConsolidation.categoryScale"] = plan.categoryScale;
  set["fiscalConsolidation.lastPackage"] = record;
  for (const [key, target] of Object.entries(plan.taxRateTargets)) {
    set[`taxRatePhaseIn.${key}`] = target;
  }
  return { spending: nextSpending, package: record, set, interestSpiralYears };
}

function pct(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

export async function emitFiscalConsolidationNews(
  db: Db,
  countryId: string,
  record: FiscalConsolidationRecord,
  gdp: number
): Promise<void> {
  const name = COUNTRY_CONFIGS[countryId as CountryId]?.name ?? countryId;
  const share = (amount: number) => pct(gdp > 0 ? amount / gdp : 0);
  const deficit = -record.primaryBalanceGdpShare;
  const content =
    `Austerity budget in ${name}: with a primary deficit of ${pct(deficit)} of GDP, the ` +
    `government has enacted a consolidation package worth ${share(record.taxRise + record.spendingCut)} ` +
    `of GDP for the coming fiscal year, with tax rises of ${share(record.taxRise)} and spending ` +
    `cuts of ${share(record.spendingCut)}. Defence and debt interest are spared. ` +
    `The measures are expected to cost the government about ${record.approvalCost.toFixed(1)} ` +
    `points of approval.`;
  await createSystemNewsPost(content, "sovereign", {
    db,
    title: `${name} enacts an austerity budget`,
  });
}

/**
 * Approval chips for every country whose latest package is still within a
 * year of enactment. One projected read for the whole snapshot.
 */
export async function loadFiscalConsolidationApprovalEffects(
  db: Db,
  turn: number
): Promise<Map<string, number>> {
  const budgets = await db
    .collection<FederalBudget>("federalBudget")
    .find(
      { "fiscalConsolidation.lastPackage.appliedTurn": { $gt: turn - TURNS_PER_YEAR } },
      {
        projection: {
          _id: 1,
          countryId: 1,
          "fiscalConsolidation.lastPackage.appliedTurn": 1,
          "fiscalConsolidation.lastPackage.approvalCost": 1,
        },
      }
    )
    .toArray();
  const out = new Map<string, number>();
  for (const budget of budgets) {
    const last = budget.fiscalConsolidation?.lastPackage;
    if (!last) continue;
    const effect = fiscalConsolidationApprovalEffect(
      last.approvalCost,
      turn - last.appliedTurn,
      TURNS_PER_YEAR
    );
    if (effect < 0) out.set(String(budget.countryId ?? budget._id), effect);
  }
  return out;
}

export function fiscalConsolidationApprovalModifiers(effect: number | undefined): ActiveModifier[] {
  if (!effect) return [];
  return [
    {
      id: "fiscal_consolidation",
      label: "Austerity budget",
      effect,
      marginEffect: 0,
      source: "fiscal",
    },
  ];
}
