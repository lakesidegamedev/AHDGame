/**
 * Households spend from income (gameConfig.producerHouseholdIncomeSpendStage).
 *
 * If a household basket budgets the spend share of ALL cash held, unspent cash
 * from empty shelves stays in the wallet and is budgeted again next turn on
 * top of new wages, so orders snowball during a shortage and read far above
 * real spending power.
 *
 * Here the budget is the spend share of this turn's wages plus a draw share of
 * the rest of the wallet. Between-turn inflows (benefits, transfers) sit in the
 * rest and are drawn down at the draw share, so savings settle where the draw
 * matches that inflow instead of growing without bound.
 *
 * The result is returned as the cash figure the basket rule multiplies by its
 * spend share, so the basket and demand-curve paths need no change.
 * Pure: plain numbers in, a number out.
 */

/** Default share of savings (cash beyond this turn's wages) a household spends each turn. */
export const HOUSEHOLD_SAVINGS_DRAW_SHARE = 0.3;

export function householdSpendBase(input: {
  /** Wallet cash after this turn's wages. */
  cash: number;
  /** Wages paid into the wallet this turn. */
  income: number;
  /** The basket's spend share (budget = base x spendFraction). */
  spendFraction: number;
  /** Share of savings spent each turn. */
  savingsDrawShare: number;
}): number {
  const cash = Number.isFinite(input.cash) && input.cash > 0 ? input.cash : 0;
  if (!(input.spendFraction > 0)) return cash;
  const income = Math.min(
    cash,
    Number.isFinite(input.income) && input.income > 0 ? input.income : 0
  );
  const draw =
    Number.isFinite(input.savingsDrawShare) && input.savingsDrawShare >= 0
      ? Math.min(1, input.savingsDrawShare)
      : HOUSEHOLD_SAVINGS_DRAW_SHARE;
  const budget = input.spendFraction * income + draw * (cash - income);
  return Math.min(cash, budget / input.spendFraction);
}
