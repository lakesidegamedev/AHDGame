import { withTurnValueSettlement } from "@/lib/turn/withTurnValueSettlement";
import { appendTurnHistory, uniqueTurnHistory } from "@/lib/turn/rules/turnHistory";
import type { Db, AnyBulkWriteOperation } from "mongodb";
import type { StateMetrics, MetricCategoryId } from "@/lib/db/types";
import { NATIONAL_SCOPE, NATIONAL_SCOPE_IDS } from "@/lib/constants/nationalScope";
import { isMacroMetricPath } from "@/lib/macroMetrics/paths";
import { macroMetricsCollection } from "@/lib/db/repositories/macroMetrics";

export const METRIC_HISTORY_CAP = 96; // 2 in-game years (48 turns/year)

const METRIC_CATEGORIES: MetricCategoryId[] = [
  "economic",
  "education",
  "healthcare",
  "infrastructure",
  "publicSafety",
  "environment",
  "social",
  "governance",
  "population",
  "mediaInformation",
];

// stateMetricHistory documents use string state IDs as _id
interface MetricHistoryDoc {
  _id: string;
  [key: string]: unknown;
}

/**
 * Snapshot current metric values for all states into the stateMetricHistory collection.
 * Each state document stores per-metric arrays capped at METRIC_HISTORY_CAP entries.
 * Called each turn after policyEffects are applied.
 *
 * Also snapshots the precomputed country-level docs under ids like "uk_national"
 * and "federal" so national metric detail pages can show history.
 *
 * Document shape:
 * {
 *   _id: "TX",
 *   economic: { unemploymentRate: [{ turn: 1, value: 8.2 }, ...] },
 *   ...
 * }
 */
export async function snapshotMetricHistory(db: Db, turn: number): Promise<void> {
  return withTurnValueSettlement(db, "macro-metric-history", turn, (db) =>
    snapshotMetricHistoryWork(db, turn)
  );
}

async function snapshotMetricHistoryWork(db: Db, turn: number): Promise<void> {
  // Only macroMetrics snapshots here now. The political half moved to the
  // board, whose trend history is written by the dynamics phase into
  // politicalMetricsHistory on its own cadence — a second snapshot of an empty
  // legacy store would just write nothing.
  const macroDocs = await macroMetricsCollection(db).find({}).toArray();

  const snapshotStore = async (docs: StateMetrics[], historyCollection: string) => {
    const metricsMap = new Map(docs.map((m) => [String(m._id), m]));
    const buildHistorySet = (metrics: StateMetrics): Record<string, unknown> => {
      const historySet: Record<string, unknown> = {};
      for (const cat of METRIC_CATEGORIES) {
        const catData = metrics[cat] as Record<string, { value: number }> | undefined;
        if (!catData) continue;
        for (const [key, metricVal] of Object.entries(catData)) {
          if (typeof metricVal?.value === "number" && Number.isFinite(metricVal.value)) {
            historySet[`${cat}.${key}`] = appendTurnHistory(
              `${cat}.${key}`,
              { turn, value: metricVal.value },
              METRIC_HISTORY_CAP
            );
          }
        }
      }
      return historySet;
    };

    const stateBulkOps: AnyBulkWriteOperation<MetricHistoryDoc>[] = [];
    for (const metrics of docs.filter((m) => !NATIONAL_SCOPE_IDS.has(String(m._id)))) {
      const historySet = buildHistorySet(metrics);
      if (Object.keys(historySet).length === 0) continue;
      stateBulkOps.push({
        updateOne: {
          filter: { _id: String(metrics._id) },
          update: [{ $set: historySet }],
          upsert: true,
        },
      });
    }
    if (stateBulkOps.length > 0) {
      await db.collection<MetricHistoryDoc>(historyCollection).bulkWrite(stateBulkOps);
    }
    // National-scope snapshots use the precomputed national docs written this turn.
    const nationalBulkOps: AnyBulkWriteOperation<MetricHistoryDoc>[] = [];
    for (const nationalId of Object.keys(NATIONAL_SCOPE)) {
      const nationalMetrics = metricsMap.get(nationalId);
      if (!nationalMetrics) continue;
      const historySet = buildHistorySet(nationalMetrics);
      if (Object.keys(historySet).length === 0) continue;
      nationalBulkOps.push({
        updateOne: {
          filter: { _id: nationalId },
          update: [{ $set: historySet }],
          upsert: true,
        },
      });
    }
    if (nationalBulkOps.length > 0) {
      await db.collection<MetricHistoryDoc>(historyCollection).bulkWrite(nationalBulkOps);
    }
  };

  await snapshotStore(macroDocs, "macroMetricsHistory");
}

/**
 * Fetch history for a single metric in a single state.
 * Returns entries sorted oldest→newest.
 */
export async function getMetricHistory(
  db: Db,
  stateId: string,
  category: MetricCategoryId,
  metricId: string
): Promise<Array<{ turn: number; value: number }>> {
  // National-scope IDs are lowercase; regular state IDs are uppercase
  const docId = stateId in NATIONAL_SCOPE ? stateId : stateId.toUpperCase();
  // SP5: macro categories read their own history store.
  const historyCollection = isMacroMetricPath(`${category}.${metricId}`)
    ? "macroMetricsHistory"
    : "stateMetricHistory";
  const doc = await db
    .collection<MetricHistoryDoc>(historyCollection)
    .findOne({ _id: docId }, { projection: { [`${category}.${metricId}`]: 1 } });

  const arr = (doc as Record<string, unknown> | null)?.[category];
  if (!arr || typeof arr !== "object") return [];
  const history = (arr as Record<string, unknown>)[metricId];
  if (!Array.isArray(history)) return [];
  return uniqueTurnHistory(
    (history as Array<{ turn: number; value: number }>).filter(
      (point) => typeof point?.value === "number" && Number.isFinite(point.value)
    )
  );
}
