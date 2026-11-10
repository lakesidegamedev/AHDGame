import { STRATEGY_TRANSITION_TURNS } from "@/lib/constants/sectorStrategyTypes";
import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";

/**
 * One-off bill, as a fraction of the sector's daily revenue, charged on top of
 * the normal retool fee when a company adopts the method. It is the priced form
 * of the method's written downside (licensing, trials, launch dependency).
 */
export const METHOD_ADOPTION_SURCHARGE_FRACTION: Readonly<Record<string, number>> = {
  fusion_commercial: 0.6,
  grid_storage_utility: 0.2,
  advanced_fission: 0.5,
  humanoid_robotics: 0.3,
  neural_interfaces: 0.35,
  agentic_services: 0.15,
  cellular_agriculture: 0.25,
  direct_air_capture: 0.3,
  gene_therapy_scale: 0.4,
  biofoundry: 0.3,
  personalised_media: 0.2,
  drone_swarm: 0.3,
  autonomous_districts: 0.4,
  printed_mass_timber: 0.2,
  orbital_logistics: 0.35,
  space_resources: 0.5,
};

/** Extra retool fee fraction for adopting `strategy`; zero for methods without a downside. */
export function methodAdoptionSurchargeFraction(strategy: Pick<SectorStrategy, "id">): number {
  return METHOD_ADOPTION_SURCHARGE_FRACTION[strategy.id] ?? 0;
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
  transitionStartTurn: number | null | undefined;
}): boolean {
  return args.transitionStartTurn != null && args.currentTurn < args.transitionStartTurn;
}
