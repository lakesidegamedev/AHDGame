/**
 * Autopilot budget shares: the part of revenue the NPP brain puts into marketing,
 * logistics and R&D each turn, by how healthy the corporation's margin is. The
 * archetype multipliers (marketing and R&D only) are applied by the caller.
 */
export type AutopilotBudgetBand = "distress" | "thin" | "healthy" | "strong";

export interface AutopilotBudgetShares {
  marketing: number;
  logistics: number;
  rd: number;
}

export const AUTOPILOT_BUDGET_SHARES: Record<AutopilotBudgetBand, AutopilotBudgetShares> = {
  distress: { marketing: 0.005, logistics: 0.003, rd: 0 },
  thin: { marketing: 0.015, logistics: 0.01, rd: 0 },
  healthy: { marketing: 0.03, logistics: 0.02, rd: 0.01 },
  strong: { marketing: 0.05, logistics: 0.03, rd: 0.02 },
};

/** Margin (percent of revenue) below which budgets go lean, and the healthy and strong cut-offs. */
export const AUTOPILOT_BUDGET_MARGIN_THIN = 10;
export const AUTOPILOT_BUDGET_MARGIN_STRONG = 25;

export function autopilotBudgetBand(input: {
  distressed: boolean;
  marginPct: number;
}): AutopilotBudgetBand {
  if (input.distressed) return "distress";
  if (input.marginPct < AUTOPILOT_BUDGET_MARGIN_THIN) return "thin";
  if (input.marginPct < AUTOPILOT_BUDGET_MARGIN_STRONG) return "healthy";
  return "strong";
}

export type AutopilotBudgetLever = "marketing" | "logistics" | "rd";

export interface AutopilotBudgetChange {
  turn: number;
  from: number;
  to: number;
  /** Share of the revenue the brain saw, 0-1 (rounded to 4 places). */
  pctOfRevenue: number;
}

export type AutopilotBudgetChanges = Partial<Record<AutopilotBudgetLever, AutopilotBudgetChange>>;

/** Per-lever record of the budgets autopilot actually changed, for the corporation document. */
export function buildAutopilotBudgetChanges(input: {
  turn: number;
  revenue: number;
  current: Record<AutopilotBudgetLever, number>;
  next: Record<AutopilotBudgetLever, number>;
}): AutopilotBudgetChanges {
  const out: AutopilotBudgetChanges = {};
  for (const lever of ["marketing", "logistics", "rd"] as const) {
    const from = input.current[lever];
    const to = input.next[lever];
    if (from === to) continue;
    out[lever] = {
      turn: input.turn,
      from,
      to,
      pctOfRevenue: input.revenue > 0 ? Math.round((to / input.revenue) * 10000) / 10000 : 0,
    };
  }
  return out;
}
