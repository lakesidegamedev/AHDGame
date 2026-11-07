import { isStrategySunset } from "@/lib/constants/techTree/sunset";

/** Only the parent-catalog selections produced by the retired NPP writer qualify. */
export function isObsoleteNppParentStrategy(
  ceoType: string | null | undefined,
  operatingType: string,
  strategyId: string
): boolean {
  if (ceoType !== "npp") return false;
  return (
    (operatingType === "media_entertainment" && strategyId === "legacy_broadcast") ||
    (operatingType === "manufacturing_vehicles" &&
      (strategyId === "heavy_metals" || strategyId === "electronics_manufacturing"))
  );
}

interface SunsetRepairRecipe {
  id: string;
  sunsetDecade?: string;
  successorIds?: string[];
}

/**
 * The method an AI-run site on a retired (sunset) method converts to: of the
 * named successors open to it, the one with the best price score, or the
 * first open one when none is priced. Null when the method is not sunset or
 * no successor is open. Mirrors the obsolete-id repair above: the site is
 * moved as a corrective retool through the normal blend.
 */
export function sunsetRepairTarget<R extends SunsetRepairRecipe>(
  current: R,
  strategies: readonly R[],
  currentYear: number,
  isAvailable: (recipe: R) => boolean,
  scoreOf: (recipe: R) => number | null
): R | null {
  if (!isStrategySunset(current, currentYear)) return null;
  let best: { recipe: R; score: number | null } | null = null;
  for (const id of current.successorIds ?? []) {
    const recipe = strategies.find((s) => s.id === id);
    if (!recipe || !isAvailable(recipe)) continue;
    const score = scoreOf(recipe);
    if (best == null || (score != null && (best.score == null || score > best.score))) {
      best = { recipe, score };
    }
  }
  return best?.recipe ?? null;
}
