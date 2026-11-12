/**
 * Crisis effect unit scale: fraction to native metric units.
 *
 * Crisis templates author metric/approval/inflation effects as fractional swings
 * (e.g. -0.02 = a 2% swing). Metrics, approval and inflation are stored on native
 * point scales (gdpGrowth 1.5, approvalRating 0-100, inflationRate 2.5) and the
 * turn engine applies effects as a raw `$inc`. Without conversion a -0.02 effect
 * moves a percent-scale metric by 0.02pp, effectively nothing. These constants
 * convert the authored swing to a native delta at construction time (in `fx()`),
 * so stored, displayed and applied values agree.
 *
 * Two factors because the two kinds accumulate differently:
 *   - `flat`: applied once. x100 turns a -0.03 swing into a ~3-point one-off hit.
 *   - `tick`: applied every turn AND ramped down over the crisis, so it uses a
 *     smaller per-turn factor to land a comparable cumulative drag without
 *     flooring the metric.
 *
 * `gdpLoss` (a genuine GDP fraction) and `profitMargin` (already percentage
 * points) bypass `fx()` and are NOT scaled.
 *
 * `severity.ts` divides its impact weights by these same constants so its
 * classification is scale-invariant.
 */
export const CRISIS_FLAT_UNIT_SCALE = 100;
export const CRISIS_TICK_UNIT_SCALE = 30;

/** Scale an authored fractional swing to a native metric delta for the given kind. */
export function toNativeEffectValue(effectType: "flat" | "tick", swing: number): number {
  return swing * (effectType === "tick" ? CRISIS_TICK_UNIT_SCALE : CRISIS_FLAT_UNIT_SCALE);
}
