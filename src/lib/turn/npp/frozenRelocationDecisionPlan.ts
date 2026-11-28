import { BSON, type Db, type Document } from "mongodb";
import type { Bond } from "@/lib/db/types";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import {
  withTurnValueSettlement,
  readTurnValueSettlement,
} from "@/lib/turn/withTurnValueSettlement";
import { encodeOutput, decodeOutput } from "@/lib/turn/corporation/resume/rules";

interface PlanChunk extends Document {
  _id: string;
  payload: string;
}
/** Freeze the credit's complete cash/capacity plan before publishing any debt. */
export async function frozenRelocationDecisionPlan<T>(
  db: Db,
  turn: number,
  load: () => Promise<{ output: T; bonds: Bond[] }>
): Promise<T> {
  const existing = await readTurnValueSettlement<{ keys: string[]; issuesComplete: boolean }>(
    db,
    "npp-relocation-plan",
    turn
  );
  const prepared = existing.applied ? undefined : await load();
  if (prepared && prepared.bonds.length === 0) return prepared.output;
  const manifest = existing.applied
    ? existing.result!
    : await withTurnValueSettlement(
        db,
        "npp-relocation-plan",
        turn,
        async (tx) => {
          const state = await gameStateCollection(tx).findOne(
            { _id: "current" },
            { projection: { resetWorldId: 1, worldEpochId: 1 } }
          );
          if (String(state?.resetWorldId ?? state?.worldEpochId ?? "legacy") !== existing.worldId)
            throw new Error("World changed before relocation plan publication");
          if (!prepared) throw new Error("Frozen relocation plan changed during publication");
          const plan = prepared;
          const serialized = BSON.EJSON.stringify(encodeOutput(plan) as Document, {
            relaxed: false,
          });
          const chunks: PlanChunk[] = [];
          for (const [index, payload] of relocationPlanPayloadChunks(serialized).entries())
            chunks.push({
              _id: `npp-relocation-plan:${existing.worldId}:${turn}:${index}`,
              payload,
              kind: "frozen-npp-relocation-plan",
              turn,
              currency: "MULTI",
              legs: [],
              projections: [],
            });
          if (chunks.length) await bankMoneyMovesCollection<PlanChunk>(tx).insertMany(chunks);
          return { keys: chunks.map((c) => c._id), issuesComplete: false };
        },
        { sourceKey: String(turn), expectedWorldId: existing.worldId }
      );
  const keys = manifest.keys;
  const stored = await bankMoneyMovesCollection<PlanChunk>(db)
    .find({ _id: { $in: keys } })
    .toArray();
  const byKey = new Map(stored.map((c) => [c._id, c.payload]));
  const payload = keys
    .map((key) => {
      const part = byKey.get(key);
      if (part === undefined) throw new Error("Frozen relocation decision plan is missing");
      return part;
    })
    .join("");
  const plan = decodeOutput(BSON.EJSON.parse(payload, { relaxed: true })) as {
    output: T;
    bonds: Bond[];
  };
  if (!manifest.issuesComplete) {
    for (let i = 0; i < plan.bonds.length; i += 50)
      await withTurnValueSettlement(
        db,
        "npp-relocation-issues",
        turn,
        async (tx) => {
          await publishBondBatch(tx, plan.bonds.slice(i, i + 50));
          return true;
        },
        { sourceKey: `${turn}:${i}`, expectedWorldId: existing.worldId }
      );
    const completed = await bankMoneyMovesCollection<Document & { _id: string }>(db).updateOne(
      {
        _id: `source-value:${existing.worldId}:npp-relocation-plan:${turn}`,
        status: "applied",
        "result.keys": keys,
      },
      { $set: { "result.issuesComplete": true } }
    );
    if (completed.matchedCount !== 1) throw new Error("Relocation plan completion proof changed");
  }
  return plan.output;
}

async function publishBondBatch(db: Db, bonds: Bond[]): Promise<void> {
  if (bonds.length > 50) throw new Error("Relocation bond batch exceeds its bound");
  if (bonds.length) await bondsCollection(db).insertMany(bonds);
}

/** Keep UTF-16 pairs together so BSON's UTF-8 encoding preserves the original payload. */
export function relocationPlanPayloadChunks(serialized: string): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < serialized.length;) {
    let end = Math.min(start + 250000, serialized.length);
    const before = serialized.charCodeAt(end - 1),
      after = serialized.charCodeAt(end);
    if (before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff) end--;
    chunks.push(serialized.slice(start, end));
    start = end;
  }
  return chunks;
}
