/**
 * Breakthrough gating for speculative production methods.
 *
 * The 2049 methods open on the calendar AND on research: the world's corporations in the method's sector must together have spent `researchThreshold` rdScore on frontier research before anyone may build it. A sector that researches hard gets its breakthrough at the start of the tier; one that does not gets it late or never.
 *
 * Frontier research is rdScore spent on nodes of the FRONTIER_RESEARCH_FROM tier onward, plus frontier programmes. Each corporation carries its own running total (`frontierResearchSpent`); the world figure is the sum over the sector's corporations.
 */
import type { SectorStrategy } from "../sectorStrategyTypes";
import { getDecadeById } from "./decades";

/** First tier whose research counts toward breakthroughs. */
export const FRONTIER_RESEARCH_FROM_DECADE = "2039";

/** True when research on a node of `decadeId` counts as frontier research. */
export function countsAsFrontierResearch(decadeId: string): boolean {
  const decade = getDecadeById(decadeId);
  const from = getDecadeById(FRONTIER_RESEARCH_FROM_DECADE);
  return decade != null && from != null && decade.startYear >= from.startYear;
}

/**
 * Whether the method's research threshold is met. A method with no threshold
 * is always met. An unknown world total (`sectorResearch` undefined) never
 * meets one: callers that cannot load the total keep the method closed.
 */
export function isBreakthroughReached(
  strategy: Pick<SectorStrategy, "researchThreshold">,
  sectorResearch: number | undefined
): boolean {
  const threshold = strategy.researchThreshold;
  if (threshold == null || threshold <= 0) return true;
  return typeof sectorResearch === "number" && sectorResearch >= threshold;
}

/**
 * Whether every cross-sector prerequisite is met. A lane missing from the map
 * counts as no research, so callers that cannot load the totals keep the
 * method closed.
 */
export function arePrerequisiteLanesReached(
  strategy: Pick<SectorStrategy, "requiresLaneResearch">,
  laneResearch: ReadonlyMap<string, number> | undefined
): boolean {
  const required = strategy.requiresLaneResearch;
  if (!required || required.length === 0) return true;
  return required.every((req) => (laneResearch?.get(req.lane) ?? 0) >= req.threshold);
}

/** Share of the threshold reached, 0 to 1, for progress display. 1 with no threshold. */
export function breakthroughProgress(
  strategy: Pick<SectorStrategy, "researchThreshold">,
  sectorResearch: number | undefined
): number {
  const threshold = strategy.researchThreshold;
  if (threshold == null || threshold <= 0) return 1;
  const total = typeof sectorResearch === "number" && sectorResearch > 0 ? sectorResearch : 0;
  return Math.min(1, total / threshold);
}
