/**
 * World frontier research per operating lane: the sum of every corporation's
 * `frontierResearchSpent` in that lane. Feeds the breakthrough gate on the
 * 2049 production methods (lib/constants/techTree/breakthrough).
 *
 * One aggregate per call. Command and query paths call it once for the lane
 * they are pricing; the NPP turn phases read every lane at once with
 * `loadFrontierResearchByLane`.
 */
import type { Db } from "mongodb";
import { operatingSectorIdentity, type OperatingSectorType } from "@/lib/constants/corporations";
import { countsAsFrontierResearch } from "@/lib/constants/techTree/breakthrough";
import { getOperatingSectorType, SECTOR_STRATEGIES } from "@/lib/constants/sectorStrategies";
import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

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
  const rows = await corporationsCollection(db)
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
 * World research for every lane that a method of `strategies` lists in
 * `requiresLaneResearch`, or undefined when trees are off or none do.
 */
export async function loadPrerequisiteLaneResearch(
  db: Db,
  strategies: readonly Pick<SectorStrategy, "requiresLaneResearch">[],
  techTreesEnabled: boolean
): Promise<ReadonlyMap<string, number> | undefined> {
  if (!techTreesEnabled) return undefined;
  const lanes = new Set<string>();
  for (const strategy of strategies) {
    for (const req of strategy.requiresLaneResearch ?? []) lanes.add(req.lane);
  }
  if (lanes.size === 0) return undefined;
  const entries = await Promise.all(
    [...lanes].map(
      async (lane) =>
        [lane, await loadSectorFrontierResearch(db, lane as OperatingSectorType)] as const
    )
  );
  return new Map(entries);
}

/** One grouped corporation identity and its summed frontier research. */
export interface FrontierResearchIdentityRow {
  type?: string | null;
  industryModel?: string | null;
  mediaDiscriminator?: string | null;
  total?: number | null;
}

/**
 * Folds grouped identity rows into per-lane totals. A row counts toward a lane
 * only when its identity is exactly that lane's (the `laneCorporationFilter`
 * match), so the totals equal what `loadSectorFrontierResearch` returns.
 */
export function frontierResearchByLane(
  rows: readonly FrontierResearchIdentityRow[]
): Map<OperatingSectorType, number> {
  const byLane = new Map<OperatingSectorType, number>();
  for (const row of rows) {
    if (typeof row.type !== "string") continue;
    const total = row.total;
    if (typeof total !== "number" || !Number.isFinite(total) || total <= 0) continue;
    const lane = getOperatingSectorType(
      row.type,
      row.industryModel ?? null,
      row.mediaDiscriminator ?? null
    ) as OperatingSectorType;
    const identity = operatingSectorIdentity(lane);
    if (
      identity.sectorType !== row.type ||
      (identity.industryModel ?? null) !== (row.industryModel ?? null) ||
      (identity.mediaDiscriminator ?? null) !== (row.mediaDiscriminator ?? null)
    ) {
      continue;
    }
    byLane.set(lane, (byLane.get(lane) ?? 0) + total);
  }
  return byLane;
}

/**
 * Every lane's world frontier research in one aggregate, for the turn's NPP
 * retooling and founding. Undefined when tech trees are off, which keeps every
 * breakthrough method closed exactly as an unknown total does.
 */
export async function loadFrontierResearchByLane(
  db: Db,
  techTreesEnabled: boolean
): Promise<ReadonlyMap<OperatingSectorType, number> | undefined> {
  if (!techTreesEnabled) return undefined;
  const rows = await corporationsCollection(db)
    .aggregate<FrontierResearchIdentityRow>([
      { $match: { frontierResearchSpent: { $gt: 0 } } },
      {
        $group: {
          _id: {
            type: "$type",
            industryModel: "$industryModel",
            mediaDiscriminator: "$mediaDiscriminator",
          },
          total: { $sum: "$frontierResearchSpent" },
        },
      },
      {
        $project: {
          _id: 0,
          type: "$_id.type",
          industryModel: "$_id.industryModel",
          mediaDiscriminator: "$_id.mediaDiscriminator",
          total: 1,
        },
      },
    ])
    .toArray();
  return frontierResearchByLane(rows);
}

/**
 * `$inc` fragment that records a tech unlock's rdScore as frontier research
 * when the node belongs to a frontier tier. Empty for older tiers.
 */
export function frontierResearchInc(decadeId: string, rdCost: number): Record<string, number> {
  if (!countsAsFrontierResearch(decadeId) || !(rdCost > 0)) return {};
  return { frontierResearchSpent: rdCost };
}
