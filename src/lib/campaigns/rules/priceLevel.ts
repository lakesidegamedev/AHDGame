/**
 * Between-era campaign price level.
 *
 * PORTABLE RULES: plain data in, plain data out. No database, clock, randomness,
 * env, network, or async; the caller supplies the preset/era and this module
 * resolves the scalar.
 *
 * WHY: per-era GDP-per-capita baselines make gdpPerCapita / baseline resolve about
 * 1.0 within every era, but leave a between-era distortion: historical worlds
 * charge and pay MODERN nominal dollars even though their nominal economy is a
 * fraction of the modern one. This table is the symmetric deflator that scales
 * both action fund costs and campaign income, so a 1953 dollar buys 1953 amounts
 * of each.
 *
 * DERIVATION: with no dedicated US price index wired in, the price level is
 * approximated from the US row of the per-era GDP-per-capita baseline:
 *
 *     era price level = US nominal GDP/capita(era) / US nominal GDP/capita(2019)
 *
 * This is an upper bound on pure inflation but is consistent, available for every
 * era, and mirrors the denominators the income and cost math already use. Values
 * rounded to 5 decimals. priceLevel.test.ts recomputes every cell from
 * getGdpBaselineTable().US, so edit seeds and recalibrate here.
 *
 * FAIL-SAFE: any unknown preset/era (or none) resolves to 1, matching pre-existing
 * behavior, the same posture as DEFAULT_SEED_PRESET in gdpBaseline.ts.
 *
 * FEATURE-GATED: these values must reach the money math only when
 * gameConfig.campaignEraPriceLevelEnabled is true. The gate is resolved at the
 * shell boundary via resolveCampaignPriceLevel; the pure cost and income formulas
 * take the resolved scalar and never read the flag.
 */

import type { EraId } from "@/lib/seeds/presetSelector";
import { eraForPreset } from "@/lib/seeds/presetSelector";

/** Price level of the modern baseline era (2019): the identity scalar. */
export const MODERN_PRICE_LEVEL = 1;

/**
 * Era → price level relative to the modern (2019 === 1.0) US nominal
 * GDP-per-capita baseline. See the module doc for the derivation. Values below
 * 1 deflate a historical era; values above 1 inflate an era whose nominal
 * economy exceeds 2019 (2023/2027).
 */
export const ERA_PRICE_LEVEL: Record<EraId, number> = {
  "1953": 0.03673,
  "1979": 0.16688,
  "1991": 0.35808,
  "1999": 0.49707,
  "2007": 0.6562,
  "2019": MODERN_PRICE_LEVEL,
  "2023": 1.14996,
  "2027": 1.37848,
};

/**
 * Resolve the price level for an era or a world preset.
 *
 * Accepts either an `EraId` ("1953") or a reset preset id ("1953-default",
 * "empty", "2019-no-parties"). Unknown presets, the empty string and
 * null/undefined all resolve the modern value 1 (fail-safe = today's behavior),
 * because `eraForPreset` already folds every unrecognised preset onto the 2019
 * era.
 */
export function eraPriceLevelFor(presetOrEra?: string | null): number {
  if (!presetOrEra) return MODERN_PRICE_LEVEL;
  // Own-property check so an Object.prototype key ("constructor", "__proto__")
  // cannot masquerade as an authored era; those fall through to `eraForPreset`,
  // which maps unknown ids onto the modern era rather than returning a value.
  const era: EraId = Object.hasOwn(ERA_PRICE_LEVEL, presetOrEra)
    ? (presetOrEra as EraId)
    : eraForPreset(presetOrEra);
  return ERA_PRICE_LEVEL[era] ?? MODERN_PRICE_LEVEL;
}

/**
 * Resolve the price-level scalar for money math, applying the feature gate at
 * the SHELL boundary. Call once and thread the scalar into pure cost/income
 * functions. When disabled the scalar is exactly MODERN_PRICE_LEVEL, so every
 * formula reduces to its pre-flagged arithmetic.
 */
export function resolveCampaignPriceLevel(
  enabled: boolean | null | undefined,
  presetOrEra?: string | null
): number {
  if (enabled !== true) return MODERN_PRICE_LEVEL;
  return eraPriceLevelFor(presetOrEra);
}
