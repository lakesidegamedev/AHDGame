/**
 * Funded corporate advertising purchases. Today the advertising demand leg
 * (applyAdvertisingDemand) books each corporation's funded daily marketing
 * budget as advertising demand. Here the same funded budget becomes a buyer
 * that spends one turn's slice from the corporation's own account, so media
 * sells to the companies that pay for campaigns.
 *
 * Pure: budgets in anchor units in, per-corporation purchase lines out.
 */
import {
  MARKETING_ADVERTISING_DEMAND_ELASTICITY,
  MARKETING_ADVERTISING_DEMAND_RATE,
  MARKETING_ADVERTISING_REFERENCE_BUDGETS_ANCHOR,
} from "@/lib/constants/commodities";
import type { PublicPurchaseLine } from "./publicBuyerRules";

export interface MarketingBudget {
  /** The corporation's market account. */
  accountId: string;
  /** Daily marketing budget, anchor units. */
  dailyBudgetAnchor: number;
  /** Liquid cash, anchor units. */
  cashAnchor: number;
}

export function marketingBuyerLines(
  budgets: readonly MarketingBudget[],
  turnsPerDay: number
): { accountId: string; lines: PublicPurchaseLine[] }[] {
  if (!Number.isFinite(turnsPerDay) || turnsPerDay <= 0) throw new Error("Invalid turns per day");
  // Same funding cap as the demand leg: at most the daily budget the treasury
  // can cover for the next turn.
  const funded = [...budgets]
    .sort((a, b) => (a.accountId < b.accountId ? -1 : 1))
    .map((b) => ({
      accountId: b.accountId,
      daily: Math.min(
        Math.max(0, Number.isFinite(b.dailyBudgetAnchor) ? b.dailyBudgetAnchor : 0),
        Math.max(0, Number.isFinite(b.cashAnchor) ? b.cashAnchor : 0) * turnsPerDay
      ),
    }))
    .filter((b) => b.daily > 0);
  const total = funded.reduce((s, b) => s + b.daily, 0);
  const factor =
    total > 0
      ? Math.pow(
          total / MARKETING_ADVERTISING_REFERENCE_BUDGETS_ANCHOR,
          MARKETING_ADVERTISING_DEMAND_ELASTICITY - 1
        )
      : 1;
  const rate = MARKETING_ADVERTISING_DEMAND_RATE * factor;
  return funded.map((b) => ({
    accountId: b.accountId,
    lines: [
      { commodity: "advertising", book: "world", amountLocal: (b.daily * rate) / turnsPerDay },
    ],
  }));
}
