import type { Financials } from "../CorporationPageTypes";
import { scaleMoney, type MoneyPeriod } from "@/lib/constants/moneyTimescale";

/** @deprecated Use `MoneyPeriod` — kept as an alias so existing imports resolve. */
export type Period = MoneyPeriod;

/** Period convention lives in `@/lib/constants/moneyTimescale` — see MONEY_PERIOD_FACTOR. */
export function scaleToPeriod(value: number, period: Period): number {
  return scaleMoney(value, period);
}

/**
 * Net margin = net income as a share of total income taken in.
 *
 * `income` is coupon-inclusive, so dividing by operating revenue alone yields
 * margins above 100% for corps dominated by bond portfolios. The denominator
 * includes the same non-operating inflows that feed net income, so the ratio
 * reads as profit per dollar of total income.
 *
 * The numerator uses the same realized-when-available basis as the headline
 * tile (`corpIncomeBasis`); using projected `income` would let a corp booking
 * realized losses show a positive margin next to a red net income tile.
 */
export function netMarginPct(
  f: Pick<
    Financials,
    | "income"
    | "realizedIncome"
    | "realizedDividendPaid"
    | "dividendDistribution"
    | "totalRevenue"
    | "bondCouponIncome"
    | "imfFacilityReceiptsDaily"
  >
): number {
  const incomeBase =
    f.totalRevenue + Math.max(0, f.bondCouponIncome) + Math.max(0, f.imfFacilityReceiptsDaily);
  if (incomeBase <= 0) return 0;
  return (corpIncomeBasis(f).netIncome / incomeBase) * 100;
}

/**
 * The single net-income basis every corporation surface must read from.
 * realizedIncome is already net of dividends (income = afterTaxOperating −
 * dividendPayout) and already includes bond coupons and dividends received, so do
 * not subtract dividendDistribution or add non-operating cash on top.
 * netIncome is pre-dividend; retained is post-payout and is what the masthead and
 * Overview report.
 */
/** Retained P&L plus last-turn supply-agreement CFD cash, in daily display units. */
export function cashAfterContracts(
  f: Pick<
    Financials,
    | "income"
    | "realizedIncome"
    | "realizedDividendPaid"
    | "dividendDistribution"
    | "supplyAgreementSettlementDaily"
  >
): number {
  return corpIncomeBasis(f).retained + (f.supplyAgreementSettlementDaily ?? 0);
}

export function corpIncomeBasis(
  f: Pick<Financials, "income" | "realizedIncome" | "realizedDividendPaid" | "dividendDistribution">
): { netIncome: number; retained: number; dividendPaid: number; isRealized: boolean } {
  if (typeof f.realizedIncome === "number") {
    const dividendPaid = Math.max(0, f.realizedDividendPaid ?? 0);
    return {
      netIncome: f.realizedIncome + dividendPaid,
      retained: f.realizedIncome,
      dividendPaid,
      isRealized: true,
    };
  }
  const dividendPaid = Math.max(0, f.dividendDistribution);
  return {
    netIncome: f.income,
    retained: f.income - dividendPaid,
    dividendPaid,
    isRealized: false,
  };
}

export type ValuationTone = "over" | "under" | "fair";

export function valuation(
  marketCap: number,
  bookValue: number
): { ratio: number; label: string; tone: ValuationTone } {
  const ratio = bookValue > 0 ? marketCap / bookValue : 0;
  if (ratio > 1.1) return { ratio, label: "Overvalued", tone: "over" };
  if (ratio > 0 && ratio < 0.9) return { ratio, label: "Undervalued", tone: "under" };
  return { ratio, label: "Fairly valued", tone: "fair" };
}

export type AllocTone =
  | "maintenance"
  | "labor"
  | "freight"
  | "growth"
  | "marketing"
  | "logistics"
  | "rd"
  | "salary"
  | "pension"
  | "regulatory"
  | "tax"
  | "interest"
  | "other";

export interface AllocSegment {
  key: AllocTone;
  label: string;
  /** Magnitude, scaled to the selected period. */
  value: number;
  /** Share of gross revenue (%). 0 when revenue is non-positive. */
  pct: number;
  tone: AllocTone;
}

export function buildAllocation(
  f: Financials,
  period: Period
): {
  revenue: number;
  segments: AllocSegment[];
  inflows: AllocSegment[];
  netIncome: number;
  netPct: number;
} {
  const revenue = scaleToPeriod(f.totalRevenue, period);
  const pctOf = (raw: number) => (f.totalRevenue > 0 ? (raw / f.totalRevenue) * 100 : 0);
  const seg = (key: AllocTone, label: string, raw: number): AllocSegment => ({
    key,
    label,
    value: scaleToPeriod(raw, period),
    pct: pctOf(raw),
    tone: key,
  });

  const tax = f.federalTax + f.stateTax;
  // Net interest is a two-way flow: a corp whose coupons exceed its debt service
  // is a net RECEIVER. Clamping the negative away (as this did before) silently
  // dropped that inflow from the bar while `income` still carried it, so the
  // segments could never sum to the total. Keep the signed value and let the
  // reconciliation below place it on the correct side.
  const netInterest =
    f.bondInterestCost +
    f.imfFacilityPaymentDaily -
    f.bondCouponIncome -
    f.dividendIncomeReceived -
    f.governmentBondSubsidy -
    f.imfFacilityReceiptsDaily;

  // Every cost the backend charges into `income` (see corporationDetail.ts
  // `operatingCosts` / `income`) must appear here. `laborCosts` and
  // `regulatoryBurden` were both absent, so a corp's wage bill — often its
  // single largest line — vanished from the bar while remaining in the total.
  const costRows: Array<[AllocTone, string, number]> = [
    ["maintenance", "Maintenance", f.maintenanceCosts],
    ["labor", "Wages", f.laborCosts],
    ["growth", "Growth", f.growthCosts],
    ["freight", "Freight charges", f.freightCosts ?? 0],
    ["marketing", "Marketing", f.marketingCosts],
    ["logistics", "Logistics", f.logisticsCosts],
    ["rd", "R&D", f.rdCosts],
    ["salary", "CEO salary", f.ceoSalaryCost],
    ["pension", "Pensions", f.pensionContributionCost + f.pensionTopUpCost],
    ["regulatory", "Regulatory", f.regulatoryBurden],
    ["tax", "Taxes", tax],
    ["interest", "Net interest", netInterest],
  ];

  const accountedCosts = costRows.reduce((sum, [, , raw]) => sum + raw, 0);
  // Anything `income` reflects that the rows above don't explain. Should be ~0; show it rather than let the column silently fail to add up.
  const residual = f.totalRevenue - accountedCosts - f.income;

  const allRows: Array<[AllocTone, string, number]> = [...costRows, ["other", "Other", residual]];

  // Derived, never passed through: the bottom line is the arithmetic result of
  // every row above it, so a missing cost line changes the total instead of
  // hiding inside it. Summing the SIGNED rows (inflows included) is what makes
  // `netIncome === f.income` an identity rather than a coincidence.
  const netIncome =
    revenue - allRows.reduce((sum, [, , raw]) => sum + scaleToPeriod(raw, period), 0);

  // The bar allocates shares of gross revenue, so only outflows are drawn.
  // Inflows are returned separately for the statement to render on their own
  // side rather than being dropped.
  const segments = allRows.map(([key, label, raw]) => seg(key, label, raw));

  return {
    revenue,
    segments: segments.filter((s) => s.value > 0),
    inflows: segments
      .filter((s) => s.value < 0)
      .map((s) => ({ ...s, value: -s.value, pct: -s.pct })),
    netIncome,
    netPct: revenue !== 0 ? (netIncome / revenue) * 100 : 0,
  };
}
