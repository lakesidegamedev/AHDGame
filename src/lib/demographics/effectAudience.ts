import { bucketLabel } from "./bucketLabels";
import { isBucketTarget } from "./turnoutTarget";

/**
 * How to describe a policy's approval effects to the player.
 *
 * Impacts arrive keyed on buckets (`calculateShiftImpacts`); any other key is
 * ignored. The player reads the same groups the vote engine moves.
 *
 * Effects are described in the country's own bucket vocabulary and language, so
 * a German bill reads "Hochschulabschluss" and a Japanese one
 * "大学卒 (University)", the same words those players see in the demographics
 * tab and the targeting picker.
 */

export interface EffectAudienceRow {
  /** Stable key for React. */
  id: string;
  label: string;
  value: number;
}

/**
 * Approval effects as player-facing rows, largest magnitude first.
 */
export function describeApprovalEffects(
  approvals: Record<string, number>,
  billCountry: string | undefined
): EffectAudienceRow[] {
  const rows = Object.entries(approvals)
    .filter(([id]) => isBucketTarget(id))
    .map(([id, value]) => ({
      id,
      label: bucketLabel(id, billCountry),
      value,
    }));

  return rows
    .filter((r) => r.value !== 0 && Number.isFinite(r.value))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}
