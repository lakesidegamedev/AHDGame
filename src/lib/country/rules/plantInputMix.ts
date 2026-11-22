export type CommodityRates = Partial<Record<string, number>>;

export interface WeightedRecipe {
  /** Weight of this plant in the mix, such as its revenue. */
  weight: number;
  rates: CommodityRates;
}

/**
 * Revenue-weighted average of the recipes the plants in one market actually
 * run, as commodity and share-of-revenue rows, largest first. Only commodities
 * a running plant uses appear. Empty when no plant carries weight.
 */
export function weightedRecipeMix(
  recipes: readonly WeightedRecipe[]
): { commodity: string; rate: number }[] {
  const total = recipes.reduce((sum, r) => sum + (r.weight > 0 ? r.weight : 0), 0);
  if (!(total > 0)) return [];
  const sums = new Map<string, number>();
  for (const recipe of recipes) {
    if (!(recipe.weight > 0)) continue;
    for (const [commodity, rate] of Object.entries(recipe.rates)) {
      if (typeof rate !== "number" || !(rate > 0)) continue;
      sums.set(commodity, (sums.get(commodity) ?? 0) + rate * recipe.weight);
    }
  }
  return [...sums]
    .map(([commodity, value]) => ({ commodity, rate: value / total }))
    .sort((a, b) => b.rate - a.rate || a.commodity.localeCompare(b.commodity));
}
