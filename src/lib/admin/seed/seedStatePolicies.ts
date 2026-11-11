import { alignSeedIncomeTaxTierRecords } from "@/lib/budget/incomeTaxSeedPolicies";
import type { AnyBulkWriteOperation, Db } from "mongodb";
import { logWarning } from "@/lib/utils/errorLog";
import type { StatePolicyRecord } from "@/lib/db/types";

export async function seedStatePolicies(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  if (reset)
    await db
      .collection("statePolicies")
      .drop()
      .catch((error) => {
        logWarning("Collection drop failed (may not exist)", {
          component: "AdminSeedRoute",
          action: "drop collection",
          metadata: { error: String(error) },
        });
      });

  const DEPRECATED_TYPE_IDS = ["immigration", "medicare"];

  const cleanupResult = await db
    .collection("statePolicies")
    .deleteMany({ legislationTypeId: { $in: DEPRECATED_TYPE_IDS } });
  if (cleanupResult.deletedCount > 0) {
    log(`Removed ${cleanupResult.deletedCount} policies for deprecated legislation types`);
  }

  const { getBasePolicies } = await import("@/lib/seeds/reference/basePolicies");
  const { legislationTypes } = await import("@/lib/seeds/reference/legislationTypes");

  const basePolicies = await alignSeedIncomeTaxTierRecords(db, await getBasePolicies(preset));

  // Build list of valid policy keys for cleanup
  const validPolicyKeys = new Set<string>();
  const ops: AnyBulkWriteOperation<StatePolicyRecord>[] = [];

  for (const r of basePolicies) {
    const filter =
      r.scope === "national"
        ? {
            scope: "national" as const,
            stateId: r.stateId,
            legislationTypeId: r.legislationTypeId,
          }
        : {
            scope: "state" as const,
            stateId: r.stateId,
            legislationTypeId: r.legislationTypeId,
          };
    const setDoc = {
      scope: r.scope,
      ...(r.stateId != null && { stateId: r.stateId }),
      legislationTypeId: r.legislationTypeId,
      economic: r.economic,
      social: r.social,
      ...(r.policyOptionId != null && { policyOptionId: r.policyOptionId }),
      ...(r.policyOptionIndex != null && { policyOptionIndex: r.policyOptionIndex }),
      effectDirection: r.effectDirection,
      updatedAt: r.updatedAt,
    };
    ops.push({ updateOne: { filter, update: { $set: setDoc }, upsert: true } });

    // Track valid policy key
    const key =
      r.scope === "national"
        ? `national:${r.stateId}:${r.legislationTypeId}`
        : `state:${r.stateId}:${r.legislationTypeId}`;
    validPolicyKeys.add(key);
  }

  // Before the cleanup below, and ordered: `basePolicies` can revisit a
  // (scope, stateId, legislationTypeId) key, so loop order decides the winner.
  if (ops.length > 0) {
    await db.collection<StatePolicyRecord>("statePolicies").bulkWrite(ops, { ordered: true });
  }

  // The cleanup is country-blind, so the new-generation id set must be in the
  // valid set or every baseline record would be deleted as stale.
  const { getAllNewGenerationLawIds } = await import("@/lib/politicalLegislation/catalog");
  const validLegTypeIds = [...legislationTypes.map((lt) => lt._id), ...getAllNewGenerationLawIds()];

  // Remove state policies that reference non-existent legislation types
  const deleteResult = await db.collection("statePolicies").deleteMany({
    legislationTypeId: { $nin: validLegTypeIds },
  });
  const staleRemoved = deleteResult.deletedCount || 0;

  log(
    `Seeded ${basePolicies.length} state policy records (preset: ${preset})${staleRemoved > 0 ? `, removed ${staleRemoved} stale entries` : ""}`
  );
}
