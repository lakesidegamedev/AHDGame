import type { Db } from "mongodb";
import { politicalMetricsCollection } from "@/lib/db/repositories/politicalMetrics";
import type { Document } from "mongodb";

/**
 * Clear world-scoped political offsets embedded in the retained reference board.
 *
 * `politicalMetrics` is reseeded with `$set` during bootstrap, so these mutable
 * fields are not removed by reseeding. Call only from the world-reset lifecycle,
 * never from a targeted seed or maintenance re-seed.
 */
export async function resetPoliticalMetricsRuntimeState(db: Db): Promise<number> {
  const result = await politicalMetricsCollection<Document>(db).updateMany(
    {},
    {
      $unset: {
        appliedEventEffects: "",
        cabinetResiduals: "",
        cabinetResidualsBySource: "",
        labourResiduals: "",
        livingConflictResiduals: "",
      },
    }
  );
  return result.modifiedCount;
}
