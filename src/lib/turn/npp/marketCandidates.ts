/**
 * Candidate markets for NPP founding: every region of a country crossed with
 * every operating lane. No stored per-region documents; the goods market
 * (unmet demand, saturation, input fill) decides which candidates are worth
 * entering.
 */
import { enumerateCandidateBuckets, type MarketBucket } from "@/lib/market/marketBuckets";

/** A market bucket tagged with the country that owns its region. */
export interface MarketCandidate extends MarketBucket {
  countryId: string;
}

/** Region ids grouped by country, from a minimal region projection. */
export function indexStateIdsByCountry(
  states: readonly { _id: string; countryId: string }[]
): Map<string, string[]> {
  const byCountry = new Map<string, string[]>();
  for (const state of states) {
    const list = byCountry.get(state.countryId);
    if (list) list.push(state._id);
    else byCountry.set(state.countryId, [state._id]);
  }
  return byCountry;
}

/**
 * Candidate buckets per country, built once per turn and shared by the whole
 * cohort. Occupied and state-controlled buckets are filtered by the scan, not
 * here, so the exclusion counters stay observable.
 */
export function indexCandidateBuckets(
  stateIdsByCountry: ReadonlyMap<string, readonly string[]>
): Map<string, MarketCandidate[]> {
  const byCountry = new Map<string, MarketCandidate[]>();
  for (const [countryId, stateIds] of stateIdsByCountry) {
    byCountry.set(
      countryId,
      enumerateCandidateBuckets(stateIds).map((bucket) => ({ ...bucket, countryId }))
    );
  }
  return byCountry;
}
