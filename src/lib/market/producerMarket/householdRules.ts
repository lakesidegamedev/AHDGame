/** Household orders spend a named cash wallet, using the shared consumption basket. */
import type { CommodityType } from "@/lib/constants/commodities";
import type { PurchaseOrder } from "./rules";
import { laneKeyOf } from "./laneKey";
import {
  demandElasticity,
  demandSteps,
  incomeAdjustedWeights,
} from "@/lib/market/rules/demandCurve";

export const HOUSEHOLD_CONSUMER_BASKET: Partial<Record<CommodityType, number>> = {
  food: 0.2,
  energy: 0.08,
  retail: 0.1,
  vehicles: 0.06,
  electronics: 0.05,
  pharmaceuticals: 0.03,
  healthcare_services: 0.09,
  real_estate_services: 0.1,
  financial_services: 0.05,
  network_services: 0.05,
  software: 0.03,
  freight: 0.03,
  consulting_services: 0.02,
  building_materials: 0.02,
  plastics: 0.01,
  chemicals: 0.01,
};

export function householdPurchaseOrders(input: {
  accountId: string;
  /** Historical replay override only; ordinary household orders always share fairly. */
  fairShare?: boolean;
  /** Country the spending wallet belongs to; the funded book places demand here. */
  countryId?: string;
  /** State the spending wallet belongs to; a freight order takes local sellers first. */
  stateId?: string;
  /** Opening wallet plus wages already paid into it. No imputed GDP or bank deposits. */
  cash: number;
  spendFraction: number;
  products: readonly {
    commodity: string;
    book: string;
    maximumUnitPrice: number;
    /** Relative basket weights, after any income or demographic adjustment. */
    weight: number;
    eligibleOfferIds?: readonly string[];
  }[];
  /**
   * Demand curves (issue #5448). Absent: one order per good, as before. Present:
   * basket weights shift with `incomeIndex` and each good becomes a price
   * ladder; see market/rules/demandCurve.
   */
  demandCurve?: { incomeIndex?: number };
}): PurchaseOrder[] {
  if (
    !input.accountId ||
    !Number.isFinite(input.cash) ||
    input.cash < 0 ||
    !Number.isFinite(input.spendFraction) ||
    input.spendFraction < 0 ||
    input.spendFraction > 1
  )
    throw new Error("Invalid household spending wallet");
  let totalWeight = 0;
  const seen = new Set<string>();
  for (const p of input.products) {
    const key = laneKeyOf(p.commodity, p.book);
    if (
      !p.commodity ||
      !p.book ||
      seen.has(key) ||
      !Number.isFinite(p.weight) ||
      p.weight < 0 ||
      !Number.isFinite(p.maximumUnitPrice) ||
      p.maximumUnitPrice <= 0
    )
      throw new Error("Invalid household basket");
    seen.add(key);
    totalWeight += p.weight;
  }
  if (!Number.isFinite(totalWeight)) throw new Error("Invalid household basket total");
  if (totalWeight === 0) return [];
  if (input.demandCurve) return demandCurveOrders(input, input.demandCurve);
  return [...input.products]
    .sort((a, b) =>
      a.commodity < b.commodity
        ? -1
        : a.commodity > b.commodity
          ? 1
          : a.book < b.book
            ? -1
            : a.book > b.book
              ? 1
              : 0
    )
    .map((p) => {
      const maximumSpend = input.cash * input.spendFraction * (p.weight / totalWeight);
      return {
        id: JSON.stringify([input.accountId, "consumption", p.commodity, p.book]),
        // Household demand must not inherit country/account id priority.
        // The matcher still applies each order's route, price and cash limits.
        fairShare: input.fairShare === false ? undefined : true,
        accountId: input.accountId,
        commodity: p.commodity,
        book: p.book,
        units: maximumSpend / p.maximumUnitPrice,
        maximumUnitPrice: p.maximumUnitPrice,
        maximumSpend,
        eligibleOfferIds: p.eligibleOfferIds,
        ...(input.countryId ? { countryId: input.countryId } : {}),
        ...(input.stateId ? { stateId: input.stateId } : {}),
      };
    });
}

/**
 * Ladder orders for one wallet. The top step of each good keeps the id, units
 * and ceiling the single order had, so turning the stage on only adds units at
 * lower prices; lower steps carry `demandStep` so the book counts them as
 * demand only for what they buy.
 */
function demandCurveOrders(
  input: Parameters<typeof householdPurchaseOrders>[0],
  curve: { incomeIndex?: number }
): PurchaseOrder[] {
  const products = incomeAdjustedWeights(input.products, curve.incomeIndex ?? 1);
  const totalWeight = products.reduce((n, p) => n + p.weight, 0);
  if (!(totalWeight > 0)) return [];
  const orders: PurchaseOrder[] = [];
  for (const p of [...products].sort((a, b) =>
    a.commodity < b.commodity
      ? -1
      : a.commodity > b.commodity
        ? 1
        : a.book < b.book
          ? -1
          : a.book > b.book
            ? 1
            : 0
  )) {
    const budget = input.cash * input.spendFraction * (p.weight / totalWeight);
    // Every step of this good shares one budget in the matcher, so the steps
    // together never spend more than the good's share at any mix of prices.
    const spendGroup = {
      id: JSON.stringify([input.accountId, "consumption-budget", p.commodity, p.book]),
      maximumSpend: budget,
    };
    for (const step of demandSteps({
      budget,
      maximumUnitPrice: p.maximumUnitPrice,
      priceElasticity: demandElasticity(p.commodity).price,
    })) {
      orders.push({
        fairShare: input.fairShare === false ? undefined : true,
        id: JSON.stringify(
          step.step === 0
            ? [input.accountId, "consumption", p.commodity, p.book]
            : [input.accountId, "consumption", p.commodity, p.book, step.step]
        ),
        accountId: input.accountId,
        commodity: p.commodity,
        book: p.book,
        units: step.units,
        maximumUnitPrice: step.maximumUnitPrice,
        maximumSpend: step.maximumSpend,
        eligibleOfferIds: p.eligibleOfferIds,
        spendGroup,
        ...(step.step > 0 ? { demandStep: step.step } : {}),
        ...(input.countryId ? { countryId: input.countryId } : {}),
        ...(input.stateId ? { stateId: input.stateId } : {}),
      });
    }
  }
  return orders;
}
