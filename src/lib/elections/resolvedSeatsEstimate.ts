/**
 * Chooses between the allocation a resolved election actually seated and the
 * live projection recomputed from the current tally.
 *
 * `generalResolution` persists the authoritative allocation to the tally's
 * root `seatsEstimate` alongside `finalized: true`, so once that flag is set
 * the persisted value is the only honest answer; otherwise the page recomputes
 * and shows a result that drifts with the allocator's inputs.
 *
 * `finalized` is the gate, NOT "is the race past its end time".
 * `accumulateVoteTurn` rewrites the same root `seatsEstimate` every turn of
 * the count, so before resolution it holds a mid-count projection. A race past
 * `endTime` but not yet resolved must keep projecting.
 */

/** The two tally fields this decision reads. */
export interface SeatsEstimateSource {
  finalized?: boolean;
  seatsEstimate?: Record<string, number>;
}

export function resolvedSeatsEstimate(
  tally: SeatsEstimateSource | null | undefined,
  computed: Record<string, number> | null
): Record<string, number> | null {
  const persisted = tally?.finalized === true ? tally.seatsEstimate : undefined;
  // An empty map is not an allocation — older tallies and races that resolved
  // with no eligible candidates carry `{}`, and those still want the projection.
  if (persisted && Object.keys(persisted).length > 0) return { ...persisted };
  return computed;
}
