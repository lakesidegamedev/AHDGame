/** Replace claims without paying cash or renewing expired evidence. */
import type { RegionalProgramSettlement } from "@/lib/governmentFinance/rules/regionalSettlement";
type Receipt = RegionalProgramSettlement & { lastSettledTurn: number; validThroughTurn?: number };
export function transferLegacyFunding(input: {
  existing: Record<string, Receipt>;
  retiredLawIds: readonly string[];
  replacements: readonly Receipt[];
}) {
  const next = { ...input.existing };
  const removed: Receipt[] = [];
  const replaced = new Set(input.replacements.map((r) => r.programId));
  for (const [id, row] of Object.entries(next))
    if (input.retiredLawIds.includes(row.legislationTypeId) || replaced.has(id)) {
      removed.push(row);
      delete next[id];
    }
  for (const row of input.replacements) {
    if (
      !Number.isSafeInteger(row.authorizedCost) ||
      !Number.isSafeInteger(row.fundedAmount) ||
      row.fundedAmount < 0 ||
      row.fundedAmount > row.authorizedCost ||
      row.unfundedAmount !== row.authorizedCost - row.fundedAmount ||
      !Number.isFinite(row.implementationFactor) ||
      row.implementationFactor < 0 ||
      row.implementationFactor > 1
    )
      throw new Error("Invalid recovered settlement");
    if (next[row.programId]) throw new Error("Duplicate recovered settlement");
    next[row.programId] = row;
  }
  const oldAuthorized = removed.reduce((s, r) => s + r.authorizedCost, 0);
  const oldFunded = removed.reduce((s, r) => s + r.fundedAmount, 0);
  const newAuthorized = input.replacements.reduce((s, r) => s + r.authorizedCost, 0);
  const newFunded = input.replacements.reduce((s, r) => s + r.fundedAmount, 0);
  if (newFunded > oldFunded) throw new Error("Recovery may not create funded money");
  return {
    next,
    removed,
    authorizedDelta: newAuthorized - oldAuthorized,
    fundedDelta: newFunded - oldFunded,
  };
}

/** Legacy authorizations used fractional costs while their receipts rounded each claim. */
export function reconcileRecoverySpending(input: {
  original: { byCategory: Record<string, number>; resourceProspecting?: number; total: number };
  removed: readonly { category: string; amount: number }[];
  replacement: number;
}) {
  const categories = { ...input.original.byCategory };
  const counts: Record<string, number> = {};
  for (const row of input.removed) {
    categories[row.category] = (categories[row.category] ?? 0) - row.amount;
    counts[row.category] = (counts[row.category] ?? 0) + 1;
  }
  for (const [category, count] of Object.entries(counts)) {
    if (categories[category]! < -count)
      throw new Error("Legacy category spending does not reconcile: " + category);
    categories[category] = Math.max(0, categories[category]!);
  }
  categories.resetLegislation = (categories.resetLegislation ?? 0) + input.replacement;
  return {
    ...input.original,
    byCategory: categories,
    total:
      Object.values(categories).reduce((sum, cost) => sum + cost, 0) +
      (input.original.resourceProspecting ?? 0),
  };
}

/** Funded capacity is distinct from nominal authorization; keep the existing lower delivery cap. */
export function recoveryImplementation(input: {
  annual: number;
  funded: number;
  implementedAnnual: number;
}): number {
  if (
    !Number.isFinite(input.annual) ||
    !Number.isFinite(input.funded) ||
    !Number.isFinite(input.implementedAnnual) ||
    input.annual < 0 ||
    input.funded < 0 ||
    input.implementedAnnual < 0
  )
    throw new Error("Invalid recovery capacity");
  return input.annual
    ? Math.max(0, Math.min(1, input.funded / input.annual, input.implementedAnnual / input.annual))
    : 0;
}
export function recoveryServiceResponse(input: {
  annual: number;
  reviewedAnnual: number;
  response: number;
  sourceShare: number;
  retainedResponse: number;
}): number {
  const coverage = input.reviewedAnnual > 0 ? Math.min(1, input.annual / input.reviewedAnnual) : 1;
  return Math.max(input.retainedResponse, input.response * input.sourceShare * coverage);
}
export function recoveryRegionalTotals(input: {
  authorized: number;
  unfunded: number;
  surplus: number;
  authorizedDelta: number;
  fundedDelta: number;
}) {
  return {
    enactedBillCosts: input.authorized + input.authorizedDelta,
    unfundedBillCosts: Math.max(0, input.unfunded + input.authorizedDelta - input.fundedDelta),
    surplus: input.surplus - input.fundedDelta,
  };
}
export function addRecoveryPressure(
  current: { points: number; turns: number } | undefined,
  input: { response: number; baseline: number; implementation: number; verifiedTurns: number }
) {
  return {
    points: Math.min(
      1.2,
      (current?.points ?? 0) + Math.max(0, input.response - input.baseline) * input.implementation
    ),
    turns: Math.min(current?.turns ?? 48, input.verifiedTurns),
  };
}
