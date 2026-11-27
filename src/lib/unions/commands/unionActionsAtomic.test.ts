import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Character } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { fundUnionTreasury } from "./fundUnionTreasury";
import { organizeSector } from "./organizeSector";
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
vi.mock("@/lib/unions/unionProsecutionBar", () => ({
  isUnionProsecutionBarred: async () => false,
  UNION_PROSECUTION_MESSAGE: "Blocked",
}));
vi.mock("@/lib/labour/unionLaws", () => ({
  isUnionsBanned: async () => false,
  UNIONS_BANNED_MESSAGE: "Banned",
}));
beforeEach(() => vi.clearAllMocks());
function setup() {
  const f = createTransactionalMemoryDb();
  const character = {
    _id: new ObjectId(),
    countryId: "US",
    name: "Synthetic",
    funds: 1000,
    actions: 100,
  } as Character;
  const union = new ObjectId(),
    sector = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 10, isProcessing: false }]);
  f.memory.seed("characters", [{ ...character }]);
  f.memory.seed("unions", [
    {
      _id: union,
      ownerId: character._id,
      countryId: "US",
      sectorType: "manufacturing",
      name: "Synthetic",
      treasury: 1_000_000,
      approval: 100,
    },
  ]);
  f.memory.seed("corporateSectors", [
    { _id: sector, countryId: "US", sectorType: "manufacturing", workers: 1, unionization: 0 },
  ]);
  return { ...f, character, union, sector };
}
it("rolls back an unacknowledged contribution credit, then cannot overspend on overlapping retries", async () => {
  const f = setup(),
    unions = f.memory.collection("unions"),
    update = unions.updateOne.bind(unions);
  vi.spyOn(unions, "updateOne").mockImplementationOnce(async (...args) => {
    await update(...args);
    throw new Error("lost union credit acknowledgement");
  });
  const run = () => fundUnionTreasury(f.db, f.character, String(f.union), 750);
  await expect(run()).rejects.toThrow("lost union credit acknowledgement");
  expect(f.memory.collection("characters").docs[0].funds).toBe(1000);
  expect(unions.docs[0].treasury).toBe(1_000_000);
  const results = await Promise.all([run(), run()]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(f.memory.collection("characters").docs[0].funds).toBe(250);
  expect(unions.docs[0].treasury).toBe(1_000_750);
});
it("restores action points, treasury and representation when sector publication fails", async () => {
  const f = setup(),
    sectors = f.memory.collection("corporateSectors"),
    update = sectors.updateOne.bind(sectors);
  vi.spyOn(sectors, "updateOne").mockImplementationOnce(async (...args) => {
    await update(...args);
    throw new Error("interrupted organizing publication");
  });
  const run = () => organizeSector(f.db, f.character, String(f.union), String(f.sector));
  await expect(run()).rejects.toThrow("interrupted organizing publication");
  expect(f.memory.collection("characters").docs[0].actions).toBe(100);
  expect(f.memory.collection("unions").docs[0].treasury).toBe(1_000_000);
  expect(sectors.docs[0].unionization).toBe(0);
  expect((await run()).ok).toBe(true);
  expect(sectors.docs[0].unionization).toBeGreaterThan(0);
});
it("rolls back the action debit when the treasury guard declines", async () => {
  const f = setup();
  vi.spyOn(f.memory.collection("unions"), "updateOne").mockResolvedValueOnce({
    matchedCount: 0,
    modifiedCount: 0,
    upsertedCount: 0,
    upsertedId: null,
  });
  expect((await organizeSector(f.db, f.character, String(f.union), String(f.sector))).ok).toBe(
    false
  );
  expect(f.memory.collection("characters").docs[0].actions).toBe(100);
  expect(f.memory.collection("gameState").docs[0].economicCommandRevision).toBeUndefined();
});
it("refuses contributions during active or abandoned turn processing", async () => {
  const f = setup();
  await f.memory
    .collection("gameState")
    .updateOne({ _id: "current" }, { $set: { isProcessing: true } });
  expect((await fundUnionTreasury(f.db, f.character, String(f.union), 100)).ok).toBe(false);
  expect(f.memory.collection("characters").docs[0].funds).toBe(1000);
});
