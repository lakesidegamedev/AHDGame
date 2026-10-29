/** Portable recovery plan. The shell verifies the snapshot and writes one transaction. */
import { legacyRecoveryRoutes } from "./legacyRecoveryMapping";
import type { LawChoice } from "./eligibility";
import type { ResetCountry } from "../fundingOwner";
import type { RegionalProgramSettlement } from "@/lib/governmentFinance/rules/regionalSettlement";

export interface RecoverySource {
  billId: string;
  country: ResetCountry;
  regionId: string;
  sourceId: string;
  policyId: string;
  optionId: string;
  optionIndex: number;
  optionCount: number;
  enactedTurn: number;
  title: string;
  description: string;
  annualCost: number | null;
  currentBillId?: string;
  currentKind?: string;
  settlement?: RegionalProgramSettlement & { lastSettledTurn: number; validThroughTurn?: number };
}
export interface RecoveryTarget {
  familyId: string;
  country: ResetCountry;
  regionId: string;
  choice: LawChoice;
  annualAllocation: number;
  fundedAmount: number;
  verifiedMissedTurns: number;
  responseScale: number;
  sources: { billId: string; sourceId: string; annualAllocation: number; weight: number }[];
}
export interface RecoveryDecision {
  source: RecoverySource;
  reason: string;
  retire: boolean;
}
export interface RecoveryPlan {
  targets: RecoveryTarget[];
  decisions: RecoveryDecision[];
  annualTransferred: number;
  annualRetired: number;
}
const positions = ["far_left", "center_left", "center", "center_right", "far_right"] as const;
function split(total: number, weights: readonly number[]): number[] {
  const values = weights.map((w) => Math.floor(total * w));
  let left = total - values.reduce((a, b) => a + b, 0);
  const order = weights
    .map((w, i) => ({ i, remainder: total * w - values[i]! }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (const { i } of order) {
    if (!left) break;
    values[i]!++;
    left--;
  }
  if (left) throw new Error("Recovery split does not reconcile");
  return values;
}
export function planLegacyRecovery(input: {
  turn: number;
  sources: readonly RecoverySource[];
  existing: readonly {
    country: string;
    regionId?: string;
    familyId: string;
    effectiveTurn: number;
  }[];
}): RecoveryPlan {
  if (!Number.isSafeInteger(input.turn) || input.turn < 1) throw new Error("Invalid recovery turn");
  const decisions: RecoveryDecision[] = [];
  const pieces: RecoveryTarget[] = [];
  const seen = new Set<string>();
  for (const source of input.sources) {
    if (seen.has(source.policyId)) throw new Error("Duplicate recovery policy");
    seen.add(source.policyId);
    const refuse = (reason: string) => decisions.push({ source, reason, retire: false });
    if (source.currentKind !== "bill" || source.currentBillId !== source.billId) {
      refuse("newer-policy-or-order");
      continue;
    }
    const routes = legacyRecoveryRoutes(source.country, source.sourceId);
    if (!routes.length) {
      refuse("unmapped-tax-or-subsidy");
      continue;
    }
    if (!Number.isSafeInteger(source.annualCost) || source.annualCost! < 0) {
      refuse("missing-cost-evidence");
      continue;
    }
    if (
      !Number.isInteger(source.optionIndex) ||
      source.optionIndex < 0 ||
      source.optionIndex >= source.optionCount ||
      source.optionCount < 2 ||
      !Number.isSafeInteger(source.enactedTurn) ||
      source.enactedTurn < 1 ||
      source.enactedTurn > input.turn
    ) {
      refuse("invalid-option-or-date");
      continue;
    }
    const conflicts = routes.map((route) =>
      input.existing.find(
        (p) =>
          p.country === source.country &&
          p.regionId === source.regionId &&
          p.familyId === route.familyId
      )
    );
    // A partly replaced bundle requires review; never quietly discard its remaining services.
    if (conflicts.some((p) => p && p.effectiveTurn >= source.enactedTurn)) {
      const fullyNewer = conflicts.every((p) => p && p.effectiveTurn >= source.enactedTurn);
      decisions.push({
        source,
        reason: fullyNewer ? "superseded-by-newer-v2" : "partial-v2-conflict",
        retire: fullyNewer,
      });
      continue;
    }
    const paid = source.settlement;
    if (
      paid &&
      (!Number.isSafeInteger(paid.fundedAmount) ||
        paid.fundedAmount < 0 ||
        paid.fundedAmount > source.annualCost! ||
        paid.authorizedCost !== source.annualCost ||
        paid.legislationTypeId !== source.sourceId ||
        paid.policyOptionId !== source.optionId ||
        !Number.isFinite(paid.implementationFactor) ||
        paid.implementationFactor < 0 ||
        paid.implementationFactor > 1)
    ) {
      refuse("conflicting-funding-evidence");
      continue;
    }
    const amounts = split(
      source.annualCost!,
      routes.map((r) => r.weight)
    );
    const funded = split(
      paid?.fundedAmount ?? 0,
      routes.map((r) => r.weight)
    );
    // An expired receipt proves only its own historical interval, not delivery across the later gap.
    const verifiedMissedTurns =
      paid &&
      Number.isSafeInteger(paid.lastSettledTurn) &&
      Number.isSafeInteger(paid.validThroughTurn ?? paid.lastSettledTurn) &&
      paid.lastSettledTurn >= source.enactedTurn &&
      paid.lastSettledTurn <= input.turn
        ? Math.max(
            0,
            Math.min(
              48,
              Math.min(input.turn, paid.validThroughTurn ?? paid.lastSettledTurn) -
                paid.lastSettledTurn +
                1
            )
          )
        : 0;
    // Five-rung public-service ladders run low to high; Japan's seven-rung ladders run high to low.
    const strength =
      source.country === "JP"
        ? source.optionIndex / (source.optionCount - 1)
        : 1 - source.optionIndex / (source.optionCount - 1);
    for (const [i, route] of routes.entries()) {
      const index = Math.round((route.reverse ? 1 - strength : strength) * 4);
      pieces.push({
        country: source.country,
        regionId: source.regionId,
        familyId: route.familyId,
        choice: positions[index]!,
        annualAllocation: amounts[i]!,
        fundedAmount: funded[i]!,
        verifiedMissedTurns,
        responseScale: route.weight,
        sources: [
          {
            billId: source.billId,
            sourceId: source.sourceId,
            annualAllocation: amounts[i]!,
            weight: route.weight,
          },
        ],
      });
    }
    decisions.push({ source, reason: "convert", retire: true });
  }
  const groups = new Map<string, RecoveryTarget[]>();
  for (const piece of pieces) {
    const key = piece.country + ":" + piece.regionId + ":" + piece.familyId;
    const rows = groups.get(key) ?? [];
    rows.push(piece);
    groups.set(key, rows);
  }
  const targets: RecoveryTarget[] = [];
  for (const rows of groups.values()) {
    const chosen = [...rows].sort((a, b) => {
      const at = Math.max(
        ...a.sources.map(
          (s) =>
            input.sources.find((p) => p.billId === s.billId && p.sourceId === s.sourceId)!
              .enactedTurn
        )
      );
      const bt = Math.max(
        ...b.sources.map(
          (s) =>
            input.sources.find((p) => p.billId === s.billId && p.sourceId === s.sourceId)!
              .enactedTurn
        )
      );
      return bt - at || b.sources[0]!.billId.localeCompare(a.sources[0]!.billId);
    })[0]!;
    targets.push({
      ...chosen,
      annualAllocation: rows.reduce((s, r) => s + r.annualAllocation, 0),
      fundedAmount: rows.reduce((s, r) => s + r.fundedAmount, 0),
      verifiedMissedTurns: Math.min(...rows.map((r) => r.verifiedMissedTurns)),
      responseScale: Math.min(
        1,
        rows.reduce((s, r) => s + r.responseScale, 0)
      ),
      sources: rows.flatMap((r) => r.sources),
    });
  }
  // Never partially retire a source bundle whose other target was held for review.
  const held = new Set(decisions.filter((d) => !d.retire).map((d) => d.source.policyId));
  const safeTargets = targets.filter(
    (t) =>
      !t.sources.some((s) =>
        decisions.some(
          (d) =>
            held.has(d.source.policyId) &&
            d.source.billId === s.billId &&
            d.source.sourceId === s.sourceId
        )
      )
  );
  for (const decision of decisions)
    if (
      decision.reason === "convert" &&
      !safeTargets.some((t) =>
        t.sources.some(
          (s) => s.billId === decision.source.billId && s.sourceId === decision.source.sourceId
        )
      )
    ) {
      decision.retire = false;
      decision.reason = "bundle-held-for-review";
    }
  const annualTransferred = safeTargets.reduce((s, t) => s + t.annualAllocation, 0);
  const annualRetired = decisions
    .filter((d) => d.retire)
    .reduce((s, d) => s + d.source.annualCost!, 0);
  const convertedCost = decisions
    .filter((d) => d.reason === "convert")
    .reduce((s, d) => s + d.source.annualCost!, 0);
  if (annualTransferred !== convertedCost) throw new Error("Recovery allocations do not reconcile");
  return { targets: safeTargets, decisions, annualTransferred, annualRetired };
}
