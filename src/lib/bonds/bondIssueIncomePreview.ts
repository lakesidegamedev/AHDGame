/**
 * Issue-bond income preview in daily/turn units, matching the rest of the
 * corporation UI.
 *
 * Coupon cost is annual % × face divided by the two financial days in a game
 * year (48 turns / 24 turns-per-day). Compare that daily coupon against
 * retained daily income so "Income after" matches cash, not the nameplate.
 */

import { GROWTH_RATE_TURNS_PER_YEAR, TURNS_PER_DAY } from "@/lib/constants/corporations";

const GAME_DAYS_PER_YEAR = GROWTH_RATE_TURNS_PER_YEAR / TURNS_PER_DAY;

export function bondIssueIncomePreview(args: {
  retainedDaily: number;
  couponRatePercent: number;
  faceValue: number;
}): {
  annualCost: number;
  dailyCost: number;
  incomeBeforePerTurn: number;
  incomeAfterPerTurn: number;
  staysProfitable: boolean;
} {
  const annualCost = (args.couponRatePercent / 100) * args.faceValue;
  const dailyCost = annualCost / GAME_DAYS_PER_YEAR;
  return {
    annualCost,
    dailyCost,
    incomeBeforePerTurn: args.retainedDaily / TURNS_PER_DAY,
    incomeAfterPerTurn: (args.retainedDaily - dailyCost) / TURNS_PER_DAY,
    staysProfitable: args.retainedDaily - dailyCost >= 0,
  };
}
