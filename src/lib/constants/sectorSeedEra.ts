/**
 * `SECTOR_SEED_SCALE` is a GDP multiple, so it is era-neutral. The minimum
 * (`MIN_UNOWNED_SECTOR_REVENUE`, 1,000,000) is an absolute amount calibrated
 * against modern nominal GDP and must be deflated per era so it stays a fixed
 * share of the economy. Without this, pre-modern seeds clamp nearly every
 * (state, sector) bucket to the floor and lose all differentiation.
 *
 * Keyed on the seed preset (via `eraForPreset`), not the in-game year: sector
 * seed revenue is written once from frozen seed data and does not graduate with
 * the world clock.
 *
 * Only presets listed in {@link SECTOR_SEED_ERA_FLOORS} deviate; all others
 * (modern presets, aliases, unknowns, no preset) resolve the unchanged modern
 * constants. 1979 is deliberately omitted pending its own measurement pass.
 */

import type { EraId } from "@/lib/seeds/presetSelector";
import { eraForPreset } from "@/lib/seeds/presetSelector";
import { SECTOR_SEED_SCALE } from "./corporations";

/**
 * Modern (2019-calibrated) minimum ₳ revenue for one unowned (state, sector)
 * bucket. Re-exported by `seedUnownedSectors` as `MIN_UNOWNED_SECTOR_REVENUE`.
 */
export const MODERN_MIN_UNOWNED_SECTOR_REVENUE = 1_000_000;

/**
 * US national seed GDP by era, from `getNationalBudgetSeedConfigsForPreset` in
 * `seeds/reference/budgets.ts` (this module cannot import that file — it would
 * drag the whole budget seed graph into `constants/`). The US is the yardstick
 * because the ₳ anchor trades ~1:1 with the dollar in every era, so the ratio
 * between two entries is the eras' nominal-money ratio.
 * Kept in sync by `sectorSeedEra.test.ts`.
 */
export const US_NATIONAL_SEED_GDP_BY_ERA: Partial<Record<EraId, number>> = {
  "1953": 387_000_000_000,
  "2019": 27_000_000_000_000,
};

/**
 * Nominal-money scale of the era relative to 2019, from
 * {@link US_NATIONAL_SEED_GDP_BY_ERA}. Returns 1 for any era without an entry
 * (all modern presets, aliases, no preset), so it is a no-op outside the listed
 * eras.
 *
 * Use wherever an ABSOLUTE ₳ amount was calibrated on modern nominal GDP and
 * must keep the same SHARE of a smaller nominal economy. Two consumers today:
 * the unowned-sector revenue floor below, and NPP corporations' default
 * starting capital (`spawnNppCorporation`).
 */
export function getEraNominalScale(preset?: string): number {
  const modern = US_NATIONAL_SEED_GDP_BY_ERA["2019"];
  if (!preset || !modern) return 1;
  const eraGdp = US_NATIONAL_SEED_GDP_BY_ERA[eraForPreset(preset)];
  if (!eraGdp) return 1;
  return eraGdp / modern;
}

/**
 * UNIT-BASIS scale for the plants tier: capacity units the era's money
 * buys per modern-priced unit.
 *
 * ₳↔unit conversions are calibrated on 2019 `COMMODITY_BASE_PRICES`, but
 * era ₳ figures are far smaller, so without this a 1953 world collapses
 * into single-digit capacity, quantization dead zones and per-unit prices
 * that dwarf era incomes.
 *
 * Reciprocal of {@link getEraNominalScale} (~70 for 1953, 1 for modern,
 * aliases, unknown and absent presets). Both legs of every conversion must
 * use the same scale or a stored (revenue, units) pair drifts by the era
 * ratio, so resolve once and thread it.
 */
export function getEraUnitScale(preset?: string): number {
  const nominal = getEraNominalScale(preset);
  return nominal > 0 ? 1 / nominal : 1;
}

/**
 * Per-era override of the unowned-sector revenue floor, in ₳.
 *
 * 1953: 1,000,000 × ($387B ÷ $27,000B) ≈ 14,333 → 15,000 (rounded up to a
 * legible round number; the test pins it within 20% of the derived value).
 * At this floor the seeded 1953 world differentiates on GDP and sector weight
 * the way a modern world does, and the floor goes back to being what it was
 * designed to be — a guard against degenerate near-zero buckets in the
 * smallest regions, not the value of half the world's sectors.
 */
export const SECTOR_SEED_ERA_FLOORS: Partial<Record<EraId, number>> = {
  "1953": 15_000,
};

/**
 * Per-era override of the seed-time GDP multiple. Intentionally EMPTY: the
 * scale is a GDP multiple and therefore already era-neutral (see module doc).
 * The hook exists so a future era that genuinely needs a different market
 * DEPTH (not just a different money magnitude) has an obvious place to say so,
 * rather than reaching for the floor as a proxy.
 */
export const SECTOR_SEED_ERA_SCALES: Partial<Record<EraId, number>> = {};

/**
 * Minimum ₳ revenue for one unowned (state, sector) bucket under `preset`.
 * Returns {@link MODERN_MIN_UNOWNED_SECTOR_REVENUE} for every era without an
 * explicit entry, and for a missing/unknown preset.
 */
export function getMinUnownedSectorRevenue(preset?: string): number {
  if (!preset) return MODERN_MIN_UNOWNED_SECTOR_REVENUE;
  return SECTOR_SEED_ERA_FLOORS[eraForPreset(preset)] ?? MODERN_MIN_UNOWNED_SECTOR_REVENUE;
}

/**
 * Seed-time GDP multiple for `preset`. Returns the unchanged
 * {@link SECTOR_SEED_SCALE} for every era without an explicit entry.
 */
export function getSectorSeedScale(preset?: string): number {
  if (!preset) return SECTOR_SEED_SCALE;
  return SECTOR_SEED_ERA_SCALES[eraForPreset(preset)] ?? SECTOR_SEED_SCALE;
}

/**
 * Era-scaled baseline price for one commodity, in ₳.
 *
 * `COMMODITY_BASE_PRICES` is a 2019-calibrated table, so seeding it into older
 * eras prices a mid-century economy in modern money and puts sector revenue,
 * extraction economics and trade on the wrong scale.
 *
 * Uniform deflation by {@link getEraNominalScale} rather than per-commodity
 * history: it moves the price level and leaves relative prices to the market.
 * Same no-op and SEED-PRESET keying as the floor above.
 */
export function getEraCommodityBasePrice(modernBasePrice: number, preset?: string): number {
  const scale = getEraNominalScale(preset);
  if (scale === 1) return modernBasePrice;
  // Never round a price to zero — the smallest markets still need a positive
  // unit price or every downstream ratio divides by nothing.
  return Math.max(0.01, modernBasePrice * scale);
}

/**
 * An absolute ₳ amount expressed in the era's own money.
 *
 * The generic form of the deflation the unowned-sector floor, commodity prices,
 * character starting cash and NPP corporate capital all use. Anywhere a flat
 * constant was calibrated on modern nominal magnitudes and has to keep the same
 * SHARE of a smaller nominal economy, put it through here rather than adding a
 * fourth scale.
 *
 * Same no-op guarantee as {@link getEraNominalScale}: eras without an entry —
 * every modern preset, alias, unknown string and absent preset — return the
 * amount unchanged.
 */
export function getEraNominalAmount(modernAmount: number, preset?: string): number {
  if (!Number.isFinite(modernAmount) || modernAmount <= 0) return modernAmount;
  const scale = getEraNominalScale(preset);
  if (scale === 1) return modernAmount;
  // Legible whole number, but a real amount must never deflate away entirely.
  return Math.max(1, Math.round(modernAmount * scale));
}

/**
 * Issued share count for a NEWLY MINTED corporation, in the era's own money.
 *
 * The share base and the treasury that backs it must deflate together, or
 * the per-share price floors below `MIN_SHARE_PRICE`. Scaling the share base
 * by the same factor restores the identity: market cap at founding equals the
 * treasury, and the opening price is $0.10 whatever the year.
 *
 * MINT SITES ONLY. Read paths that fall back to `CEO_INITIAL_SHARES` for
 * legacy documents must keep using the raw modern constant: those rows were
 * written with a 10,000,000 base, and reinterpreting them at the era count
 * would silently restate existing cap tables.
 */
export function getEraFounderShares(modernShares: number, preset?: string): number {
  return getEraNominalAmount(modernShares, preset);
}

/**
 * Era-scaled corporation founding numbers, for the server route AND the
 * founding modal. Both must use this so the preview equals the charge.
 */
export function getEraFoundingBounds(
  preset: string | undefined,
  modern: { fee: number; baseline: number; min: number; max: number }
): { fee: number; baseline: number; min: number; max: number } {
  return {
    fee: getEraNominalAmount(modern.fee, preset),
    baseline: getEraNominalAmount(modern.baseline, preset),
    min: getEraNominalAmount(modern.min, preset),
    max: getEraNominalAmount(modern.max, preset),
  };
}
