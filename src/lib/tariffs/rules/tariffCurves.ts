/**
 * Pure tariff curves: plain numbers in, plain numbers out. The tariff
 * engine in `tariffEffects.ts` gathers the rates; these functions turn a
 * rate into the margin, weight and capture effects, so the same curves can
 * run in the turn loop, the wiki charts and the headless harness.
 */

/** Share of the effective tariff rate a foreign corporation loses as margin. */
export const FOREIGN_TARIFF_MARGIN_SHARE = 0.5;

/** Domestic margin malus (percentage points) at a 100% combined rate. */
export const DOMESTIC_TARIFF_MALUS_AT_FULL = 10;

/** Blend weights with no tariff pressure. */
export const TARIFF_BLEND_BASE_GLOBAL_WEIGHT = 0.5;
export const TARIFF_BLEND_BASE_NATIONAL_WEIGHT = 0.25;
export const TARIFF_BLEND_LOCAL_WEIGHT = 0.25;

/** Weight moved from global to national at a 100% blend rate. */
export const TARIFF_BLEND_SHIFT_AT_FULL = 0.25;

/** Largest change to split-capture multipliers at a 100% effective tariff. */
export const SPLIT_CAPTURE_SWING_AT_FULL = 0.5;

/** Foreign corp margin modifier (percentage points, <= 0) at an effective rate 0 to 100. */
export function foreignMarginModifierForRate(rate: number): number {
  if (rate === 0) return 0;
  return -rate * FOREIGN_TARIFF_MARGIN_SHARE;
}

/** Domestic corp margin malus (percentage points, <= 0) for a combined broad-scope rate. */
export function domesticMalusForRate(totalRate: number): number {
  const T = Math.min(100, totalRate);
  const malus = -(T / 100) * DOMESTIC_TARIFF_MALUS_AT_FULL;
  return Object.is(malus, -0) ? 0 : malus;
}

/** Global / national / local blend weights for a blend rate 0 to 100. */
export function blendWeightsForRate(blendRate: number): {
  globalWeight: number;
  nationalWeight: number;
  localWeight: number;
} {
  const T = Math.min(100, blendRate);
  const tariffEffect = T / 100;
  return {
    globalWeight: TARIFF_BLEND_BASE_GLOBAL_WEIGHT - tariffEffect * TARIFF_BLEND_SHIFT_AT_FULL,
    nationalWeight: TARIFF_BLEND_BASE_NATIONAL_WEIGHT + tariffEffect * TARIFF_BLEND_SHIFT_AT_FULL,
    localWeight: TARIFF_BLEND_LOCAL_WEIGHT,
  };
}

/**
 * Split capture multiplier for an effective tariff rate (0 to 100): 1.0 at no
 * tariff, rising to 1.5 for a domestic corp and falling to 0.5 for a foreign one.
 */
export function splitCaptureMultiplierForRate(
  effectiveTariffRate: number,
  isDomesticSplittingForeign: boolean
): number {
  const T = Math.max(0, Math.min(100, effectiveTariffRate));
  if (isDomesticSplittingForeign) return 1.0 + (T / 100) * SPLIT_CAPTURE_SWING_AT_FULL;
  return 1.0 - (T / 100) * SPLIT_CAPTURE_SWING_AT_FULL;
}
