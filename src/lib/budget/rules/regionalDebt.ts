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

/**
 * Settlement runs in integer minor units: cents normally, whole units when a
 * region's balances are too large for cents to stay exact (a very rich region
 * can hold more than 90 trillion in local currency). An out-of-range value is a
 * RangeError so the caller can retry in whole units; a non-number is not.
 */
function minorUnits(value: number, scale: number): number {
  if (!Number.isFinite(value)) throw new Error("Regional financing amount is invalid");
  if (!Number.isSafeInteger(Math.round(value * scale)))
    throw new RangeError("Regional financing amount is outside the exact range");
  return Math.round(value * scale);
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
  try {
    return settleAtScale(input, 100);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    // Too large for exact cents: settle in whole units instead.
    return settleAtScale(input, 1);
  }
}

function settleAtScale(
  input: Parameters<typeof settleRegionalDebt>[0],
  scale: number
): RegionalDebtLedger {
  const cents = (value: number) => minorUnits(value, scale);
  const openingCash = cents(input.openingCash);
  const principal = cents(input.previous?.principal ?? 0) + Math.max(0, -openingCash);
  if (!Number.isSafeInteger(principal))
    throw new RangeError("Regional debt principal is outside the exact range");
  if (principal < 0) throw new Error("Regional debt principal is invalid");
  const cash = Math.max(0, openingCash);
  const annualInterest = Math.round(principal * REGIONAL_DEBT_INTEREST_RATE);
  const interestPaid = Math.round(annualInterest / input.turnsPerYear);
  const revenue = Math.round(cents(input.annualRevenue) / input.turnsPerYear);
  const spending = Math.round(cents(input.annualPrimarySpending) / input.turnsPerYear);
  const operatingChange = revenue - spending - interestPaid;
  const available = cash + operatingChange;
  if (!Number.isSafeInteger(operatingChange) || !Number.isSafeInteger(available))
    throw new RangeError("Regional cash settlement exceeds the supported range");
  const borrowed = Math.max(0, -available);
  const repaid = Math.min(principal, Math.max(0, available));
  const closingPrincipal = principal + borrowed - repaid;
  const closingCash = Math.max(0, available - repaid);
  cents(closingPrincipal / scale);
  cents(closingCash / scale);
  return {
    principal: closingPrincipal / scale,
    cash: closingCash / scale,
    annualInterest: annualInterest / scale,
    interestRate: REGIONAL_DEBT_INTEREST_RATE,
    lastSettledTurn: input.turn,
    borrowed: borrowed / scale,
    repaid: repaid / scale,
    interestPaid: interestPaid / scale,
  };
}
