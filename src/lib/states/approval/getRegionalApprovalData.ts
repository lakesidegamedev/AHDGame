import { stateApprovalHistoryCollection } from "@/lib/db/repositories/stateApprovalHistory";
import { getActiveFairnessGapModifiers } from "@/lib/redistricting/fairnessApproval";
import { loadElectorateGroups, weightingFor } from "@/lib/utils/governmentApproval";
import type { Db } from "mongodb";
import { findMergedRegionMetrics, findMergedRegionMetricsMany } from "@/lib/macroMetrics/merge";
import type { CountryId } from "@/lib/constants/countries";

import { resolveGameYear } from "@/lib/era/era";
import { getActiveAddressApprovalModifiers } from "@/lib/governorOffice/address/activeAddressModifiers";
import {
  buildFlatMetrics,
  calculateStateApproval,
  computeNationalAveragesFromMetrics,
  computeStateApprovalBase,
} from "@/lib/utils/governmentApproval";
import {
  evaluateRegionalApprovalModifiers as evaluateModifiers,
  type ActiveModifier,
} from "@/lib/utils/approvalModifiers";
import { BASE_APPROVAL } from "@/lib/utils/governmentApproval";
import {
  isPoliticalApprovalCountry,
  loadPoliticalApprovalBases,
} from "@/lib/politicalLegislation/politicalApprovalProvider";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { statesCollection } from "@/lib/db/repositories/states";
import type { Document } from "mongodb";

export interface RegionalApprovalData {
  approval: number;
  baseApproval: number;
  modifiers: ActiveModifier[];
}

/**
 * Compute regional government approval and active metric/address modifiers.
 * Shared by the region page hero, overview conditions card, and metrics APIs.
 */
export async function getRegionalApprovalData(
  db: Db,
  countryId: CountryId,
  stateId: string
): Promise<RegionalApprovalData | null> {
  const stored = await stateApprovalHistoryCollection(db).findOne({ _id: stateId, countryId });
  if (stored?.lastSnapshotTurn != null && Number.isFinite(stored.approvalRating))
    return {
      approval: stored.approvalRating,
      baseApproval: stored.baseApproval ?? 50,
      modifiers: stored.activeModifiers ?? [],
    };
  // SP5: merged two-store view.
  const metrics = await findMergedRegionMetrics(db, { _id: stateId, countryId });
  if (!metrics) return null;

  const countryStateIds = (
    await statesCollection<Document>(db)
      .find({ countryId })
      .project<{ _id: string }>({ _id: 1 })
      .toArray()
  ).map((s) => s._id);

  if (countryStateIds.length === 0) return null;

  const allMetrics = await findMergedRegionMetricsMany(db, {
    _id: { $in: countryStateIds },
    countryId,
  });

  if (allMetrics.length === 0) return null;

  const nationalAverages = computeNationalAveragesFromMetrics(allMetrics);
  const gameState = await gameStateCollection(db).findOne(
    { _id: "current" },
    {
      projection: {
        currentTurn: 1,
        currentYear: 1,
        preset: 1,
        startingYear: 1,
      },
    }
  );
  const currentTurn = gameState?.currentTurn ?? 0;
  const preset = gameState?.preset ?? null;
  // Live year for era-aware scoring; null while the flag is off (legacy path).
  const year = gameState ? resolveGameYear(gameState) : null;

  const addressModifiers = await getActiveAddressApprovalModifiers(
    db,
    countryId,
    stateId,
    currentTurn
  );
  const bases = isPoliticalApprovalCountry(countryId, true)
    ? await loadPoliticalApprovalBases(db, countryId)
    : null;
  const metricModifiers =
    bases?.modifiersByRegion?.get(stateId) ??
    evaluateModifiers(buildFlatMetrics(metrics), { preset, countryId, year });
  const fairness = await getActiveFairnessGapModifiers(db, countryId);
  const extras = [
    ...addressModifiers,
    ...(fairness.get(stateId) ?? []),
    ...(bases?.regionalModifiersByRegion?.get(stateId) ?? []),
  ];
  const groups = await loadElectorateGroups(db, { countryId, _id: stateId });
  const weighting = weightingFor(groups, countryId, stateId);
  const modifiers: ActiveModifier[] = [...metricModifiers, ...extras];

  // SP4: playable countries score from the hybrid political base; modifiers
  // (metric-named + address) still apply on top via the shared seam.
  let baseOverride: number | undefined;
  if (isPoliticalApprovalCountry(countryId, true)) {
    baseOverride = bases?.byRegion.get(stateId) ?? BASE_APPROVAL;
  }

  return {
    approval: calculateStateApproval(
      metrics,
      nationalAverages,
      extras,
      weighting,
      preset,
      year,
      baseOverride,
      metricModifiers
    ),
    baseApproval:
      baseOverride ??
      computeStateApprovalBase(metrics, nationalAverages, weighting, preset ?? undefined, year),
    modifiers,
  };
}
