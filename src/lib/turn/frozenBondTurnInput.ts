import type { Db, Document } from "mongodb";
import { withTurnValueSettlement } from "./withTurnValueSettlement";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

/** Retain original servicing claims without putting the entire book in one BSON document. */
export async function frozenBondTurnInput<T extends Document>(
  db: Db,
  name: string,
  turn: number,
  load: (db: Db) => Promise<T[]>
): Promise<T[]> {
  const state = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { resetWorldId: 1, worldEpochId: 1 } }
  );
  const world = String(state?.resetWorldId ?? state?.worldEpochId ?? "legacy");
  const keys = await withTurnValueSettlement(
    db,
    `bond-input-${name}`,
    turn,
    async (tx) => {
      const values = await load(tx),
        keys: string[] = [];
      const chunks: Array<Document & { _id: string }> = [];
      for (let i = 0; i < values.length; i += 50) {
        const key = `bond-input:${world}:${name}:${turn}:${i}`;
        keys.push(key);
        chunks.push({
          _id: key,
          kind: "frozen-bond-turn-input",
          currency: "MULTI",
          legs: [],
          projections: [],
          values: values.slice(i, i + 50),
          turn,
          worldId: world,
        });
      }
      if (chunks.length)
        await bankMoneyMovesCollection<Document & { _id: string }>(tx).insertMany(chunks);
      return keys;
    },
    { sourceKey: String(turn), expectedWorldId: world }
  );
  if (!keys.length) return [];
  const chunks = await bankMoneyMovesCollection<{ _id: string; values: T[] }>(db)
    .find({ _id: { $in: keys } })
    .toArray();
  const byKey = new Map(chunks.map((row) => [row._id, row.values]));
  return keys.flatMap((key) => {
    const values = byKey.get(key);
    if (!values) throw new Error("Frozen bond servicing input requires reconciliation");
    return values;
  });
}

/** Commit a bounded raw cash batch and its replay proof in the same transaction. */
export async function settleBondTurnBatches<T>(
  db: Db,
  name: string,
  turn: number,
  values: readonly T[],
  apply: (db: Db, values: T[]) => Promise<unknown>
): Promise<void> {
  for (let i = 0; i < values.length; i += 100)
    await withTurnValueSettlement(
      db,
      `bond-cash-${name}`,
      turn,
      async (tx) => {
        await apply(tx, values.slice(i, i + 100));
        return true;
      },
      { sourceKey: `${turn}:${i}` }
    );
}
