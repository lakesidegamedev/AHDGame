import { STRATEGY_TRANSITION_TURNS } from "@/lib/constants/sectorStrategyTypes";
import { METHOD_BUILD_PROFILES } from "@/lib/constants/methodBuildProfiles";
import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";

/** Copies a strategy with its build time and downside filled in when it has a profile. */
export function withMethodBuildProfile(strategy: SectorStrategy): SectorStrategy {
  const profile = METHOD_BUILD_PROFILES[strategy.id];
  return profile
    ? { ...strategy, buildTurns: profile.buildTurns, downside: profile.downside }
    : strategy;
}

/** Extra retool fee fraction for adopting `strategy`; zero for methods without a downside. */
export function methodAdoptionSurchargeFraction(strategy: Pick<SectorStrategy, "id">): number {
  return METHOD_BUILD_PROFILES[strategy.id]?.adoptionSurchargeFraction ?? 0;
}

/**
 * Turns the sector keeps running its old method before the normal phase-in
 * starts, so the new method is fully online `buildTurns` after adoption.
 * Methods that build faster than the phase-in have no extra wait.
 */
export function methodBuildDelayTurns(strategy: Pick<SectorStrategy, "buildTurns">): number {
  const build = strategy.buildTurns ?? 0;
  return Math.max(0, Math.floor(build) - STRATEGY_TRANSITION_TURNS);
}

/**
 * Value stored as `transitionStartTurn`. A start in the future leaves the
 * sector on its old method (progress clamps to zero) until the build is done,
 * then the usual phase-in runs. A negative `headstart` backdates the start.
 */
export function methodTransitionStartTurn(args: {
  currentTurn: number;
  strategy: Pick<SectorStrategy, "buildTurns">;
  headstart: number;
}): number {
  return args.currentTurn - args.headstart + methodBuildDelayTurns(args.strategy);
}

/** True while a sector is still waiting for its new method to be built. */
export function isAwaitingBuild(args: {
  currentTurn: number;
  transitionStartTurn?: number | null;
}): boolean {
  return args.transitionStartTurn != null && args.currentTurn < args.transitionStartTurn;
}

/** The fields of a sector that say which method it runs. */
export interface SectorMethodState {
  strategyId?: string | null;
  transitionFromStrategyId?: string | null;
  transitionStartTurn?: number | null;
}

/**
 * The method a sector actually runs this turn. While the new method is still
 * being built the sector runs its old one, so crews, levies and other
 * per-method effects follow the old method until the build is done.
 */
export function operatingMethodId(
  sector: SectorMethodState,
  currentTurn: number
): string | null | undefined {
  const { transitionFromStrategyId, transitionStartTurn } = sector;
  return transitionFromStrategyId && isAwaitingBuild({ currentTurn, transitionStartTurn })
    ? transitionFromStrategyId
    : sector.strategyId;
}
