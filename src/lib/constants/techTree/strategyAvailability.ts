/**
 * Production-method (sector strategy) gating by the tech tree.
 *
 * A strategy can require an era (`minDecade`) and/or a tech unlock
 * (`requiresTechUnlock`, satisfied by an `unlockStrategy` node). This is inert
 * when the tech-trees feature is off, so existing worlds keep every method.
 *
 * For the tech-unlock check we merge the corp's actual researched nodes with the
 * auto-granted past-decade sector nodes. This ensures corps that predate the tech
 * tree (empty unlockedTechNodeIds) and newly founded late-era corps both have
 * access to strategies whose unlock nodes live in past decades.
 */
import type { SectorStrategy } from "../sectorStrategies";
import { isDecadeReached } from "./decades";
import { autoGrantedNodeIds, getUnlockedStrategyIds, type TechCorpView } from "./selectors";
import { getOperatingSectorType } from "../sectorStrategies";
import { isBreakthroughReached } from "./breakthrough";
import { isStrategySunset } from "./sunset";
import {
  countryDiffusionContext,
  strategyOpenYear,
  type DiffusionAdopter,
  type TechDiffusionSnapshot,
} from "./diffusion";

export interface StrategyAvailability {
  locked: boolean;
  /**
   * Why it's locked: the world hasn't reached the era, the corp hasn't
   * unlocked it, the sector's world research has not reached the method's
   * breakthrough threshold, the method has been retired (sunset), or the
   * method has not yet reached the corporation's country (diffusion).
   */
  reason?: "era" | "tech" | "research" | "sunset" | "diffusion";
  /** For a diffusion lock: the first year the method opens in the country. */
  opensYear?: number;
}

/** Country access for one company (see ./diffusion). */
export interface StrategyDiffusionWorld {
  snapshot: TechDiffusionSnapshot;
  countryId: string;
  adopter: DiffusionAdopter;
}

export interface StrategyAvailabilityWorld {
  /**
   * Cumulative world frontier research in the strategy's sector (see
   * ./breakthrough). Absent keeps every method with a research threshold
   * closed.
   */
  sectorResearch?: number;
  /**
   * Country access for worlds with technology diffusion. Absent keeps the
   * calendar-only gate: the method opens everywhere on its tier year.
   */
  diffusion?: StrategyDiffusionWorld;
}

/**
 * Whether `strategy` is available to `corp` at `currentYear`. When
 * `techTreesEnabled` is false, everything is available (no gating).
 */
export function getStrategyAvailability(
  corp: TechCorpView,
  strategy: Pick<
    SectorStrategy,
    "id" | "minDecade" | "requiresTechUnlock" | "researchThreshold" | "sunsetDecade"
  >,
  currentYear: number,
  techTreesEnabled: boolean,
  world: StrategyAvailabilityWorld = {}
): StrategyAvailability {
  if (!techTreesEnabled) return { locked: false };
  if (isStrategySunset(strategy, currentYear)) {
    return { locked: true, reason: "sunset" };
  }
  if (strategy.minDecade && !isDecadeReached(strategy.minDecade, currentYear)) {
    return { locked: true, reason: "era" };
  }
  if (world.diffusion) {
    const country = countryDiffusionContext(
      world.diffusion.snapshot,
      world.diffusion.countryId,
      world.diffusion.adopter,
      strategy.id
    );
    const opensYear = country ? strategyOpenYear(strategy, country) : undefined;
    if (opensYear !== undefined && currentYear < opensYear) {
      return { locked: true, reason: "diffusion", opensYear };
    }
  }
  if (strategy.requiresTechUnlock) {
    // Merge DB-stored nodes with auto-granted past-decade nodes so that:
    // (a) corps founded before tech trees (empty unlockedTechNodeIds) and
    // (b) late-era corps who never saw past decades in their research UI
    // both inherit the sector unlocks those decades carry.
    const techType = getOperatingSectorType(
      corp.type,
      corp.industryModel,
      corp.mediaDiscriminator
    ) as TechCorpView["type"];
    const autoGranted = autoGrantedNodeIds(techType, currentYear);
    const effectiveView: TechCorpView = {
      ...corp,
      unlockedTechNodeIds: [...(corp.unlockedTechNodeIds ?? []), ...autoGranted],
    };
    if (!getUnlockedStrategyIds(effectiveView).includes(strategy.id)) {
      return { locked: true, reason: "tech" };
    }
  }
  if (!isBreakthroughReached(strategy, world.sectorResearch)) {
    return { locked: true, reason: "research" };
  }
  return { locked: false };
}

/**
 * True when the method carries no tech gate at all: no era, unlock,
 * breakthrough threshold or sunset. Automated pickers that do not run the
 * per-corporation availability check (the extraction autopilot, seed
 * placement) choose only from these, so a gated method never reaches a site
 * by the back door.
 */
export function isUngatedStrategy(
  strategy: Pick<
    SectorStrategy,
    "minDecade" | "requiresTechUnlock" | "researchThreshold" | "sunsetDecade"
  >
): boolean {
  return (
    !strategy.minDecade &&
    !strategy.requiresTechUnlock &&
    strategy.researchThreshold == null &&
    !strategy.sunsetDecade
  );
}
