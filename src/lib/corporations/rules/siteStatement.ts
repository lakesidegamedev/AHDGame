/**
 * One site's management statement. Money stays in the caller's currency and
 * financial-day basis. Internal income and charges allocate results between
 * sites, never company cash. Opportunity value is a separate, unbooked memo.
 */
import { plantsNetMarginPct } from "./netMargin";

export interface SiteStatement {
  turn: number | null;
  externalRevenue: number;
  externalCost: number;
  income: number;
  charge: number;
  inventoryCredit: number;
  supportCredit: number;
  revenue: number;
  totalCost: number;
  profit: number;
  ownSiteMemo: number;
  netMarginPct: number | null;
}

export interface SiteStatementInput {
  turn?: number | null;
  revenue: number;
  totalCost: number;
  income?: number | null;
  charge?: number | null;
  inventoryCredit?: number | null;
  supportCredit?: number | null;
  ownSiteValue?: number | null;
}
const positive = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;

export function siteStatement(input: SiteStatementInput): SiteStatement {
  const income = positive(input.income);
  const charge = positive(input.charge);
  const inventoryCredit = positive(input.inventoryCredit);
  const supportCredit = positive(input.supportCredit);
  const revenue = input.revenue + income;
  const totalCost = input.totalCost + charge - inventoryCredit - supportCredit;
  const profit = revenue - totalCost;
  return {
    turn: input.turn ?? null,
    externalRevenue: input.revenue,
    externalCost: input.totalCost,
    income,
    charge,
    inventoryCredit,
    supportCredit,
    revenue,
    totalCost,
    profit,
    ownSiteMemo: income > 0 ? 0 : positive(input.ownSiteValue),
    // A zero denominator has no percentage. Do not substitute an operating
    // margin or an opportunity-value estimate for the actual net result.
    netMarginPct: revenue > 0 ? plantsNetMarginPct({ revenue, totalCost, profit }) : null,
  };
}

interface StoredSitePnl {
  source?: string;
  turn?: number;
  revenue: number;
  totalCost: number;
  profit: number;
  internalSupplyIncome?: number;
  internalSupplyCharge?: number;
  stockAddedAtCost?: number;
  transitionSupport?: number;
}

/** Read persisted summaries for funded AND legacy plants, without margin inversion. */
export function sectorSiteStatement(
  sector: {
    plantsPnl?: StoredSitePnl | null;
    producerSettlement?: { turn: number } | null;
  },
  fallback: SiteStatementInput & { freightIncome?: number; freightCost?: number }
): SiteStatement {
  const p = sector.plantsPnl;
  const stored = p && [p.revenue, p.totalCost, p.profit].every(Number.isFinite) ? p : null;
  return siteStatement({
    turn: stored?.turn ?? null,
    revenue: (stored?.revenue ?? fallback.revenue) + (fallback.freightIncome ?? 0),
    totalCost: (stored?.totalCost ?? fallback.totalCost) + (fallback.freightCost ?? 0),
    income: stored?.internalSupplyIncome,
    charge: stored?.internalSupplyCharge,
    inventoryCredit: stored?.stockAddedAtCost,
    supportCredit: stored?.transitionSupport,
    ownSiteValue: fallback.ownSiteValue,
  });
}

/** Restate every monetary line together; the ratio and receipt turn stay aligned. */
export function scaleSiteStatement(s: SiteStatement, factor: number): SiteStatement {
  return siteStatement({
    turn: s.turn,
    revenue: s.externalRevenue * factor,
    totalCost: s.externalCost * factor,
    income: s.income * factor,
    charge: s.charge * factor,
    inventoryCredit: s.inventoryCredit * factor,
    supportCredit: s.supportCredit * factor,
    ownSiteValue: s.ownSiteMemo * factor,
  });
}

/** Company totals eliminate the internal legs, including when filtering sites. */
export function consolidateSiteStatements(statements: readonly SiteStatement[]) {
  const revenue = statements.reduce((n, s) => n + s.externalRevenue, 0);
  const totalCost = statements.reduce(
    (n, s) => n + s.externalCost - s.inventoryCredit - s.supportCredit,
    0
  );
  return { revenue, totalCost, profit: revenue - totalCost };
}

/** Cost detail may be joined only to the turn actually stamped on the summary. */
export function matchingSiteReceipt<T extends { turn: number }>(sector: {
  plantsPnl?: { source?: string; turn?: number } | null;
  producerSettlement?: T | null;
}): T | null {
  return sector.plantsPnl?.source === "funded" &&
    sector.plantsPnl.turn != null &&
    sector.plantsPnl.turn === sector.producerSettlement?.turn
    ? sector.producerSettlement
    : null;
}
