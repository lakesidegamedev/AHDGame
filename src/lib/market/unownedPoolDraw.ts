/**
 * Unowned-pool drawdown and credit, shared so writers cannot drift apart.
 *
 * Under plants, market share is `owned / (owned + headroomUnits)`, so any
 * capacity increase must consume headroom or the same demand counts twice.
 * Callers add capacity and then draw the pool in the same pipeline.
 *
 * Invariants every caller inherits:
 *  - PLANTS ONLY. Below plants `headroomUnits` is not the leading leg and
 *    nothing reads units; callers gate on `plantsEnabled` and pass units.
 *  - UPSERT. A missing (state, type) pool doc is legitimate and created lazily;
 *    a bare update would silently match nothing and give the capacity free.
 *  - SELF-HEALING BASE. `unownedHeadroomBaseExpr` derives units from revenue
 *    for docs predating the backfill instead of defaulting to 0.
 *  - CLAMPED AT 0, and the trailing stage RESTATES `revenue` from post-write
 *    units. Two independently clamped legs diverge once either bottoms out.
 */

import type { CorporationType } from "@/lib/constants/corporations";
import type { MediaDiscriminator } from "@/lib/constants/corporations";
import { unownedHeadroomBaseExpr, unownedPoolTrailingSet } from "@/lib/market/unownedHeadroom";

/** Identity of one unowned-pool bucket, plus the scaffolding an upsert needs. */
export interface UnownedPoolBucket {
  stateId: string;
  countryId: string;
  sectorType: CorporationType;
  industryModel?: string | null;
  mediaDiscriminator?: MediaDiscriminator | null;
}

/**
 * The aggregation-pipeline stages that move a plants-tier pool bucket by
 * `deltaUnits` — negative to consume headroom, positive to return it.
 *
 * Returned as stages rather than executed so the caller keeps ownership of the
 * write (and of its CAS / idempotency concerns, which differ between founding,
 * building and restoring).
 */
export function unownedPoolDeltaPipeline(
  bucket: UnownedPoolBucket,
  deltaUnits: number,
  now: Date,
  eraUnitScale: number
): object[] {
  const { stateId, countryId, sectorType, industryModel, mediaDiscriminator } = bucket;
  return [
    {
      $set: {
        // Upsert scaffolding: an upserted doc otherwise materialises with only
        // the filter's fields, and a pool row with no countryId is invisible to
        // every country-scoped reader.
        stateId: { $ifNull: ["$stateId", stateId] },
        countryId: { $ifNull: ["$countryId", countryId] },
        sectorType: { $ifNull: ["$sectorType", sectorType] },
        industryModel: { $ifNull: ["$industryModel", industryModel ?? null] },
        mediaDiscriminator: { $ifNull: ["$mediaDiscriminator", mediaDiscriminator ?? null] },
        createdAt: { $ifNull: ["$createdAt", now] },
        headroomUnits: {
          $max: [
            0,
            {
              $add: [
                unownedHeadroomBaseExpr(
                  sectorType,
                  eraUnitScale,
                  industryModel,
                  mediaDiscriminator
                ),
                deltaUnits,
              ],
            },
          ],
        },
        updatedAt: now,
      },
    },
    // Own stage: it must read the POST-write units, which are only visible to a
    // later stage.
    {
      $set: unownedPoolTrailingSet(
        sectorType,
        true,
        eraUnitScale,
        industryModel,
        mediaDiscriminator
      ),
    },
  ];
}

/**
 * Consume `units` of headroom because a corp claimed that much of the market.
 * A non-positive or non-finite `units` yields `null`, meaning "no write" — the
 * caller skips the round trip rather than issuing a no-op upsert that would
 * still create an empty bucket.
 */
export function unownedPoolDrawdown(
  bucket: UnownedPoolBucket,
  units: number,
  now: Date,
  eraUnitScale: number
): object[] | null {
  if (!Number.isFinite(units) || units <= 0) return null;
  return unownedPoolDeltaPipeline(bucket, -units, now, eraUnitScale);
}

/**
 * Return `units` of headroom to the market because a claim was undone (a
 * cancelled build's not-yet-delivered remainder).
 */
export function unownedPoolCredit(
  bucket: UnownedPoolBucket,
  units: number,
  now: Date,
  eraUnitScale: number
): object[] | null {
  if (!Number.isFinite(units) || units <= 0) return null;
  return unownedPoolDeltaPipeline(bucket, units, now, eraUnitScale);
}
