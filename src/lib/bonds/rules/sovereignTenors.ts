/**
 * Long sovereign tenors (issue #5693): 10-year (480 turns) and 30-year
 * (1,440 turns) paper, and the debt manager that chooses the maturity mix
 * when no finance minister has set one.
 *
 * Worlds that have not opted in keep the classic 1, 2 and 5 year ladder and
 * the fixed default mix. Plain data in, plain data out.
 */
import type { BondMaturityTurns } from "@/lib/db/types/bond";

/** Presets whose sovereigns may issue 10 and 30 year paper. */
const LONG_TENOR_PRESETS: ReadonlySet<string> = new Set(["2027-default"]);

export function presetUsesLongSovereignTenors(preset: string | undefined): boolean {
  return preset !== undefined && LONG_TENOR_PRESETS.has(preset);
}

export const SOVEREIGN_CLASSIC_MATURITIES: readonly BondMaturityTurns[] = [48, 96, 240];
export const SOVEREIGN_LONG_MATURITIES: readonly BondMaturityTurns[] = [48, 96, 240, 480, 1440];

/** Maturities a sovereign may issue in this world. */
export function sovereignIssuanceMaturities(longTenors: boolean): readonly BondMaturityTurns[] {
  return longTenors ? SOVEREIGN_LONG_MATURITIES : SOVEREIGN_CLASSIC_MATURITIES;
}

type MaturityMix = Partial<Record<BondMaturityTurns, number>>;

/** Mix at rates in line with their history. */
const NEUTRAL_MIX: MaturityMix = { 48: 0.2, 96: 0.25, 240: 0.3, 480: 0.2, 1440: 0.05 };
/** Mix when rates sit well below their history: lock in cheap money for longer. */
const LONG_MIX: MaturityMix = { 48: 0.1, 96: 0.15, 240: 0.25, 480: 0.3, 1440: 0.2 };
/** Mix when rates sit well above their history: borrow short and wait. */
const SHORT_MIX: MaturityMix = { 48: 0.35, 96: 0.3, 240: 0.25, 480: 0.1, 1440: 0 };

/** Percentage points below (or above) the historical mean at which the mix is fully long (or short). */
export const DEBT_MANAGER_FULL_TILT_PP = 2;

/** Mean of the recorded policy rates, or undefined with no usable history. */
export function meanHistoricalRate(history: readonly number[]): number | undefined {
  const usable = history.filter((rate) => Number.isFinite(rate));
  if (usable.length === 0) return undefined;
  return usable.reduce((sum, rate) => sum + rate, 0) / usable.length;
}

/**
 * Tilt toward long paper, -1 (fully short) to 1 (fully long): how far the
 * current rate sits below its historical mean, in units of
 * DEBT_MANAGER_FULL_TILT_PP. No history means no tilt.
 */
export function debtManagerTilt(currentRate: number, history: readonly number[]): number {
  const mean = meanHistoricalRate(history);
  if (mean === undefined || !Number.isFinite(currentRate)) return 0;
  const tilt = (mean - currentRate) / DEBT_MANAGER_FULL_TILT_PP;
  return Math.max(-1, Math.min(1, tilt));
}

/**
 * The debt manager's maturity mix: the neutral ladder blended toward the long
 * mix when rates are low against their history and toward the short mix when
 * they are high. Shares sum to 1.
 */
export function debtManagerMaturityMix(input: {
  currentRate: number;
  rateHistory: readonly number[];
}): MaturityMix {
  const tilt = debtManagerTilt(input.currentRate, input.rateHistory);
  const target = tilt >= 0 ? LONG_MIX : SHORT_MIX;
  const weight = Math.abs(tilt);
  const raw = SOVEREIGN_LONG_MATURITIES.map((turns) => {
    const share = (NEUTRAL_MIX[turns] ?? 0) * (1 - weight) + (target[turns] ?? 0) * weight;
    return [turns, Math.round(share * 1000) / 1000] as const;
  });
  // Rounding residue goes to the 5-year rung so the shares sum to exactly 1.
  const residue = 1 - raw.reduce((sum, [, share]) => sum + share, 0);
  const mix: MaturityMix = {};
  for (const [turns, share] of raw) {
    const adjusted = turns === 240 ? Math.round((share + residue) * 1000) / 1000 : share;
    if (adjusted > 0) mix[turns] = adjusted;
  }
  return mix;
}

/** Weighted average maturity of a mix, in turns. */
export function weightedAverageMaturityTurns(mix: MaturityMix): number {
  let total = 0;
  let weighted = 0;
  for (const [turns, share] of Object.entries(mix)) {
    if (!share || share <= 0) continue;
    total += share;
    weighted += Number(turns) * share;
  }
  return total > 0 ? weighted / total : 0;
}
