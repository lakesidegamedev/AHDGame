/**
 * Which recipe (sector strategy) an AI founding builds.
 *
 * Plain data in, plain data out: no clock, rng or ambient state.
 *
 * Founding used to pick a sector type and always build its "standard" recipe.
 * The sector-type shortage score read only the static SECTOR_SUPPLY outputs,
 * so goods made only by a non-standard recipe (fertilizers, pharmaceuticals)
 * could never draw a founding, and a new chemical plant added glutted
 * chemicals even while fertilizers sat at zero supply. A plant that wanted the
 * shortage recipe then had to wait for the retool pass and a 12-turn blend.
 *
 * Founding now scores every recipe the type can run, on the same price score
 * the retool pass uses, and builds the best one when it clearly beats the
 * standard recipe and makes a good that is actually short. Otherwise it stays
 * on standard.
 */

import type { CommodityType } from "@/lib/constants/commodities";

/** Price-over-base ratio of a commodity in a country; null when unpriced. */
export type RecipePriceRatioOf = (commodity: CommodityType, countryId: string) => number | null;

export interface FoundingRecipeOption {
  id: string;
  supply: Partial<Record<CommodityType, number>>;
  demand: Partial<Record<CommodityType, number>>;
}

/** The recipe a sector runs when it records no strategy. */
export const DEFAULT_RECIPE_ID = "standard";

/**
 * Score advantage over the standard recipe a founding needs to build another
 * one. Same bar a profitable plant needs to retool toward a shortage
 * (STRATEGY_SHIFT_PROFIT_SEEK_ADVANTAGE), so founding never picks a recipe an
 * operating plant would not have switched to.
 */
export const FOUNDING_RECIPE_MIN_ADVANTAGE = 0.25;

/**
 * An output priced at or above this multiple of base counts as short. Matches
 * the founding sweep's shortage bar (FOUNDING_SHORT_PRICE_RATIO).
 */
export const FOUNDING_RECIPE_SHORT_RATIO = 1.15;

/**
 * Price advantage per anchor unit of revenue. Positive scores favor recipes
 * that sell into expensive markets and buy from cheap ones. Returns null when
 * no commodity on either side has a price ratio.
 */
export function strategyPriceScore(
  strategy: {
    supply: Partial<Record<CommodityType, number>>;
    demand: Partial<Record<CommodityType, number>>;
  },
  countryId: string,
  priceRatioOf: RecipePriceRatioOf
): number | null {
  let score = 0;
  let priced = false;
  for (const [commodity, rate] of Object.entries(strategy.supply)) {
    if (!(typeof rate === "number" && rate > 0)) continue;
    const ratio = priceRatioOf(commodity as CommodityType, countryId);
    if (ratio == null) continue;
    score += rate * (ratio - 1);
    priced = true;
  }
  for (const [commodity, rate] of Object.entries(strategy.demand)) {
    if (!(typeof rate === "number" && rate > 0)) continue;
    const ratio = priceRatioOf(commodity as CommodityType, countryId);
    if (ratio == null) continue;
    score -= rate * (ratio - 1);
    priced = true;
  }
  return priced ? score : null;
}

/** Highest price ratio among a recipe's outputs; 0 when none is priced. */
export function recipePeakOutputRatio(
  recipe: Pick<FoundingRecipeOption, "supply">,
  countryId: string,
  priceRatioOf: RecipePriceRatioOf
): number {
  let peak = 0;
  for (const [commodity, rate] of Object.entries(recipe.supply)) {
    if (!(typeof rate === "number" && rate > 0)) continue;
    const ratio = priceRatioOf(commodity as CommodityType, countryId);
    if (ratio != null && Number.isFinite(ratio) && ratio > peak) peak = ratio;
  }
  return peak;
}

/**
 * Highest output price ratio across every recipe the type can run. A
 * fertilizers or pharmaceuticals shortage shows on the chemical type here,
 * where the static sector table cannot see it. 0 when nothing is priced.
 */
export function recipePeakShortageScore<R extends FoundingRecipeOption>(args: {
  recipes: readonly R[] | undefined;
  countryId: string;
  priceRatioOf: RecipePriceRatioOf;
  isAvailable: (recipe: R) => boolean;
}): number {
  let peak = 0;
  for (const recipe of args.recipes ?? []) {
    if (!args.isAvailable(recipe)) continue;
    peak = Math.max(peak, recipePeakOutputRatio(recipe, args.countryId, args.priceRatioOf));
  }
  return peak;
}

/**
 * The recipe a new plant of this type should build, or undefined for the
 * standard recipe. A recipe wins when it is available, makes an output priced
 * short, and beats standard on the retool price score by the founding bar.
 * The best score among those wins.
 */
export function chooseFoundingRecipe<R extends FoundingRecipeOption>(args: {
  recipes: readonly R[] | undefined;
  countryId: string;
  priceRatioOf: RecipePriceRatioOf;
  isAvailable: (recipe: R) => boolean;
}): string | undefined {
  const recipes = args.recipes ?? [];
  const standard = recipes.find((r) => r.id === DEFAULT_RECIPE_ID);
  if (!standard) return undefined;
  const standardScore = strategyPriceScore(standard, args.countryId, args.priceRatioOf) ?? 0;
  let best: { id: string; score: number } | null = null;
  for (const recipe of recipes) {
    if (recipe.id === DEFAULT_RECIPE_ID) continue;
    if (!args.isAvailable(recipe)) continue;
    if (
      recipePeakOutputRatio(recipe, args.countryId, args.priceRatioOf) < FOUNDING_RECIPE_SHORT_RATIO
    )
      continue;
    const score = strategyPriceScore(recipe, args.countryId, args.priceRatioOf);
    if (score == null) continue;
    if (score - standardScore < FOUNDING_RECIPE_MIN_ADVANTAGE) continue;
    if (!best || score > best.score) best = { id: recipe.id, score };
  }
  return best?.id;
}
