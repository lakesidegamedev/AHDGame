/**
 * Converts the lean drift older builds kept on a region's voter group rows
 * into the census bucket overlay this build reads.
 *
 * Older builds stored drift as `groups[id].<axis>` on the live
 * `stateDemographics` doc and read it as live minus the seeded
 * `demographicDefaults` row, projected onto census buckets by a fixed weight
 * table and folded onto unit leans together with `layer1PositionOverrides`.
 * This build folds only the overlay, so the same projection is added to it
 * once and each group row is set back to its seeded value. Both builds then
 * read the same electorate from the converted document.
 */
import { isBucketTarget } from "../turnoutTarget";
import type { Layer1PositionOverlay } from "@/lib/db/types/demographics";

export interface GroupBucketWeight {
  dim: string;
  key: string;
  w: number;
}

/** Voter group id to census bucket weights; each group's weights sum to 1. */
export type GroupBucketTable = Readonly<Record<string, readonly GroupBucketWeight[]>>;

const AXES = ["economicLean", "socialLean"] as const;
type Axis = (typeof AXES)[number];

const LEAN_MIN = -5;
const LEAN_MAX = 5;

interface GroupRow {
  economicLean?: unknown;
  socialLean?: unknown;
}

export interface GroupDriftDoc {
  groups?: Record<string, GroupRow> | null;
  layer1PositionOverrides?: Layer1PositionOverlay | null;
}

export interface GroupDriftConversion {
  /** Fields to `$set` on the live doc; empty when there is no drift. */
  set: Record<string, unknown>;
  /** Group ids whose drift had no bucket mapping and was dropped, as the older read did. */
  unmapped: string[];
}

/**
 * Spread group-keyed values over census buckets. A key that is already a
 * bucket passes through at full weight; a group missing from the table
 * contributes nothing and is reported.
 */
export function projectGroupValues(
  values: Readonly<Record<string, number>>,
  table: GroupBucketTable
): { buckets: Record<string, number>; unmapped: string[] } {
  const buckets: Record<string, number> = {};
  const unmapped: string[] = [];
  for (const [id, value] of Object.entries(values)) {
    if (!Number.isFinite(value) || value === 0) continue;
    if (isBucketTarget(id)) {
      buckets[id] = (buckets[id] ?? 0) + value;
      continue;
    }
    const weights = Object.hasOwn(table, id) ? table[id] : undefined;
    if (!weights) {
      unmapped.push(id);
      continue;
    }
    for (const { dim, key, w } of weights) {
      const bucket = `${dim}:${key}`;
      buckets[bucket] = (buckets[bucket] ?? 0) + value * w;
    }
  }
  return { buckets, unmapped };
}

function isRecord<T>(value: T): value is NonNullable<T> & object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lean(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

/** A key Mongo can address inside a dotted update path. */
function addressable(key: string): boolean {
  return key.length > 0 && !key.includes(".") && !key.startsWith("$");
}

/**
 * The single write that carries one region's group drift onto its overlay.
 * Running it on an already converted document finds no drift and returns an
 * empty `set`, so a repeated pass is a no-op.
 */
export function convertGroupDrift(
  live: GroupDriftDoc,
  defaults: GroupDriftDoc | null | undefined,
  table: GroupBucketTable
): GroupDriftConversion {
  const set: Record<string, number> = {};
  const unmapped = new Set<string>();
  const liveGroups = live.groups ?? {};
  const seeded = defaults?.groups ?? null;
  if (!seeded) return { set, unmapped: [] };

  const drift: Record<Axis, Record<string, number>> = { economicLean: {}, socialLean: {} };
  for (const [groupId, row] of Object.entries(liveGroups)) {
    if (!addressable(groupId) || !isRecord(row) || !Object.hasOwn(seeded, groupId)) continue;
    const base = seeded[groupId] ?? {};
    for (const axis of AXES) {
      const delta = lean(row?.[axis]) - lean(base[axis]);
      if (!Number.isFinite(delta) || delta === 0) continue;
      drift[axis][groupId] = delta;
      set[`groups.${groupId}.${axis}`] = lean(base[axis]);
    }
  }

  const stored = live.layer1PositionOverrides;
  const overlay: Layer1PositionOverlay = isRecord(stored) ? structuredClone(stored) : {};
  const touched = new Set<string>();
  for (const axis of AXES) {
    const projected = projectGroupValues(drift[axis], table);
    for (const id of projected.unmapped) unmapped.add(id);
    for (const [bucketKey, delta] of Object.entries(projected.buckets)) {
      const sep = bucketKey.indexOf(":");
      const dim = bucketKey.slice(0, sep);
      const bucket = bucketKey.slice(sep + 1);
      if (!addressable(dim) || !addressable(bucket)) continue;
      const byBucket = isRecord(overlay[dim]) ? overlay[dim] : (overlay[dim] = {});
      const entry = isRecord(byBucket[bucket])
        ? byBucket[bucket]
        : (byBucket[bucket] = { economicLean: 0, socialLean: 0 });
      const current = lean(entry[axis]);
      const next = Math.min(LEAN_MAX, Math.max(LEAN_MIN, current + delta));
      if (next === current) continue;
      entry[axis] = next;
      touched.add(`${dim}\u0000${bucket}\u0000${axis}`);
    }
  }

  // Mongo cannot set a path inside null, so a null or malformed level is written whole.
  const result: Record<string, unknown> = { ...set };
  for (const key of touched) {
    const [dim, bucket, axis] = key.split("\u0000") as [string, string, Axis];
    if (stored !== undefined && !isRecord(stored)) {
      result.layer1PositionOverrides = overlay;
    } else if (stored?.[dim] !== undefined && !isRecord(stored[dim])) {
      result[`layer1PositionOverrides.${dim}`] = overlay[dim];
    } else if (stored?.[dim]?.[bucket] !== undefined && !isRecord(stored[dim][bucket])) {
      result[`layer1PositionOverrides.${dim}.${bucket}`] = overlay[dim][bucket];
    } else {
      result[`layer1PositionOverrides.${dim}.${bucket}.${axis}`] = overlay[dim][bucket][axis];
    }
  }
  return { set: result, unmapped: [...unmapped].sort() };
}
