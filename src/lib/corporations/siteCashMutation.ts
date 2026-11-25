import { gameStateCollection } from "@/lib/db/repositories/gameState";
import type { Db, Document } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { boundSession, withSessionDb } from "@/lib/db/sessionDb";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { corporateDiscretionaryCashGuard } from "./rules/discretionaryCash";

class SiteCashConflict extends Error {}

/** The quoted denomination and operator must still own the treasury at commit. */
export function corporateCashSnapshotGuard(corporation: Corporation): Document {
  return Object.fromEntries(
    (["liquidCurrencyCode", "countryId", "userId", "ceoId", "ceoType"] as const).map((field) => [
      field,
      Object.hasOwn(corporation, field) ? corporation[field] : { $exists: false },
    ])
  );
}

/** Cash and the purchased or cancelled property commit together, including on retries. */
export async function commitSiteCashMutation(
  db: Db,
  input: {
    corporation: Corporation;
    chargeLocal: number;
    site: { insert: Document } | { filter: Document; update: Document };
    now: Date;
    record?: (transactionDb: Db) => Promise<void>;
  }
): Promise<boolean> {
  if (!Number.isFinite(input.chargeLocal)) throw new Error("Invalid site payment");
  try {
    return await withSessionDb(db, async (tx) => {
      const state = await gameStateCollection<{ _id: string; updatedAt?: Date }>(tx).findOne(
        { _id: "current" },
        { projection: { updatedAt: 1 } }
      );
      const idle = await gameStateCollection<{ _id: string }>(tx).updateOne(
        {
          _id: "current",
          isProcessing: { $ne: true },
          updatedAt: state?.updatedAt ?? { $exists: false },
        },
        {
          $set: {
            updatedAt: new Date(
              Math.max(input.now.getTime(), state?.updatedAt?.getTime() ?? 0) + 1
            ),
          },
        }
      );
      if (idle.matchedCount !== 1) throw new SiteCashConflict();
      const paid = await corporationsCollection<Document>(tx).updateOne(
        {
          _id: input.corporation._id,
          ...corporateCashSnapshotGuard(input.corporation),
          ...(input.chargeLocal > 0
            ? {
                liquidCapital: { $gte: input.chargeLocal },
                ...corporateDiscretionaryCashGuard(),
              }
            : {}),
        },
        {
          $inc: { liquidCapital: -input.chargeLocal },
          $set: { updatedAt: input.now },
        }
      );
      if (paid.matchedCount !== 1) throw new SiteCashConflict();
      if ("insert" in input.site) {
        // PLANTS-GATED: Callers supply the plants-aware founding image; this boundary only commits it with cash.
        await corporateSectorsCollection<Document>(tx).insertOne(input.site.insert);
      } else {
        const changed = await corporateSectorsCollection<Document>(tx).updateOne(
          input.site.filter,
          input.site.update
        );
        if (changed.matchedCount !== 1) throw new SiteCashConflict();
      }
      if (input.record) await input.record(tx);
      return true;
    });
  } catch (error) {
    if (error instanceof SiteCashConflict && !boundSession(db)) return false;
    throw error;
  }
}
