import type { StateBudget } from "@/lib/db/types/budget";
import {
  settleRegionalBudget,
  type RegionalProgramClaim,
} from "@/lib/governmentFinance/rules/regionalSettlement";

export interface RegionalLawClaim {
  claim: RegionalProgramClaim;
  category: string;
  annualCost: number;
}

/** Shared by annual rollover and maintenance: healing must not repeal existing services. */
export function resolveRegionalSpending(input: {
  baseSpending: StateBudget["spending"];
  services: readonly (RegionalProgramClaim & { category: string })[];
  laws: readonly RegionalLawClaim[];
  programs: readonly RegionalProgramClaim[];
  revenue: number;
  cash: number;
  settle: boolean;
}) {
  const byCategory = { ...input.baseSpending.byCategory };
  for (const c of input.services)
    byCategory[c.category] = (byCategory[c.category] ?? 0) + c.authorizedCost;
  const programCost = input.programs.reduce((sum, p) => sum + p.authorizedCost, 0);
  byCategory.resetLegislation = (byCategory.resetLegislation ?? 0) + programCost;
  const authorizedSpending = {
    ...input.baseSpending,
    byCategory,
    total:
      input.baseSpending.total +
      programCost +
      input.services.reduce((sum, c) => sum + c.authorizedCost, 0),
  };
  if (!input.settle)
    return { spending: authorizedSpending, authorizedSpending, settlement: undefined };
  const negativeCredit = input.laws.reduce((sum, l) => sum + Math.max(0, -l.annualCost), 0);
  const settlement = settleRegionalBudget({
    availableBudget: input.revenue + Math.max(0, input.cash) + negativeCredit,
    reservedNonProgramSpending: input.baseSpending.resourceProspecting ?? 0,
    claims: [...input.services, ...input.laws.map((l) => l.claim), ...input.programs],
  });
  const fundedById = new Map(settlement.programs.map((p) => [p.programId, p.fundedAmount]));
  const actual: Record<string, number> = {};
  for (const c of input.services)
    actual[c.category] = (actual[c.category] ?? 0) + (fundedById.get(c.programId) ?? 0);
  for (const l of input.laws)
    actual[l.category] =
      (actual[l.category] ?? 0) +
      (l.annualCost <= 0 ? l.annualCost : (fundedById.get(l.claim.programId) ?? 0));
  actual.resetLegislation =
    (actual.resetLegislation ?? 0) +
    input.programs.reduce((sum, p) => sum + (fundedById.get(p.programId) ?? 0), 0);
  return {
    authorizedSpending,
    settlement,
    spending: {
      byCategory: actual,
      resourceProspecting: settlement.reservedNonProgramSpending,
      total:
        Object.values(actual).reduce((sum, n) => sum + n, 0) +
        settlement.reservedNonProgramSpending,
    },
  };
}
