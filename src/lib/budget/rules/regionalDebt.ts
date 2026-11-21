/** Regional borrowing is external financing, not tax revenue. */
export interface RegionalDebtLedger {
  principal: number;
  cash: number;
  annualInterest: number;
  interestRate: number;
  lastSettledTurn: number;
  borrowed: number;
  repaid: number;
  interestPaid: number;
}

export const REGIONAL_DEBT_INTEREST_RATE = 0.05;

function cents(value: number): number {
  if (!Number.isFinite(value) || !Number.isSafeInteger(Math.round(value * 100)))
    throw new Error("Regional financing amount is invalid");
  return Math.round(value * 100);
}

export function regionalDebtApprovalPenalty(principal: number, gdp: number): number {
  if (!Number.isFinite(principal) || !Number.isFinite(gdp) || principal <= 0 || gdp <= 0) return 0;
  return -Math.round(Math.min(25, (principal / gdp) * 10) * 10) / 10;
}

export function settleRegionalDebt(input: {
  previous?: RegionalDebtLedger;
  openingCash: number;
  annualRevenue: number;
  annualPrimarySpending: number;
  turn: number;
  turnsPerYear: number;
}): RegionalDebtLedger {
  if (
    !Number.isSafeInteger(input.turn) ||
    input.turn < 1 ||
    !Number.isSafeInteger(input.turnsPerYear) ||
    input.turnsPerYear < 1
  )
    throw new Error("Regional financing turn is invalid");
  if (input.previous && input.previous.lastSettledTurn >= input.turn) return input.previous;
  const openingCash = cents(input.openingCash);
  const principal = cents(input.previous?.principal ?? 0) + Math.max(0, -openingCash);
  if (!Number.isSafeInteger(principal) || principal < 0)
    throw new Error("Regional debt principal is invalid");
  const cash = Math.max(0, openingCash);
  const annualInterest = Math.round(principal * REGIONAL_DEBT_INTEREST_RATE);
  const interestPaid = Math.round(annualInterest / input.turnsPerYear);
  const revenue = Math.round(cents(input.annualRevenue) / input.turnsPerYear);
  const spending = Math.round(cents(input.annualPrimarySpending) / input.turnsPerYear);
  const operatingChange = revenue - spending - interestPaid;
  const available = cash + operatingChange;
  if (!Number.isSafeInteger(operatingChange) || !Number.isSafeInteger(available))
    throw new Error("Regional cash settlement exceeds the supported range");
  const borrowed = Math.max(0, -available);
  const repaid = Math.min(principal, Math.max(0, available));
  const closingPrincipal = principal + borrowed - repaid;
  const closingCash = Math.max(0, available - repaid);
  cents(closingPrincipal / 100);
  cents(closingCash / 100);
  return {
    principal: closingPrincipal / 100,
    cash: closingCash / 100,
    annualInterest: annualInterest / 100,
    interestRate: REGIONAL_DEBT_INTEREST_RATE,
    lastSettledTurn: input.turn,
    borrowed: borrowed / 100,
    repaid: repaid / 100,
    interestPaid: interestPaid / 100,
  };
}
