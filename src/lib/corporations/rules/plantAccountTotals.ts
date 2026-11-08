/** Adapter from legacy plants cost lines or a settled site statement to headlines. */
import { plantsNetMarginPct } from "./netMargin";
import { siteStatement, type SiteStatement } from "./siteStatement";

export type PlantAccountInput = {
  statement?: SiteStatement;
  realizedRevenueAnchor: number;
  nameplateRevenueAnchor?: number;
  /** Operating cost NET of labour, as the engine bills it. */
  maintenanceNetAnchor: number;
  labourAnchor: number;
  growthCostAnchor: number;
  profitAnchor: number;
  /** Physical input bill computed from the demand rows at market prices. */
  inputsAnchor: number;
  internalSupplyIncomeAnchor?: number;
  internalSupplyChargeAnchor?: number;
  freightCostAnchor?: number;
  freightIncomeAnchor?: number;
  /**
   * Compliance a funded producer turn booked, in ₳. Funded rows carry no
   * full engine P&L, so without it the line is re-derived from the share.
   */
  fundedComplianceAnchor?: number | null;
  /**
   * The lines the turn ACTUALLY booked, in ₳. When present, all money figures
   * below are read off them; nothing is reconstructed. Absent on a sector that
   * has not run a plants turn since the field shipped, which falls back to the
   * margin inversion. See `plantsPnlBasis.ts` for why the inversion is not enough.
   */
  enginePnl?: {
    revenue: number;
    inputs: number;
    labour: number;
    upkeep: number;
    compliance: number;
    otherOpex: number;
    financialLegs: number;
    internalSupplyDiscountAnchor?: number;
    inventoryCarry: number;
    policyCredit: number;
    policyPp: number;
    operatingCost: number;
    totalCost: number;
    profit: number;
  } | null;
};

const nonNeg = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);

export function plantAccountTotals(money: PlantAccountInput, ownSiteValue: number) {
  const engine = money.enginePnl ?? null;
  const internalSupplyChargeAnchor = nonNeg(money.internalSupplyChargeAnchor ?? 0);
  const internalSupplyIncomeAnchor = nonNeg(money.internalSupplyIncomeAnchor ?? 0);
  const engineGrowthAnchor = engine
    ? engine.totalCost -
      engine.operatingCost -
      engine.upkeep -
      engine.compliance -
      engine.inventoryCarry
    : 0;
  const freightCostAnchor = money.freightCostAnchor ?? 0;
  const freightIncomeAnchor = money.freightIncomeAnchor ?? 0;
  // One basis for revenue, cost and profit: profit counts inter-site income
  // and charges, so revenue and bill do too. Settled statements take precedence;
  // older payloads use the cost-line adapter.

  const operatingCostAnchor = money.statement
    ? money.statement.totalCost - nonNeg(money.growthCostAnchor)
    : (engine
        ? engine.totalCost - engineGrowthAnchor + internalSupplyChargeAnchor
        : nonNeg(money.maintenanceNetAnchor + money.labourAnchor)) + freightCostAnchor;
  const totalCostAnchor =
    money.statement?.totalCost ??
    (engine
      ? engine.totalCost + internalSupplyChargeAnchor + freightCostAnchor
      : operatingCostAnchor + nonNeg(money.growthCostAnchor));
  const revenueAnchor =
    money.statement?.revenue ??
    (engine ? engine.revenue + internalSupplyIncomeAnchor : money.realizedRevenueAnchor) +
      freightIncomeAnchor;
  // Free transfers book nothing for what this site sent to its own sites. The
  // memo values it at the site's own ask (₳ per turn on the receipt, per day
  // here). It is separate from the actual net margin.
  const ownSiteMemoAnchor =
    money.statement?.ownSiteMemo ??
    siteStatement({
      revenue: revenueAnchor - internalSupplyIncomeAnchor,
      totalCost: totalCostAnchor - internalSupplyChargeAnchor,
      income: internalSupplyIncomeAnchor,
      charge: internalSupplyChargeAnchor,
      ownSiteValue,
    }).ownSiteMemo;
  const statementProfit = money.statement?.profit ?? money.profitAnchor;
  const fillAdjustedMarginPct = money.statement
    ? money.statement.netMarginPct
    : plantsNetMarginPct({
        profit: statementProfit,
        revenue: revenueAnchor,
        totalCost: totalCostAnchor,
      });

  return {
    engineGrowthAnchor,
    operatingCostAnchor,
    revenueAnchor,
    totalCostAnchor,
    ownSiteMemoAnchor,
    statementProfit,
    fillAdjustedMarginPct,
  };
}
