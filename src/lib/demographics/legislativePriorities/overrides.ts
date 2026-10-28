/**
 * Admin-edited electorate legislative priorities. loadProfileLegislativePriorities
 * reads requests for one region and group, falling back to authored defaults
 * when a saved law or level is unavailable. getPriorityEditorData supplies the law picker.
 */
import type { Db } from "mongodb";
import type { LegislationType } from "@/lib/db/types/legislation";
import { getElectoratePriorityOverridesCollection } from "@/lib/db/collections/electoratePriorityOverrides";
import type { BucketProfileSection } from "../bucketProfile";
import { getDefaultLegislativePriorities, withLegislativePriorities } from "./profile";
import {
  isPriorityTarget,
  parsePrioritySelection,
  resolvePrioritySelection,
  type PriorityLaw,
} from "./rules";
import type { PriorityTarget } from "./schema";

export function priorityOverrideId({ countryId, regionId, bucketId }: PriorityTarget): string {
  return `${countryId}:${regionId}:${bucketId}`;
}

/** Project just the names and exact levels needed for the editor or saved display. */
export async function loadPriorityLaws(
  db: Db,
  countryId: string,
  ids?: string[]
): Promise<PriorityLaw[]> {
  const countryScope = countryId.toLowerCase();
  if (countryScope !== "us" && countryScope !== "uk" && countryScope !== "jp") return [];
  const laws = await db
    .collection<LegislationType>("legislationTypes")
    .find(
      { countryScope, ...(ids ? { _id: { $in: ids } } : {}) },
      {
        projection: {
          _id: 1,
          name: 1,
          countryScope: 1,
          "policyOptions.id": 1,
          "policyOptions.name": 1,
        },
      }
    )
    .toArray();
  return laws
    .filter((law) => law.policyOptions?.length)
    .map((law) => ({
      _id: law._id,
      name: law.name,
      countryScope: law.countryScope,
      policyOptions: (law.policyOptions ?? []).map(({ id, name }) => ({ id, name })),
    }));
}

export async function getPriorityEditorData(db: Db, target: PriorityTarget) {
  const collection = await getElectoratePriorityOverridesCollection(db);
  const [override, laws] = await Promise.all([
    collection.findOne({ _id: priorityOverrideId(target) }),
    loadPriorityLaws(db, target.countryId),
  ]);
  const defaults = getDefaultLegislativePriorities(
    target.countryId,
    target.regionId,
    target.bucketId
  )!;
  const saved = override
    ? resolvePrioritySelection(
        target.countryId,
        override.priorities,
        new Map(laws.map((law) => [law._id, law]))
      )
    : null;
  return {
    priorities: saved ?? defaults,
    defaults,
    laws,
    isOverride: Boolean(override),
    invalidOverride: Boolean(override && !saved),
  };
}

/** One bounded primary-key read per region; a second catalog read only when overrides exist. */
export async function loadProfileLegislativePriorities(
  db: Db,
  profile: BucketProfileSection[] | null,
  countryId: string,
  regionId: string
): Promise<BucketProfileSection[] | null> {
  const enriched = withLegislativePriorities(profile, countryId, regionId);
  if (!enriched) return null;
  const ids = enriched.flatMap((section) =>
    section.buckets
      .filter((bucket) => isPriorityTarget(countryId, regionId, bucket.id))
      .map((bucket) => `${countryId}:${regionId}:${bucket.id}`)
  );
  if (!ids.length) return enriched;
  const collection = await getElectoratePriorityOverridesCollection(db);
  const overrides = await collection
    .find({ _id: { $in: ids } }, { projection: { _id: 1, priorities: 1 } })
    .toArray();
  if (!overrides.length) return enriched;
  const requestedIds = new Set(ids);
  const validOverrides = overrides.flatMap((override) => {
    const priorities = parsePrioritySelection(override.priorities);
    return priorities && requestedIds.has(override._id) ? [{ _id: override._id, priorities }] : [];
  });
  if (!validOverrides.length) return enriched;
  const lawIds = [
    ...new Set(
      validOverrides.flatMap((o) =>
        [o.priorities.primary, ...o.priorities.secondary].map((p) => p.lawTypeId)
      )
    ),
  ];
  const laws = new Map(
    (await loadPriorityLaws(db, countryId, lawIds)).map((law) => [law._id, law])
  );
  const saved = new Map(validOverrides.map((o) => [o._id, o.priorities]));
  return enriched.map((section) => ({
    ...section,
    buckets: section.buckets.map((bucket) => {
      const override = saved.get(`${countryId}:${regionId}:${bucket.id}`);
      return {
        ...bucket,
        legislativePriorities:
          (override ? resolvePrioritySelection(countryId, override, laws) : null) ??
          bucket.legislativePriorities,
      };
    }),
  }));
}
