/**
 * The legs of a funded turn's cost that the settled record names exactly.
 * Receipt figures are ₳ per turn; stored summary figures are the sector's daily
 * local money, converted by the caller's `toAnchor`.
 */
export interface FundedCostPartsInput {
  inputsConsumed?: number;
  otherOperatingPaid?: number;
  otherOperatingArrears?: number;
  idleOperatingCost?: number;
  minorInputPremium?: number;
  inventoryWriteOff?: number;
}

export interface FundedCostParts {
  idleUpkeepAnchor: number;
  siteRunningAnchor: number;
  minorInputPremiumAnchor: number;
  inventoryWriteOffAnchor: number;
  managementOverheadAnchor: number | null;
  dominanceCostAnchor: number | null;
  growthAnchor: number | null;
}

const num = (n: number | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : 0);
const stored = (n: number | undefined, toAnchor: (n: number) => number) =>
  typeof n === "number" && Number.isFinite(n) ? toAnchor(n) : null;

export function fundedCostParts(
  receipt: FundedCostPartsInput,
  pnl: { managementOverhead?: number; dominanceCost?: number; growthCost?: number } | null | undefined,
  turnsPerDay: number,
  toAnchor: (storedDaily: number) => number
): FundedCostParts {
  const siteBill = Math.max(
    0,
    num(receipt.otherOperatingPaid) + num(receipt.otherOperatingArrears)
  );
  const idle = Math.min(siteBill, Math.max(0, num(receipt.idleOperatingCost)));
  return {
    idleUpkeepAnchor: idle * turnsPerDay,
    siteRunningAnchor: (siteBill - idle) * turnsPerDay,
    minorInputPremiumAnchor: Math.max(0, num(receipt.minorInputPremium)) * turnsPerDay,
    inventoryWriteOffAnchor: Math.max(0, num(receipt.inventoryWriteOff)) * turnsPerDay,
    managementOverheadAnchor: stored(pnl?.managementOverhead, toAnchor),
    dominanceCostAnchor: stored(pnl?.dominanceCost, toAnchor),
    growthAnchor: stored(pnl?.growthCost, toAnchor),
  };
}
