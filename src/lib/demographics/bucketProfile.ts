import { deriveGranularElectorateUnits } from "./granularElectorate";
import { getTurnoutTargetsForCountry } from "./turnoutTargets";
import type { StateDemographicTurnout } from "@/lib/db/types/stateDemographicTurnout";
import type { Layer1PositionOverlay, Layer1TurnoutOverlay } from "@/lib/db/types/demographics";
import type { EraYearContext } from "./granularElectorate";
import type { LegislativePriorities } from "./legislativePriorities/rules";

/**
 * Per-bucket view of a region's electorate, for the demographics tab.
 *
 * Every number here comes off the same Layer-1 units the vote path counts,
 * using each unit's own `bucketWeights`, so the tab and the engine cannot
 * disagree.
 */

export interface BucketRow {
  id: string;
  label: string;
  /** Percent of the region's electorate, 0-100. Sums to 100 within a dimension. */
  sharePct: number;
  economicLean: number;
  socialLean: number;
  /** Turnout rate for this bucket, 0-100. */
  turnout: number;
  /** Display-only requests, attached by the region page rather than the vote path. */
  legislativePriorities?: LegislativePriorities | null;
}

export interface BucketProfileSection {
  dim: string;
  dimLabel: string;
  buckets: BucketRow[];
}

/**
 * Bucket profile for one region, or null when the region has no Layer-1
 * substrate (callers keep whatever fallback they already render).
 */
export function getBucketProfileForRegion(
  countryId: string,
  stateId: string,
  preset: string | undefined,
  turnoutDoc?: StateDemographicTurnout | null,
  yearCtx?: EraYearContext,
  positionOverlay?: Layer1PositionOverlay | null,
  turnoutOverlay?: Layer1TurnoutOverlay | null
): BucketProfileSection[] | null {
  const derived = deriveGranularElectorateUnits(
    countryId,
    stateId,
    preset,
    turnoutDoc,
    positionOverlay,
    turnoutOverlay,
    yearCtx
  );
  if (!derived || derived.units.length === 0) return null;

  // Accumulate share-weighted sums per bucket, then normalise. Weighting by
  // `share * bucketWeight` rather than by unit count is what keeps a bucket's
  // lean equal to the lean the engine gives those same voters.
  const acc = new Map<string, { w: number; econ: number; soc: number; turnout: number }>();
  for (const unit of derived.units) {
    for (const [bucketId, weight] of Object.entries(unit.bucketWeights)) {
      if (!weight) continue;
      const w = unit.share * weight;
      const cur = acc.get(bucketId) ?? { w: 0, econ: 0, soc: 0, turnout: 0 };
      cur.w += w;
      cur.econ += w * unit.economicLean;
      cur.soc += w * unit.socialLean;
      cur.turnout += w * unit.turnout;
      acc.set(bucketId, cur);
    }
  }
  if (acc.size === 0) return null;

  // Ordered and labelled by the same source the targeting picker uses, so a
  // player sees one bucket vocabulary across the whole interface.
  const sections = getTurnoutTargetsForCountry(countryId, preset)
    .map((section) => {
      const present = section.options.filter((o) => (acc.get(o.id)?.w ?? 0) > 0);
      const dimTotal = present.reduce((s, o) => s + (acc.get(o.id)?.w ?? 0), 0);
      if (dimTotal <= 0) return null;
      return {
        dim: section.dim,
        dimLabel: section.dimLabel,
        buckets: present.map((o) => {
          const a = acc.get(o.id)!;
          return {
            id: o.id,
            label: o.label,
            sharePct: (a.w / dimTotal) * 100,
            economicLean: a.econ / a.w,
            socialLean: a.soc / a.w,
            turnout: a.turnout / a.w,
          };
        }),
      };
    })
    .filter((s): s is BucketProfileSection => s !== null);

  return sections.length > 0 ? sections : null;
}

/**
 * Turnout-weighted mean lean of a region, read off one dimension's buckets
 * (every dimension partitions the same electorate). Zeros when the profile
 * has no voters.
 */
export function bucketProfileLean(sections: readonly BucketProfileSection[]): {
  economicLean: number;
  socialLean: number;
} {
  const section = sections[0];
  if (!section) return { economicLean: 0, socialLean: 0 };
  let w = 0;
  let econ = 0;
  let soc = 0;
  for (const b of section.buckets) {
    const voters = b.sharePct * b.turnout;
    w += voters;
    econ += voters * b.economicLean;
    soc += voters * b.socialLean;
  }
  return w > 0
    ? { economicLean: econ / w, socialLean: soc / w }
    : { economicLean: 0, socialLean: 0 };
}
