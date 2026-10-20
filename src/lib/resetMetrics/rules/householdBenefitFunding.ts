/**
 * Household benefits distinguish national payments from modeled regional accrual.
 * householdBenefitFunding annualizes actual national outlays; calibrated cohorts
 * alone may use current funded regional allocations, never booked appropriations.
 */
import {
  hasCurrentLawSettlement,
  metricLawOutlaysAtTurn,
  type MetricLawProgram,
  type MetricLawSettlement,
} from "./lawDelivery";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";

export function householdBenefitFunding(
  program: MetricLawProgram,
  settlements: ReadonlyMap<string, MetricLawSettlement>,
  turn: number,
  calibrated: boolean
): { key: string; annualAmount: number } | undefined {
  if (program.scope === "national") {
    const receipts = metricLawOutlaysAtTurn([program], settlements, turn);
    return receipts.length === 1
      ? { key: receipts[0]!.paymentKey, annualAmount: receipts[0]!.amount * TURNS_PER_YEAR }
      : undefined;
  }
  const paid = settlements.get(program._id);
  if (
    !calibrated ||
    !hasCurrentLawSettlement(program, paid, turn) ||
    !paid?.fundingKey ||
    !Number.isFinite(paid.fundedAnnualAmount) ||
    paid.fundedAnnualAmount! < 0
  )
    return undefined;
  // Explicit modeled annual accrual, not evidence that household cash moved today.
  return { key: paid.fundingKey, annualAmount: paid.fundedAnnualAmount! };
}
