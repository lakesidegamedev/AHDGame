/** FX policy previews share settlement quotes and expose conditional, not guaranteed, targets. */
import {
  DEFENCE_MAX_PRESSURE,
  quoteDefence,
  type DefenceMarket,
  type DefencePolicy,
} from "./defence";

export interface DefencePreviewContext extends DefenceMarket {
  buyReservesAnchor: number;
  sellReservesAnchor: number;
  macroTarget: number;
  driftAlpha: number;
  /** Legal policy range may be narrower than floating rate guardrails. */
  policyFloor?: number;
  policyCeiling?: number;
}

export function previewDefence(context: DefencePreviewContext, policy: DefencePolicy) {
  const direction = context.rawRate > policy.ceiling ? "buy" : "sell";
  const quote = quoteDefence(
    context,
    policy,
    direction === "buy" ? context.buyReservesAnchor : context.sellReservesAnchor
  );
  if (!quote) return null;
  // Constant fundamentals, no noise or organic flow, sustained maximum pressure.
  const a = Math.max(0.001, Math.min(1, context.driftAlpha));
  const p = DEFENCE_MAX_PRESSURE * context.adherence;
  const steady = (factor: number) => (context.macroTarget * a * factor) / (1 - (1 - a) * factor);
  const plausibleFloor = Math.max(context.hardFloor, steady(1 - p));
  const plausibleCeiling = Math.min(context.hardCeiling, steady(1 + p));
  return {
    ...quote,
    plausibleFloor,
    plausibleCeiling,
    fundamentalWarning: policy.ceiling < plausibleFloor || policy.floor > plausibleCeiling,
    reserveRunway:
      quote.spendAnchor > 0
        ? (direction === "buy" ? context.buyReservesAnchor : context.sellReservesAnchor) /
          quote.spendAnchor
        : null,
  };
}

export function stabilizationBand(
  context: DefencePreviewContext,
  around: "current" | "fundamentals"
) {
  const floor = context.policyFloor ?? context.hardFloor;
  const ceiling = context.policyCeiling ?? context.hardCeiling;
  const middle = Math.max(
    floor,
    Math.min(ceiling, around === "current" ? context.rawRate : context.macroTarget)
  );
  return {
    floor: Math.max(floor, middle * 0.98),
    ceiling: Math.min(ceiling, middle * 1.02),
  };
}
