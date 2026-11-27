import type { Db } from "mongodb";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { withTurnValueSettlement } from "@/lib/turn/withTurnValueSettlement";
import type { SupplyAgreementSettlements } from "./settleSupplyAgreementsAllocation";

const CASH_PHASE = "supply-agreement-cash";
const CHUNK_PHASE = "supply-agreement-plan-chunk";
const PROJECTION_PHASE = "supply-agreement-projection";
const CHUNK_ROWS = 1024;
export type SupplyPlanPart = Pick<
  SupplyAgreementSettlements,
  "deliveries" | "damages" | "settledPremiums" | "txEntries"
>;
export interface SupplyCashPlanManifest {
  worldId: string;
  turn: number;
  chunkKeys: string[];
  settledCount: number;
  totalPremiumAnchor: number;
  cashClosings: Array<{ corporationId: string; balance: number }>;
}
interface StoredPlanPart {
  _id: string;
  kind: "turn-value-settlement";
  phase: typeof CHUNK_PHASE;
  status: "applied";
  worldId: string;
  turn: number;
  result: SupplyPlanPart;
  currency: "MULTI";
  legs: [];
  projections: [];
  createdAt: Date;
}
interface CashReceipt {
  _id: string;
  kind: "turn-value-settlement";
  phase: typeof CASH_PHASE;
  status: "applied";
  worldId: string;
  turn: number;
  result: SupplyCashPlanManifest;
  supplyProjectionsComplete?: boolean;
}
async function worldIdentity(db: Db): Promise<string> {
  const state = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { resetWorldId: 1, worldEpochId: 1 } }
  );
  return String(state?.resetWorldId ?? state?.worldEpochId ?? "legacy");
}

/** Cash and the complete frozen plan commit together; large arrays live in bounded documents. */
export async function prepareSupplyCashPlan(
  db: Db,
  turn: number,
  now: Date,
  prepare: (
    db: Db
  ) => Promise<
    SupplyAgreementSettlements & { cashClosings: SupplyCashPlanManifest["cashClosings"] }
  >
): Promise<SupplyCashPlanManifest> {
  const worldId = await worldIdentity(db);
  return withTurnValueSettlement(
    db,
    CASH_PHASE,
    turn,
    async (db) => {
      const plan = await prepare(db);
      const count = Math.max(
        ...[plan.deliveries, plan.damages, plan.settledPremiums, plan.txEntries].map((rows) =>
          Math.ceil(rows.length / CHUNK_ROWS)
        )
      );
      const docs: StoredPlanPart[] = [];
      for (let index = 0; index < count; index++) {
        const start = index * CHUNK_ROWS,
          end = start + CHUNK_ROWS;
        docs.push({
          _id: `supply-plan:${worldId}:${turn}:${index}`,
          kind: "turn-value-settlement",
          phase: CHUNK_PHASE,
          status: "applied",
          worldId,
          turn,
          currency: "MULTI",
          legs: [],
          projections: [],
          createdAt: now,
          result: {
            deliveries: plan.deliveries.slice(start, end),
            damages: plan.damages.slice(start, end),
            settledPremiums: plan.settledPremiums.slice(start, end),
            txEntries: plan.txEntries.slice(start, end),
          },
        });
      }
      if (docs.length)
        await bankMoneyMovesCollection<StoredPlanPart>(db).insertMany(docs, { ordered: true });
      return {
        worldId,
        turn,
        chunkKeys: docs.map((doc) => doc._id),
        settledCount: plan.settledCount,
        totalPremiumAnchor: plan.totalPremiumAnchor,
        cashClosings: plan.cashClosings,
      };
    },
    { sourceKey: String(turn), expectedWorldId: worldId }
  );
}

/** Unfinished projection tails remain discoverable even after their cash turn completes. */
export async function pendingSupplyCashPlans(db: Db): Promise<SupplyCashPlanManifest[]> {
  const worldId = await worldIdentity(db);
  const rows = await bankMoneyMovesCollection<CashReceipt>(db)
    .find({
      kind: "turn-value-settlement",
      phase: CASH_PHASE,
      status: "applied",
      worldId,
      supplyProjectionsComplete: { $ne: true },
    })
    .sort({ turn: 1 })
    .toArray();
  return rows.map((row) => row.result);
}

/** Each bounded receipt tail is atomic; completed tails never emit their receipts twice. */
export async function replaySupplyPlan(
  db: Db,
  manifest: SupplyCashPlanManifest,
  apply: (db: Db, part: SupplyPlanPart) => Promise<void>
): Promise<SupplyPlanPart[]> {
  if ((await worldIdentity(db)) !== manifest.worldId)
    throw new Error("Supply projection world changed");
  const stored = manifest.chunkKeys.length
    ? await bankMoneyMovesCollection<StoredPlanPart>(db)
        .find({
          _id: { $in: manifest.chunkKeys },
          phase: CHUNK_PHASE,
          status: "applied",
          worldId: manifest.worldId,
          turn: manifest.turn,
        })
        .toArray()
    : [];
  const parts = new Map(stored.map((row) => [row._id, row.result]));
  if (parts.size !== manifest.chunkKeys.length)
    throw new Error("Frozen supply settlement plan is incomplete");
  for (const key of manifest.chunkKeys) {
    const part = parts.get(key)!;
    await withTurnValueSettlement(
      db,
      PROJECTION_PHASE,
      manifest.turn,
      async (db) => {
        await apply(db, part);
        return { deliveries: part.deliveries.length, receipts: part.txEntries.length };
      },
      { sourceKey: key, expectedWorldId: manifest.worldId }
    );
  }
  const receiptKeys = [
    `source-value:${manifest.worldId}:${CASH_PHASE}:${manifest.turn}`,
    ...manifest.chunkKeys,
    ...manifest.chunkKeys.map(
      (key) => `source-value:${manifest.worldId}:${PROJECTION_PHASE}:${key}`
    ),
  ];
  const saved = await bankMoneyMovesCollection<{
    _id: string;
    worldId: string;
    turn: number;
    supplyProjectionsComplete?: boolean;
  }>(db).updateMany(
    {
      _id: { $in: receiptKeys },
      worldId: manifest.worldId,
      turn: manifest.turn,
    },
    { $set: { supplyProjectionsComplete: true } }
  );
  if (saved.matchedCount !== receiptKeys.length)
    throw new Error("Supply receipts disappeared before projection completion");
  return manifest.chunkKeys.map((key) => parts.get(key)!);
}
