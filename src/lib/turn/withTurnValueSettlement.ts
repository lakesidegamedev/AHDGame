import type { Db } from "mongodb";
import { withSessionDb, boundSession } from "@/lib/db/sessionDb";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";
import { isDuplicateKeyError } from "@/lib/api/errors";

interface PhaseReceipt<T> {
  _id: string;
  kind: "turn-value-settlement";
  status: "applied";
  phase: string;
  turn: number;
  worldId: string;
  sourceKey?: string;
  result: T;
  currency: "MULTI";
  legs: [];
  projections: [];
  createdAt: Date;
}
/** Commit a bounded phase's money, projections and completion proof together. */
export async function withTurnValueSettlement<T>(
  db: Db,
  phase: string,
  turn: number,
  work: (db: Db) => Promise<T>,
  identity?: { sourceKey: string; expectedWorldId?: string }
): Promise<T> {
  if (!/^[a-z][a-z0-9-]*$/.test(phase) || !Number.isSafeInteger(turn) || turn < 0)
    throw new Error("Invalid turn value settlement identity");
  const state = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { resetWorldId: 1, worldEpochId: 1 } }
  );
  const worldId = String(state?.resetWorldId ?? state?.worldEpochId ?? "legacy");
  if (identity?.expectedWorldId !== undefined && identity.expectedWorldId !== worldId)
    throw new Error("World changed before frozen value settlement");
  if (identity && (!identity.sourceKey || identity.sourceKey.length > 500))
    throw new Error("Invalid source settlement identity");
  const key = identity
    ? `source-value:${worldId}:${phase}:${identity.sourceKey}`
    : `turn-value:${worldId}:${phase}:${turn}`;
  const valid = (receipt: PhaseReceipt<T> | null) =>
    receipt?.kind === "turn-value-settlement" &&
    receipt.phase === phase &&
    (identity ? receipt.sourceKey === identity.sourceKey : receipt.turn === turn) &&
    receipt.worldId === worldId &&
    receipt.status === "applied";
  try {
    return await withSessionDb(db, async (db) => {
      const current = await gameStateCollection(db).findOne(
        { _id: "current" },
        { projection: { resetWorldId: 1, worldEpochId: 1 } }
      );
      if (String(current?.resetWorldId ?? current?.worldEpochId ?? "legacy") !== worldId)
        throw new Error("World changed before turn value settlement");
      const receipts = bankMoneyMovesCollection<PhaseReceipt<T>>(db),
        previous = await receipts.findOne({ _id: key });
      if (previous) {
        if (!valid(previous))
          throw new Error("Turn value settlement proof requires reconciliation");
        return previous.result;
      }
      const result = await work(db);
      await receipts.insertOne({
        _id: key,
        kind: "turn-value-settlement",
        status: "applied",
        phase,
        turn,
        worldId,
        ...(identity ? { sourceKey: identity.sourceKey } : {}),
        result,
        currency: "MULTI",
        legs: [],
        projections: [],
        createdAt: new Date(),
      });
      return result;
    });
  } catch (error) {
    if (boundSession(db) || !isDuplicateKeyError(error)) throw error;
    const winner = await bankMoneyMovesCollection<PhaseReceipt<T>>(db).findOne({ _id: key });
    if (!valid(winner)) throw error;
    return winner!.result;
  }
}

/** Read a source-scoped completion proof without opening a transaction. */
export async function readTurnValueSettlement<T>(
  db: Db,
  phase: string,
  turn: number
): Promise<{ worldId: string; result?: T; applied: boolean }> {
  const state = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { resetWorldId: 1, worldEpochId: 1 } }
  );
  const worldId = String(state?.resetWorldId ?? state?.worldEpochId ?? "legacy");
  const receipt = await bankMoneyMovesCollection<PhaseReceipt<T>>(db).findOne({
    _id: `source-value:${worldId}:${phase}:${turn}`,
  });
  if (!receipt) return { worldId, applied: false };
  if (
    receipt.kind !== "turn-value-settlement" ||
    receipt.phase !== phase ||
    receipt.worldId !== worldId ||
    receipt.turn !== turn ||
    receipt.status !== "applied"
  )
    throw new Error("Turn completion proof requires reconciliation");
  return { worldId, applied: true, result: receipt.result };
}
