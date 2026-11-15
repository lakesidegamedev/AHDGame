import { expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { retireDissolvedCorporationCash } from "./dissolutionCash";
import type { LedgerEntry } from "@/lib/ledger/types";

it.each([
  [200, 0, 0],
  [-200, 0, 0],
  [300, 50, 100],
  [-200, 50, 0],
  [0, 0, 0],
])(
  "retires signed cash and pending income once (%s, %s, asset credit %s)",
  async (liquidCapital, pendingOperatingCash, assetLiquidationCredit) => {
    const memory = createInMemoryDb(),
      id = new ObjectId(),
      db = memory as unknown as Db;
    memory.seed("corporations", [{ _id: id, liquidCapital, pendingOperatingCash }]);
    const input = {
      corporation: id.toHexString(),
      currency: "CAD" as const,
      rate: 1.25,
      liquidCapital,
      pendingOperatingCash,
      assetLiquidationCredit,
      turn: 31,
      now: new Date(),
    };
    await retireDissolvedCorporationCash(db, input);
    expect(memory.collection("corporations").docs[0]).toMatchObject({
      liquidCapital: 0,
      pendingOperatingCash: 0,
    });
    await memory.collection("corporations").deleteOne({ _id: id });
    await retireDissolvedCorporationCash(db, { ...input, turn: 99, rate: 2 });
    const entries = memory.collection("ledgerEntries").docs as unknown as LedgerEntry[];
    expect(entries).toHaveLength(
      liquidCapital || pendingOperatingCash || assetLiquidationCredit ? 1 : 0
    );
    const primary = entries.flatMap((e) => e.legs).filter((l) => l.role === "primary");
    expect(primary.reduce((sum, leg) => sum + leg.anchorAmount, 0)).toBeCloseTo(
      -(liquidCapital + pendingOperatingCash - assetLiquidationCredit) / 1.25,
      8
    );
    expect(
      entries.every(
        (e) => e.turn === 31 && Math.abs(e.legs.reduce((sum, l) => sum + l.anchorAmount, 0)) < 0.001
      )
    ).toBe(true);
  }
);

it("recovers an inserted witness without retiring cash twice", async () => {
  const memory = createInMemoryDb(),
    id = new ObjectId();
  memory.seed("corporations", [{ _id: id, liquidCapital: 200, pendingOperatingCash: 0 }]);
  const fault = withInjectedCrash(memory, {
    collection: "ledgerEntries",
    op: "insertOne",
    onCall: 1,
    afterWrite: true,
  });
  await retireDissolvedCorporationCash(fault.db, {
    corporation: id.toHexString(),
    currency: "USD",
    rate: 1,
    liquidCapital: 200,
    pendingOperatingCash: 0,
    assetLiquidationCredit: 0,
    turn: 31,
    now: new Date(),
  });
  expect(fault.crashed).toBe(true);
  expect(memory.collection("corporations").docs[0]!.liquidCapital).toBe(0);
  expect(memory.collection("ledgerEntries").docs).toHaveLength(1);
});

it("refuses an obsolete cash quote before publishing a retirement", async () => {
  const memory = createInMemoryDb(),
    id = new ObjectId();
  memory.seed("corporations", [{ _id: id, liquidCapital: 100, pendingOperatingCash: 0 }]);
  await expect(
    retireDissolvedCorporationCash(memory as unknown as Db, {
      corporation: id.toHexString(),
      currency: "USD",
      rate: 1,
      liquidCapital: 200,
      pendingOperatingCash: 0,
      assetLiquidationCredit: 0,
      turn: 31,
      now: new Date(),
    })
  ).rejects.toThrow();
  expect(memory.collection("corporations").docs[0]!.liquidCapital).toBe(100);
  expect(memory.collection("ledgerEntries").docs).toHaveLength(0);
});
