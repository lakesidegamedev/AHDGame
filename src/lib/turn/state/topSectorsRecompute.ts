/**
 * Per-turn recompute of `State.topSectorsCache`: top-3 corporate sectors by
 * aggregate per-turn revenue per state.
 *
 * Groups `corporateSectors` by `(stateId, sectorType)`, sums `revenue` in ₳,
 * sorts descending, and writes the top `TOP_N` per state.
 *
 * Cache entries are tagged with `specializationBonus`: `"primary"` (+10pp
 * regional margin) when the sector matches `sectorSpecializations.primary`,
 * `"secondary"` (+5pp) for secondary, `null` otherwise.
 *
 * Called from `stateEffectsAndNationalAggregation` so the Overview Economy
 * card has fresh data without per-request aggregation. Empty states get an
 * empty `sectors` array and the UI falls back to `sectorSpecializations`.
 */

import type { Db } from "mongodb";
import type { CorporationType } from "@/lib/constants/corporations";
import type { State } from "@/lib/db/types";
import { statesCollection } from "@/lib/db/repositories/states";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { loadValuationFxRates } from "@/lib/currency/corporationCapital";
import { loadOwnerCurrencyInfo, sectorMoneyAnchor } from "@/lib/corporations/sectorRevenueScale";
import type { Document } from "mongodb";

/** How many top sectors to surface per state. */
const TOP_N = 3;

export interface TopSectorsRecomputeResult {
  statesProcessed: number;
  /** Number of state docs that received a non-empty top-sectors snapshot. */
  statesWithActivity: number;
}

interface AggRow {
  _id: {
    stateId: string;
    sectorType: CorporationType;
    corporationId: unknown;
    countryId?: string | null;
  };
  revenue: number;
}

export async function processTopSectorsRecompute(
  db: Db,
  currentTurn: number,
  now: Date = new Date()
): Promise<TopSectorsRecomputeResult> {
  // One aggregation per (state, type, owner, host country): `revenue` is stored
  // in each site's host currency, so rows are converted to ₳ before they are
  // added across owners (a foreign site and a domestic one do not share a unit).
  const rows = await corporateSectorsCollection<Document>(db)
    .aggregate<AggRow>([
      {
        $group: {
          _id: {
            stateId: "$stateId",
            sectorType: "$sectorType",
            corporationId: "$corporationId",
            countryId: "$countryId",
          },
          revenue: { $sum: "$revenue" },
        },
      },
    ])
    .toArray();
  const [owners, fx] = await Promise.all([
    loadOwnerCurrencyInfo(
      db,
      rows.map((r) => r._id.corporationId as string)
    ),
    loadValuationFxRates(db),
  ]);
  const anchorByStateType = new Map<string, { row: AggRow["_id"]; revenue: number }>();
  for (const row of rows) {
    const key = `${row._id.stateId}\u0000${row._id.sectorType}`;
    const anchor = sectorMoneyAnchor(
      row.revenue,
      { countryId: row._id.countryId },
      owners.get(String(row._id.corporationId)),
      fx
    );
    const entry = anchorByStateType.get(key);
    if (entry) entry.revenue += anchor;
    else anchorByStateType.set(key, { row: row._id, revenue: anchor });
  }
  const sorted = [...anchorByStateType.values()].sort((a, b) => b.revenue - a.revenue);

  // Group by stateId in memory (already sorted desc by revenue, so the first
  // N entries per state are the top N).
  const byState = new Map<
    string,
    Array<{
      sectorType: CorporationType;
      revenue: number;
    }>
  >();
  for (const { row, revenue } of sorted) {
    const list = byState.get(row.stateId) ?? [];
    if (list.length < TOP_N) {
      list.push({ sectorType: row.sectorType, revenue });
      byState.set(row.stateId, list);
    } else if (!byState.has(row.stateId)) {
      byState.set(row.stateId, list);
    }
  }

  // Tag each entry with its specialization bonus (if any) and write to
  // every state that has at least one active sector. States without
  // activity keep their existing cache (or no cache) — the Overview
  // fallback handles those.
  const states = await statesCollection(db)
    .find({}, { projection: { _id: 1, sectorSpecializations: 1 } })
    .toArray();

  const result: TopSectorsRecomputeResult = {
    statesProcessed: states.length,
    statesWithActivity: 0,
  };

  const ops: Array<{
    updateOne: {
      filter: { _id: string };
      update: { $set: Partial<State> };
    };
  }> = [];

  for (const state of states) {
    const live = byState.get(state._id) ?? [];
    const spec = state.sectorSpecializations;
    const sectors = live.map((s) => ({
      sectorType: s.sectorType,
      revenue: s.revenue,
      specializationBonus:
        spec?.primary === s.sectorType
          ? ("primary" as const)
          : spec?.secondary === s.sectorType
            ? ("secondary" as const)
            : null,
    }));
    if (sectors.length > 0) result.statesWithActivity += 1;
    ops.push({
      updateOne: {
        filter: { _id: state._id },
        update: {
          $set: {
            topSectorsCache: {
              sectors,
              computedAtTurn: currentTurn,
              computedAt: now,
            },
          },
        },
      },
    });
  }

  if (ops.length > 0) {
    await statesCollection(db).bulkWrite(ops, { ordered: false });
  }

  return result;
}
