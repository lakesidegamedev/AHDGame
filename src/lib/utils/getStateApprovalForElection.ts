import { stateApprovalHistoryCollection } from "@/lib/db/repositories/stateApprovalHistory";
import { getActiveAddressModifiersByState } from "./governmentApproval";
import { getActiveFairnessGapModifiers } from "@/lib/redistricting/fairnessApproval";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
/**
 * Fetches state government approval for use in election vote accumulation (party strength).
 * Returns 0-100. Uses BASE_APPROVAL (50) when metrics are missing.
 */

import { getDb } from "@/lib/mongodb";
import { findMergedRegionMetricsMany } from "@/lib/macroMetrics/merge";
import type { StateMetrics } from "@/lib/db/types";
import { getEraContext } from "@/lib/era/context";
import type { CountryId } from "@/lib/constants/countries";
import {
  calculateStateApproval,
  computeNationalAveragesFromMetrics,
  loadElectorateGroups,
  weightingFor,
  BASE_APPROVAL,
} from "@/lib/utils/governmentApproval";
import { NATIONAL_SCOPE_IDS } from "@/lib/constants/nationalScope";
import {
  isPoliticalApprovalCountry,
  loadPoliticalApprovalBases,
  type PoliticalApprovalBases,
} from "@/lib/politicalLegislation/politicalApprovalProvider";
import { statesCollection } from "@/lib/db/repositories/states";

/**
 * Get state government approval for a given state (0-100).
 * Used by the election engine to apply party strength modifier.
 * Returns BASE_APPROVAL (50) when state metrics or national averages are unavailable.
 */
export async function getStateApprovalForElection(
  stateId: string,
  countryId?: CountryId
): Promise<number> {
  const map = await getAllStateApprovalsForElection(
    countryId ? { countryIds: [countryId] } : undefined
  );
  return map.get(stateId.toUpperCase()) ?? BASE_APPROVAL;
}

export interface GetAllStateApprovalsOptions {
  /**
   * When set, only loads states + metrics for these countries (full in-country
   * state lists for correct national averages). Skips other countries entirely.
   */
  countryIds?: CountryId[];
}

/**
 * Batch-load state approvals for all states (0-100 each).
 * Use when processing many states (e.g. presidential vote accumulation) to avoid N+1 queries.
 * Each state's approval is computed against its own country's national averages only,
 * preventing US and UK metrics from contaminating each other.
 */
export async function getAllStateApprovalsForElection(
  options?: GetAllStateApprovalsOptions
): Promise<Map<string, number>> {
  return loadStateApprovalsForElection(await getDb(), options);
}

export async function loadStateApprovalsForElection(
  db: import("mongodb").Db,
  options?: GetAllStateApprovalsOptions
): Promise<Map<string, number>> {
  const countryIds = options?.countryIds;
  const stateFilter = countryIds && countryIds.length > 0 ? { countryId: { $in: countryIds } } : {};

  const allStates = await statesCollection(db)
    .find(stateFilter, { projection: { _id: 1, countryId: 1 } })
    .toArray();

  const owners = new Map<string, Set<string>>();
  for (const state of allStates) {
    const id = String(state._id).toUpperCase();
    const countries = owners.get(id) ?? new Set<string>();
    countries.add(state.countryId);
    owners.set(id, countries);
  }
  const outputKey = (countryId: string, stateId: string) =>
    owners.get(stateId.toUpperCase())!.size > 1
      ? `${countryId}:${stateId.toUpperCase()}`
      : stateId.toUpperCase();
  const snapshots = await stateApprovalHistoryCollection(db)
    .find(stateFilter, {
      projection: { stateId: 1, countryId: 1, approvalRating: 1, lastSnapshotTurn: 1 },
    })
    .toArray();
  const stored = new Map(
    snapshots
      .filter((doc) => doc.lastSnapshotTurn != null && Number.isFinite(doc.approvalRating))
      .map((doc) => [`${doc.countryId}:${doc.stateId ?? doc._id}`, doc.approvalRating])
  );
  const recorded = new Map(
    allStates.flatMap((state) => {
      const approval = stored.get(`${state.countryId}:${state._id}`);
      return approval === undefined
        ? []
        : [[outputKey(state.countryId, String(state._id)), approval] as const];
    })
  );
  if (recorded.size === allStates.length) return recorded;
  const stateIdsForMetrics = allStates.map((s) => s._id);
  let metricsFilter: Record<string, unknown> = {};
  if (countryIds && countryIds.length > 0) {
    metricsFilter =
      stateIdsForMetrics.length > 0 ? { _id: { $in: stateIdsForMetrics } } : { _id: { $in: [] } };
  }

  // SP5: merged two-store view.
  const allRawMetrics = await findMergedRegionMetricsMany(db, metricsFilter);

  // Exclude national-scope derived docs — they must not inflate country averages
  const stateOnlyMetrics = allRawMetrics.filter((m) => !NATIONAL_SCOPE_IDS.has(String(m._id)));

  // Metric membership includes the country because region codes can collide.
  const stateCountryMap = new Set(allStates.map((s) => `${s.countryId}:${s._id}`));

  // Group state metrics by country
  const metricsByCountry = new Map<string, StateMetrics[]>();
  for (const m of stateOnlyMetrics) {
    const candidates = owners.get(String(m._id).toUpperCase());
    const cid =
      m.countryId ?? (candidates?.size === 1 ? candidates.values().next().value : undefined);
    if (!cid || !stateCountryMap.has(`${cid}:${m._id}`)) continue;
    const arr = metricsByCountry.get(cid) ?? [];
    arr.push(m);
    metricsByCountry.set(cid, arr);
  }

  // P6d: per-state electorate groups so election approval is the same
  // electorate-weighted value the turn snapshot stores (not ideology-blind).
  const demoFilter = countryIds && countryIds.length > 0 ? { countryId: { $in: countryIds } } : {};
  const [groupsByState, eraContext] = await Promise.all([
    loadElectorateGroups(db, demoFilter),
    // Era ruleset for approval scoring — same preset + era year the turn
    // snapshot uses, so election-time approval matches the displayed/stored value.
    getEraContext(db),
  ]);
  const { preset, year } = eraContext;

  // SP4: playable countries score from the hybrid political model (baseOverride);
  // named modifiers still evaluate on the surviving flat metrics.
  const politicalBasesByCountry = new Map<string, PoliticalApprovalBases | null>();
  for (const cid of metricsByCountry.keys()) {
    if (isPoliticalApprovalCountry(cid, true)) {
      politicalBasesByCountry.set(cid, await loadPoliticalApprovalBases(db, cid));
    }
  }

  // Compute per-country national averages, then approval for each state
  const game = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { currentTurn: 1 } }
  );
  const result = new Map(recorded);
  for (const [cid, countryMetrics] of metricsByCountry) {
    const nationalAverages = computeNationalAveragesFromMetrics(countryMetrics);
    const bases = politicalBasesByCountry.get(cid);
    const addresses = await getActiveAddressModifiersByState(
      db,
      cid as CountryId,
      game?.currentTurn ?? 0
    );
    const fairness = await getActiveFairnessGapModifiers(db, cid as CountryId);
    for (const m of countryMetrics) {
      const id = (typeof m._id === "string" ? m._id : String(m._id)).toUpperCase();
      result.set(
        outputKey(cid, id),
        stored.get(`${cid}:${m._id}`) ??
          calculateStateApproval(
            m,
            nationalAverages,
            [
              ...(addresses.get(String(m._id)) ?? []),
              ...(fairness.get(String(m._id)) ?? []),
              ...(bases?.regionalModifiersByRegion?.get(String(m._id)) ?? []),
            ],
            weightingFor(groupsByState, cid, String(m._id)),
            preset,
            year,
            isPoliticalApprovalCountry(cid, true)
              ? (bases?.byRegion.get(String(m._id)) ?? BASE_APPROVAL)
              : undefined,
            bases?.modifiersByRegion?.get(String(m._id))
          )
      );
    }
  }

  return result;
}
