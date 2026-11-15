/**
 * Market buckets without stored market cells.
 *
 * A bucket is one (region, operating lane) pair. Candidate markets are every
 * region of a country crossed with every lane, so founding and "new market"
 * lists need no per-region documents: the goods market decides whether a
 * bucket is worth entering.
 */
import {
  OPERATING_SECTOR_TYPES,
  operatingSectorIdentity,
  type OperatingSectorType,
} from "@/lib/constants/corporationsClient";

/**
 * `(stateId:sectorType)` key for a market bucket, with the lane discriminators
 * appended when present. Every guard that asks "is this the same bucket" uses it.
 */
export function bucketKey(
  stateId: string,
  sectorType: string,
  industryModel?: string | null,
  mediaDiscriminator?: string | null
): string {
  if (mediaDiscriminator) {
    return `${stateId}:${sectorType}:${industryModel ?? "generic"}:${mediaDiscriminator}`;
  }
  return industryModel ? `${stateId}:${sectorType}:${industryModel}` : `${stateId}:${sectorType}`;
}

export interface LaneIdentity {
  lane: OperatingSectorType;
  sectorType: ReturnType<typeof operatingSectorIdentity>["sectorType"];
  industryModel: ReturnType<typeof operatingSectorIdentity>["industryModel"];
  mediaDiscriminator: ReturnType<typeof operatingSectorIdentity>["mediaDiscriminator"];
}

export interface MarketBucket extends LaneIdentity {
  stateId: string;
  key: string;
}

/** Every operating lane with its stored identity, in canonical lane order. */
export function laneIdentities(): LaneIdentity[] {
  return OPERATING_SECTOR_TYPES.map((lane) => ({ lane, ...operatingSectorIdentity(lane) }));
}

/**
 * Every (region, lane) bucket for the given regions, minus `blockedKeys`
 * (buckets the caller already occupies or a state controls). Pure.
 */
export function enumerateCandidateBuckets(
  stateIds: readonly string[],
  blockedKeys: ReadonlySet<string> = new Set(),
  lanes: readonly LaneIdentity[] = laneIdentities()
): MarketBucket[] {
  const out: MarketBucket[] = [];
  for (const stateId of stateIds) {
    for (const id of lanes) {
      const key = bucketKey(stateId, id.sectorType, id.industryModel, id.mediaDiscriminator);
      if (!blockedKeys.has(key)) out.push({ ...id, stateId, key });
    }
  }
  return out;
}
