import { createHash } from "node:crypto";
import { MongoBulkWriteError, ObjectId, type Db } from "mongodb";
import type { CorporationHistory } from "@/lib/db/types";
import { corporationHistoryCollection } from "@/lib/db/repositories/corporationHistory";

/** First publication owns the settled facts; replay cannot append or restate them. */
export async function publishCorporateTurnHistory(
  db: Db,
  rows: Omit<CorporationHistory, "_id">[]
): Promise<void> {
  if (!rows.length) return;
  const history = corporationHistoryCollection(db);
  const ops = rows.map((row) => ({
    updateOne: {
      filter: { corporationId: row.corporationId, turn: row.turn },
      update: {
        $setOnInsert: {
          ...row,
          _id: new ObjectId(
            createHash("sha256")
              .update(`corporation-history:${row.corporationId}:${row.turn}`)
              .digest("hex")
              .slice(0, 24)
          ),
        },
      },
      upsert: true,
    },
  }));
  try {
    await history.bulkWrite(ops, { ordered: false });
  } catch (error) {
    if (!(error instanceof MongoBulkWriteError)) throw error;
    const writeErrors = Array.isArray(error.writeErrors) ? error.writeErrors : [error.writeErrors];
    if (
      !writeErrors.length ||
      writeErrors.some((entry) => entry.code !== 11000) ||
      error.result.getWriteConcernError()
    )
      throw error;
    const turns = [...new Set(rows.map((row) => row.turn))];
    const present = await history
      .find(
        { corporationId: { $in: rows.map((row) => row.corporationId) }, turn: { $in: turns } },
        { projection: { corporationId: 1, turn: 1 } }
      )
      .toArray();
    const keys = new Set(present.map((row) => `${row.corporationId}:${row.turn}`));
    if (rows.some((row) => !keys.has(`${row.corporationId}:${row.turn}`))) throw error;
  }
}
