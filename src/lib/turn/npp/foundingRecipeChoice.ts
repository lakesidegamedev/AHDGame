/**
 * Recipe-aware founding signals for one operating lane: the recipe a new AI
 * plant builds and the lane's peak shortage across every recipe it can run.
 * The rules live in rules/foundingRecipe; this binds them to the strategy
 * table and to era and tech gating.
 */
import { operatingSectorIdentity, type OperatingSectorType } from "@/lib/constants/corporations";
import { SECTOR_STRATEGIES, type SectorStrategy } from "@/lib/constants/sectorStrategies";
import { isDecadeReached } from "@/lib/constants/techTree/decades";
import { getStrategyAvailability } from "@/lib/constants/techTree/strategyAvailability";
import {
  chooseFoundingRecipe,
  DEFAULT_RECIPE_ID,
  recipePeakShortageScore,
} from "./rules/foundingRecipe";
import { recipeInputAvailability, type StateInputAvailabilityOf } from "./rules/inputAvailability";
import { sectorPeakShortageScore, type CommodityPriceRatioFn } from "./marketSignals";

export interface FoundingRecipeWorld {
  /** In-game year; 0 or absent when unknown, which admits no era-gated recipe. */
  currentYear?: number;
  techTreesEnabled: boolean;
}

/**
 * Whether a newly founded plant of this lane may run the recipe. The era gate
 * applies whether or not tech trees are on: an AI founding never builds a
 * method its era has not reached. With tech trees on, a recipe that needs a
 * tech unlock must be one a new company inherits from past decades.
 */
export function foundingRecipeAvailable(
  lane: OperatingSectorType,
  world: FoundingRecipeWorld
): (recipe: SectorStrategy) => boolean {
  const year = world.currentYear ?? 0;
  const identity = operatingSectorIdentity(lane);
  const newCompany = {
    type: identity.sectorType as OperatingSectorType,
    industryModel: identity.industryModel ?? null,
    mediaDiscriminator: identity.mediaDiscriminator ?? null,
    unlockedTechNodeIds: [],
  };
  return (recipe) => {
    if (recipe.minDecade && !(year > 0 && isDecadeReached(recipe.minDecade, year))) return false;
    return !getStrategyAvailability(newCompany, recipe, year, world.techTreesEnabled).locked;
  };
}

/** Where a founding would land, for reading its inputs' delivered fill. */
export interface FoundingInputSite {
  stateId: string;
  availabilityOf: StateInputAvailabilityOf;
}

/** The recipe a new plant of this lane builds; undefined keeps the standard recipe. */
export function foundingRecipeFor(
  lane: OperatingSectorType,
  countryId: string,
  priceRatioOf: CommodityPriceRatioFn,
  world: FoundingRecipeWorld,
  site?: FoundingInputSite
): string | undefined {
  // A mine's recipe is bound to the deposits of the state it lands in, which
  // this lane-level choice cannot see; extraction keeps its standard recipe.
  if (lane === "extraction") return undefined;
  return chooseFoundingRecipe({
    recipes: SECTOR_STRATEGIES[lane],
    countryId,
    priceRatioOf,
    isAvailable: foundingRecipeAvailable(lane, world),
    ...(site
      ? {
          inputAvailabilityOf: (recipe: SectorStrategy) =>
            recipeInputAvailability(recipe.demand, site.stateId, site.availabilityOf),
        }
      : {}),
  });
}

/**
 * Expected fill of the scarcest input of the recipe a founding of this lane
 * would build at the site: the recipe `foundingRecipeFor` picks on a funded
 * world, standard otherwise. Null for extraction, whose recipe follows the
 * state's deposits, and for a lane with no recipe table.
 */
export function foundingInputAvailability(
  lane: OperatingSectorType,
  countryId: string,
  priceRatioOf: CommodityPriceRatioFn,
  world: FoundingRecipeWorld | undefined,
  site: FoundingInputSite
): number | null {
  if (lane === "extraction") return null;
  const recipes = SECTOR_STRATEGIES[lane];
  if (!recipes || recipes.length === 0) return null;
  const chosenId = world
    ? foundingRecipeFor(lane, countryId, priceRatioOf, world, site)
    : undefined;
  const recipe =
    recipes.find((r) => r.id === (chosenId ?? DEFAULT_RECIPE_ID)) ??
    recipes.find((r) => r.id === DEFAULT_RECIPE_ID);
  if (!recipe) return null;
  return recipeInputAvailability(recipe.demand, site.stateId, site.availabilityOf);
}

/**
 * A lane's peak output shortage for founding: the static sector table's peak,
 * raised by any recipe the lane can run whose output is shorter.
 */
export function foundingLanePeakShortage(
  lane: OperatingSectorType,
  countryId: string,
  priceRatioOf: CommodityPriceRatioFn,
  world: FoundingRecipeWorld
): number {
  if (lane === "extraction") return sectorPeakShortageScore(lane, countryId, priceRatioOf);
  return Math.max(
    sectorPeakShortageScore(lane, countryId, priceRatioOf),
    recipePeakShortageScore({
      recipes: SECTOR_STRATEGIES[lane],
      countryId,
      priceRatioOf,
      isAvailable: foundingRecipeAvailable(lane, world),
    })
  );
}
