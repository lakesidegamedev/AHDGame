/**
 * World frontier research per operating lane: the sum of every corporation's
 * `frontierResearchSpent` in that lane. Feeds the breakthrough gate on the
 * 2049 production methods (lib/constants/techTree/breakthrough).
 *
 * One aggregate per call. Command and query paths call it once for the lane
 * they are pricing; the turn does not read it.
 */
import type { Db } from "mongodb";
import { operatingSectorIdentity, type OperatingSectorType } from "@/lib/constants/corporations";
import type { Corporation } from "@/lib/db/types";
import { countsAsFrontierResearch } from "@/lib/constants/techTree/breakthrough";
import { SECTOR_STRATEGIES } from "@/lib/constants/sectorStrategies";

/** Mongo filter for the corporations whose tech tree is this lane's. */
export function laneCorporationFilter(lane: OperatingSectorType): Record<string, unknown> {
  const identity = operatingSectorIdentity(lane);
  // null matches an absent field, so a plain lane excludes the folded ones.
  return {
    type: identity.sectorType,
    industryModel: identity.industryModel ?? null,
    mediaDiscriminator: identity.mediaDiscriminator ?? null,
  };
}

export async function loadSectorFrontierResearch(
  db: Db,
  lane: OperatingSectorType
): Promise<number> {
  const rows = await db
    .collection<Corporation>("corporations")
    .aggregate<{ total: number }>([
      { $match: { ...laneCorporationFilter(lane), frontierResearchSpent: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: "$frontierResearchSpent" } } },
    ])
    .toArray();
  const total = rows[0]?.total;
  return typeof total === "number" && Number.isFinite(total) ? total : 0;
}

/**
 * The lane's world research for breakthrough gating, or undefined when tech
 * trees are off or the lane has no method with a research threshold (the
 * aggregate is skipped).
 */
export async function loadLaneBreakthroughResearch(
  db: Db,
  lane: OperatingSectorType,
  techTreesEnabled: boolean
): Promise<number | undefined> {
  if (!techTreesEnabled) return undefined;
  const gated = (SECTOR_STRATEGIES[lane] ?? []).some((s) => s.researchThreshold != null);
  return gated ? loadSectorFrontierResearch(db, lane) : undefined;
}

/**
 * `$inc` fragment that records a tech unlock's rdScore as frontier research
 * when the node belongs to a frontier tier. Empty for older tiers.
 */
export function frontierResearchInc(decadeId: string, rdCost: number): Record<string, number> {
  if (!countsAsFrontierResearch(decadeId) || !(rdCost > 0)) return {};
  return { frontierResearchSpent: rdCost };
}
