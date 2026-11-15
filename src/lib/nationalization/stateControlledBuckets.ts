import type { Db } from "mongodb";
import type { CorporateSector } from "@/lib/db/types";
import { absorbOwnedSectorIntoNatCorp } from "./seedToNatCorp";
import {
  enactedLawAllowsCorpMerge,
  loadSectorWideTakingAuthority,
  sectorTakingKey,
  type EnactedSectorTaking,
} from "./enactedSectorTaking";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";

import { bucketKey } from "@/lib/market/marketBuckets";

/** The `_id` strings of every National Corporation (countryOwnerId set). Few rows. */
export async function loadNationalCorpIds(db: Db): Promise<Set<string>> {
  const natCorps = await corporationsCollection(db)
    .find({ countryOwnerId: { $exists: true } }, { projection: { _id: 1, countryOwnerId: 1 } })
    .toArray();
  return new Set(natCorps.filter((c) => c.countryOwnerId != null).map((c) => c._id.toString()));
}

/**
 * Buckets a National Corporation controls **via nationalization**, by revenue
 * majority. Protecting these keeps NPP auto-expansion from
 * slowly re-fragmenting a sector the state nationalized. Scoped to buckets where
 * the national corp holds at least one BILL-nationalized sector (`nationalizedAtTurn`
 * stamped), so seeded state monopolies (e.g. the NHS, which intentionally keeps a
 * private market) are NOT frozen. Revenue is compared raw (a nationalized bucket's
 * holders are overwhelmingly same-country, so currency is uniform); the check is a
 * coarse majority, not a precise market share.
 */
export function computeStateControlledBuckets(
  corpSectors: Pick<
    CorporateSector,
    "stateId" | "sectorType" | "revenue" | "corporationId" | "nationalizedAtTurn"
  >[],
  nationalCorpIds: ReadonlySet<string>
): Set<string> {
  const stateRev = new Map<string, number>();
  const otherRev = new Map<string, number>();
  const hasNationalized = new Set<string>();
  for (const s of corpSectors) {
    const key = bucketKey(s.stateId, s.sectorType);
    const rev = Number.isFinite(s.revenue) ? (s.revenue as number) : 0;
    if (nationalCorpIds.has(s.corporationId.toString())) {
      stateRev.set(key, (stateRev.get(key) ?? 0) + rev);
      if (s.nationalizedAtTurn != null) hasNationalized.add(key);
    } else {
      otherRev.set(key, (otherRev.get(key) ?? 0) + rev);
    }
  }
  const controlled = new Set<string>();
  for (const [key, sr] of stateRev) {
    if (sr > 0 && hasNationalized.has(key) && sr >= (otherRev.get(key) ?? 0)) controlled.add(key);
  }
  return controlled;
}

/**
 * Captured markets where non–national-corp corporate holdings are erroneous
 * (e.g. players split into a bill-nationalized bucket). Honors enacted
 * `sectorScope`: unowned-only laws never merge private corps; partial carves
 * leave the carved remainder legitimate. When no sector-wide law is on record,
 * only revenue-majority state control triggers a merge (legacy / single-sector).
 */
export function computeCapturedMarketMergeBuckets(
  corpSectors: Pick<
    CorporateSector,
    "stateId" | "sectorType" | "countryId" | "revenue" | "corporationId" | "nationalizedAtTurn"
  >[],
  nationalCorpIds: ReadonlySet<string>,
  enactedTakings: ReadonlyMap<string, EnactedSectorTaking> = new Map()
): Set<string> {
  const stateControlled = computeStateControlledBuckets(corpSectors, nationalCorpIds);
  const merge = new Set<string>();

  const countryByBucket = new Map<string, string>();
  const sectorTypeByBucket = new Map<string, string>();
  for (const s of corpSectors) {
    const key = bucketKey(s.stateId, s.sectorType);
    if (s.countryId) countryByBucket.set(key, s.countryId);
    sectorTypeByBucket.set(key, s.sectorType);
  }

  const hasNatNationalized = new Set<string>();
  const hasPrivate = new Set<string>();
  for (const s of corpSectors) {
    const key = bucketKey(s.stateId, s.sectorType);
    if (nationalCorpIds.has(s.corporationId.toString())) {
      if (s.nationalizedAtTurn != null) hasNatNationalized.add(key);
    } else {
      hasPrivate.add(key);
    }
  }

  for (const key of new Set([...stateControlled, ...hasNatNationalized])) {
    if (!hasPrivate.has(key)) continue;

    const countryId = countryByBucket.get(key);
    const sectorType = sectorTypeByBucket.get(key);
    const taking =
      countryId && sectorType
        ? enactedTakings.get(sectorTakingKey(countryId, sectorType))
        : undefined;

    if (enactedLawAllowsCorpMerge(taking)) {
      if (stateControlled.has(key) || hasNatNationalized.has(key)) merge.add(key);
      continue;
    }

    // No sector-wide corp authority on record — only merge when state holds majority.
    if (!taking && stateControlled.has(key)) merge.add(key);
  }

  return merge;
}

type CorpSectorBucketFields = Pick<
  CorporateSector,
  "stateId" | "sectorType" | "countryId" | "revenue" | "corporationId" | "nationalizedAtTurn"
>;

async function loadCorpSectorBucketFields(db: Db): Promise<CorpSectorBucketFields[]> {
  return corporateSectorsCollection(db)
    .find(
      {},
      {
        projection: {
          stateId: 1,
          sectorType: 1,
          countryId: 1,
          revenue: 1,
          corporationId: 1,
          nationalizedAtTurn: 1,
        },
      }
    )
    .toArray();
}

type OwnedSectorMergeFields = Pick<
  CorporateSector,
  | "_id"
  | "stateId"
  | "sectorType"
  | "countryId"
  | "revenue"
  | "workers"
  | "currentGrowthCost"
  | "corporationId"
>;

async function loadOwnedSectorMergeFields(db: Db): Promise<OwnedSectorMergeFields[]> {
  return corporateSectorsCollection(db)
    .find(
      {},
      {
        projection: {
          _id: 1,
          stateId: 1,
          sectorType: 1,
          countryId: 1,
          revenue: 1,
          workers: 1,
          currentGrowthCost: 1,
          corporationId: 1,
        },
      }
    )
    .toArray();
}

export interface HealCapturedMarketsResult {
  dryRun: boolean;
  ownedSectorsMergedCount: number;
  ownedRevenueMerged: number;
  sampleKeys: string[];
}

/** Fix captured markets: merge intruder corp sectors into the National Corporation. */
export async function healCapturedMarkets(
  db: Db,
  opts: { dryRun?: boolean } = {}
): Promise<HealCapturedMarketsResult> {
  const dryRun = opts.dryRun ?? false;
  const nationalCorpIds = await loadNationalCorpIds(db);
  const [corpSectors, enactedTakings, ownedSectors] = await Promise.all([
    loadCorpSectorBucketFields(db),
    loadSectorWideTakingAuthority(db, nationalCorpIds),
    loadOwnedSectorMergeFields(db),
  ]);

  const mergeBuckets = computeCapturedMarketMergeBuckets(
    corpSectors,
    nationalCorpIds,
    enactedTakings
  );

  const toMergeOwned = ownedSectors.filter(
    (s) =>
      mergeBuckets.has(bucketKey(s.stateId, s.sectorType)) &&
      !nationalCorpIds.has(s.corporationId.toString())
  );

  let ownedRevenueMerged = 0;

  if (!dryRun) {
    for (const sector of toMergeOwned) {
      ownedRevenueMerged += await absorbOwnedSectorIntoNatCorp(db, sector);
    }
  } else {
    ownedRevenueMerged = toMergeOwned.reduce(
      (sum, s) => sum + Math.max(0, Math.round(s.revenue ?? 0)),
      0
    );
  }

  const sampleKeys = [...toMergeOwned.map((s) => bucketKey(s.stateId, s.sectorType))].slice(0, 12);

  return {
    dryRun,
    ownedSectorsMergedCount: toMergeOwned.length,
    ownedRevenueMerged,
    sampleKeys,
  };
}
