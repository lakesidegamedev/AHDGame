import type { AnyBulkWriteOperation, Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

/**
 * Per-turn financial-distress clock for player corporations. Run AFTER this
 * turn's liquidCapital has settled. Stamps `financialDistressSinceTurn` when a
 * player corp first goes insolvent or holds a defaulted bond (notifying the
 * owner once), and clears it when the corp recovers. NPC/unowned corps are
 * skipped: they have no nationalization grace. Idempotent within a turn.
 *
 * The grace window itself lives in eligibility (FINANCIAL_DISTRESS_GRACE_TURNS);
 * this only maintains the "since" timestamp the window is measured against.
 */
export async function trackFinancialDistress(db: Db, turn: number): Promise<void> {
  const corps = await corporationsCollection(db)
    .find(
      // Non-state-owned corps; player ownership (userId present) is checked per row
      // below — NPC/unowned corps have no nationalization grace and are skipped.
      { countryOwnerId: { $exists: false } },
      {
        projection: {
          _id: 1,
          userId: 1,
          name: 1,
          sequentialId: 1,
          liquidCapital: 1,
          financialDistressSinceTurn: 1,
        },
      }
    )
    .toArray();
  if (corps.length === 0) return;

  const corpIds = corps.map((c) => c._id);
  const defaultedBonds = await bondsCollection(db)
    .find(
      { corporationId: { $in: corpIds }, defaulted: true, matured: false },
      { projection: { corporationId: 1 } }
    )
    .toArray();
  const defaultedByCorp = new Set(defaultedBonds.map((b) => String(b.corporationId)));

  const ops: AnyBulkWriteOperation<Corporation>[] = [];
  const notifications: NotificationInput[] = [];

  for (const corp of corps) {
    if (corp.userId == null) continue; // NPC/unowned — no nationalization grace
    const inDistress = (corp.liquidCapital ?? 0) < 0 || defaultedByCorp.has(String(corp._id));
    const wasFlagged = corp.financialDistressSinceTurn != null;

    if (inDistress && !wasFlagged) {
      ops.push({
        updateOne: {
          filter: { _id: corp._id },
          update: { $set: { financialDistressSinceTurn: turn } },
        },
      });
      if (corp.userId) {
        notifications.push({
          userId: corp.userId,
          type: "corp_nationalization_risk",
          title: "Your corporation is at risk of nationalization",
          message: `${corp.name} is in financial distress. If it isn't resolved soon, the government may nationalize it.`,
          metadata: {
            corporationId: corp._id.toString(),
            sequentialId: corp.sequentialId,
            sinceTurn: turn,
          },
        });
      }
    } else if (!inDistress && wasFlagged) {
      ops.push({
        updateOne: {
          filter: { _id: corp._id },
          update: { $unset: { financialDistressSinceTurn: "" } },
        },
      });
    }
  }

  if (ops.length > 0) {
    await corporationsCollection(db).bulkWrite(ops);
  }
  await createNotifications(notifications);
}
