import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import {
  BALANCE_CHECKPOINTS_COLLECTION,
  BALANCE_SNAPSHOTS_COLLECTION,
  writeBalanceSnapshot,
  writePreForexBalanceCheckpoint,
} from "../balanceSnapshot";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException }));

describe("balance snapshot replay", () => {
  beforeEach(() => captureException.mockClear());

  it.each([
    ["closing snapshots", BALANCE_SNAPSHOTS_COLLECTION, writeBalanceSnapshot],
    ["pre-Forex checkpoints", BALANCE_CHECKPOINTS_COLLECTION, writePreForexBalanceCheckpoint],
  ] as const)(
    "replays %s while preserving its stored _id",
    async (_label, collectionName, write) => {
      const memory = createInMemoryDb();
      const db = memory as unknown as Db;
      const originalId = new ObjectId();
      const originalCreatedAt = new Date("2026-10-06T00:00:00.000Z");
      memory.seed(collectionName, [
        {
          _id: originalId,
          turn: 7,
          createdAt: originalCreatedAt,
          balances: { "character:x:USD": 1 },
        },
      ]);

      // The in-memory driver's replaceOne intentionally keeps _id, while Mongo
      // rejects an explicit replacement with a different _id. Model that server
      // invariant so this test catches the production replay failure.
      const collection = db.collection(collectionName);
      vi.spyOn(collection, "replaceOne").mockRejectedValue(
        new Error("After applying the update, the immutable field '_id' was altered")
      );

      await write(db, 7);

      const stored = await collection.findOne({ turn: 7 });
      expect(stored?._id).toEqual(originalId);
      expect(stored?.createdAt).not.toEqual(originalCreatedAt);
      expect(captureException).not.toHaveBeenCalled();
    }
  );
});

it("includes withheld operating cash in the corporation balance until settlement", async () => {
  const memory = createInMemoryDb();
  const id = new ObjectId();
  memory.seed("corporations", [
    {
      _id: id,
      countryId: "US",
      liquidCurrencyCode: "USD",
      liquidCapital: 70,
      pendingOperatingCash: 30,
    },
  ]);
  await writeBalanceSnapshot(memory as unknown as Db, 3);
  const stored = await memory.collection(BALANCE_SNAPSHOTS_COLLECTION).findOne({ turn: 3 });
  expect((stored?.balances as Record<string, number>)[`corporation:${id}:USD`]).toBe(100);
});

it("snapshots a legacy-currency producer wallet at 1:1 instead of dropping the snapshot", async () => {
  const memory = createInMemoryDb();
  const legacyWalletId = JSON.stringify(["epoch-1", "households", "FR", "FR_IDF", "FRF"]);
  const usdWalletId = JSON.stringify(["epoch-1", "households", "US", "DC", "USD"]);
  memory.seed("gameState", [{ _id: "current", worldEpochId: "epoch-1" }]);
  memory.seed("exchangeRates", [{ _id: "US", currencyCode: "USD", rate: 1 }]);
  memory.seed("producerEconomyAccounts", [
    { _id: legacyWalletId, worldEpoch: "epoch-1", currency: "FRF", cash: 3261.39 },
    { _id: usdWalletId, worldEpoch: "epoch-1", currency: "USD", cash: 100 },
  ]);
  const corpId = new ObjectId();
  memory.seed("corporations", [{ _id: corpId, liquidCurrencyCode: "USD", liquidCapital: 50 }]);

  const written = await writeBalanceSnapshot(memory as unknown as Db, 5);
  const stored = await memory.collection(BALANCE_SNAPSHOTS_COLLECTION).findOne({ turn: 5 });
  const balances = stored?.balances as Record<string, number>;

  expect(captureException).not.toHaveBeenCalled();
  expect(written).toBeGreaterThan(0);
  expect(balances[`corporation:${corpId}:USD`]).toBe(50);
  expect(balances[`economy_wallet:${usdWalletId}:USD`]).toBe(100);
  // No observed FRF rate: the emit-side fallback values it 1:1.
  expect(balances[`economy_wallet:${legacyWalletId}:FRF`]).toBeCloseTo(3261.39);
});
