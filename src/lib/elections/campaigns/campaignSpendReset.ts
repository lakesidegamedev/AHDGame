/**
 * Per-turn rollover of campaign spend: after the tally reads `spendThisTurn`,
 * fold it into decaying `spendStock` (retention fade, dust cutoff) and clear it
 * so next turn starts fresh. Stock only grows through actual spend, so hoarded
 * treasuries still score zero. Must run after `voteAccumulation`.
 */

import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { Campaign } from "@/lib/db/types";
import {
  SPEND_STOCK_DUST_CUTOFF,
  SPEND_STOCK_RETENTION,
} from "@/lib/elections/engine/electionFormulaFactors";
import { campaignsCollection } from "@/lib/db/repositories/campaigns";

export interface CampaignSpendResetResult {
  campaignsReset: number;
}

/**
 * Sweep that folds `spendThisTurn` into `spendStock` (with retention
 * fade) on every campaign row carrying either, then clears the
 * accumulator. Idempotent — once rolled, the row matches the filter
 * only via a live stock ≥ dust cutoff, and a fully idle row drops its
 * stock and goes quiet.
 */
export async function processCampaignSpendReset(
  injectedDb?: Db
): Promise<CampaignSpendResetResult> {
  const db = injectedDb ?? (await getDb());

  const result = await campaignsCollection(db).updateMany(
    {
      $or: [{ spendThisTurn: { $gt: 0 } }, { spendStock: { $gte: SPEND_STOCK_DUST_CUTOFF } }],
    },
    [
      {
        $set: {
          spendStock: {
            $let: {
              vars: {
                rolled: {
                  $add: [
                    {
                      $multiply: [{ $ifNull: ["$spendStock", 0] }, SPEND_STOCK_RETENTION],
                    },
                    { $ifNull: ["$spendThisTurn", 0] },
                  ],
                },
              },
              in: {
                $cond: [{ $lt: ["$$rolled", SPEND_STOCK_DUST_CUTOFF] }, "$$REMOVE", "$$rolled"],
              },
            },
          },
        },
      },
      { $unset: "spendThisTurn" },
    ]
  );

  return { campaignsReset: result.modifiedCount ?? 0 };
}
