/**
 * The owner's view of one site's result with internal supply counted (issue
 * 5385, ticket 1763).
 *
 * A site that supplies the company's own other sites books no sale for those
 * units. With a priced internal transfer the turn records matching management
 * lines beside the booked profit: income for the supplier, a charge for the
 * receiver. With free transfers it records nothing, so a supplier that sends
 * everything to its own sites read as a -999% loss on every screen.
 *
 * This puts both cases on one basis:
 * - priced: profit, revenue and cost include the internal income and charge;
 * - free: the same, plus a memo of what was sent to own sites at the site's own
 *   asking price. The memo is not booked. It only feeds the margin, so a pure
 *   supplier reads what it earns the company, not -999%.
 *
 * Display only. Stored profit, tax, pay and valuation keep the booked figures.
 *
 * Pure: plain figures in one currency in, plain figures out.
 */
import { plantsNetMarginPct } from "./netMargin";

export interface InternalSupplyViewInput {
  /** Booked profit, internal lines excluded. */
  profit: number;
  /** Booked revenue from outside buyers. */
  revenue: number;
  /** Booked cost, internal charges excluded. */
  totalCost: number;
  /** Priced transfers: income from the company's other sites. */
  income?: number | null;
  /** Priced transfers: charge for goods from the company's other sites. */
  charge?: number | null;
  /** What the site sent to its own sites, at its own asking price. */
  ownSiteValue?: number | null;
}

export interface InternalSupplyView {
  /** Management profit: booked profit plus internal income, less charges, plus the free memo. */
  profit: number;
  revenue: number;
  totalCost: number;
  income: number;
  charge: number;
  /** Free transfers only: own-site deliveries at the site's ask, not booked. 0 otherwise. */
  ownSiteMemo: number;
  /** Net margin with internal supply counted; null when there is nothing to divide. */
  netMarginPct: number | null;
}

function nonNeg(x: number | null | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

/**
 * The free-transfer memo: own-site deliveries at the site's ask. Zero once the
 * site booked internal income, because the deliveries were then priced and a
 * memo on top would count them twice.
 */
export function freeTransferMemo(input: {
  income?: number | null;
  ownSiteValue?: number | null;
}): number {
  return nonNeg(input.income) > 0 ? 0 : nonNeg(input.ownSiteValue);
}

export function internalSupplyView(input: InternalSupplyViewInput): InternalSupplyView {
  const income = nonNeg(input.income);
  const charge = nonNeg(input.charge);
  const ownSiteMemo = freeTransferMemo(input);
  // One basis: the memo sits in revenue and profit alike, so the margin and the
  // profit read from the same lines and a loss never shows a positive margin.
  const profit = input.profit + income - charge + ownSiteMemo;
  const revenue = input.revenue + income + ownSiteMemo;
  const totalCost = input.totalCost + charge;
  return {
    profit,
    revenue,
    totalCost,
    income,
    charge,
    ownSiteMemo,
    netMarginPct: plantsNetMarginPct({
      profit,
      revenue,
      totalCost,
    }),
  };
}
