import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { getDb } from "@/lib/mongodb";
import { processCaucusTax } from "./caucusTax";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/utils/fundGeneration", () => ({
  projectCharacterGeneration: () => 10_000,
  projectNppGeneration: () => 1000,
}));
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTxBulk: vi.fn().mockResolvedValue(undefined),
  loadTxThresholds: async () => ({}),
}));
vi.mock("@/lib/audit/recordAudit", () => ({
  recordAudit: () => undefined,
  recordAuditBulk: () => undefined,
}));
beforeEach(() => vi.clearAllMocks());
function setup() {
  const f = createTransactionalMemoryDb(),
    caucus = new ObjectId(),
    member = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 99, preset: "2027-default" }]);
  f.memory.seed("states", [{ _id: "TX", countryId: "US", population: 100000, gdp: 1000000 }]);
  f.memory.seed("caucuses", [
    {
      _id: caucus,
      countryId: "US",
      partyId: "1",
      name: "Synthetic",
      disbandedAt: null,
      taxRate: 10,
      treasury: 0,
    },
  ]);
  f.memory.seed("caucusMemberships", [
    {
      _id: new ObjectId(),
      caucusId: caucus,
      memberId: member,
      memberType: "character",
      status: "active",
    },
  ]);
  f.memory.seed("characters", [
    {
      _id: member,
      countryId: "US",
      homeState: "TX",
      name: "Synthetic",
      currencyBalances: { campaign: 2000 },
    },
  ]);
  vi.mocked(getDb).mockResolvedValue(f.db);
  return { ...f, caucus, member, run: () => processCaucusTax(true, 100) };
}
it("collects a caucus once across overlapping phase retries and uses the processing turn in its receipt", async () => {
  const f = setup();
  const results = await Promise.all([f.run(), f.run()]);
  expect(results.reduce((n, r) => n + r.totalTaxed, 0)).toBe(1000);
  expect(f.memory.collection("caucuses").docs[0]).toMatchObject({
    treasury: 1000,
    lastTaxTurn: 100,
  });
  expect(f.memory.collection("characters").docs[0].currencyBalances).toEqual({ campaign: 1000 });
  expect(f.memory.collection("treasuryTransactions").docs).toHaveLength(1);
  expect(f.memory.collection("treasuryTransactions").docs[0].turn).toBe(100);
});
it("rolls back an unacknowledged member debit before trying the caucus again", async () => {
  const f = setup(),
    characters = f.memory.collection("characters"),
    update = characters.updateOne.bind(characters);
  vi.spyOn(characters, "updateOne").mockImplementationOnce(async (...args) => {
    await update(...args);
    throw new Error("lost member debit acknowledgement");
  });
  expect((await f.run()).totalTaxed).toBe(0);
  expect(characters.docs[0].currencyBalances).toEqual({ campaign: 2000 });
  expect(f.memory.collection("caucuses").docs[0].lastTaxTurn).toBeUndefined();
  expect((await f.run()).totalTaxed).toBe(1000);
  expect(f.memory.collection("caucuses").docs[0].treasury).toBe(1000);
});
it("aborts treasury credit and the source tax if the tax receipt is interrupted", async () => {
  const f = setup();
  vi.spyOn(f.memory.collection("treasuryTransactions"), "insertOne").mockRejectedValueOnce(
    new Error("interrupted tax receipt")
  );
  expect((await f.run()).totalTaxed).toBe(0);
  expect(f.memory.collection("characters").docs[0].currencyBalances).toEqual({ campaign: 2000 });
  expect(f.memory.collection("caucuses").docs[0].treasury).toBe(0);
  expect(f.memory.collection("caucuses").docs[0].lastTaxTurn).toBeUndefined();
  expect((await f.run()).totalTaxed).toBe(1000);
});
it("lets another caucus complete when one fails and does not tax that completed caucus twice", async () => {
  const f = setup(),
    other = new ObjectId(),
    member = new ObjectId();
  await f.memory.collection("caucuses").insertOne({
    _id: other,
    countryId: "US",
    partyId: "2",
    name: "Other",
    disbandedAt: null,
    taxRate: 10,
    treasury: 0,
  });
  await f.memory.collection("caucusMemberships").insertOne({
    _id: new ObjectId(),
    caucusId: other,
    memberId: member,
    memberType: "character",
    status: "active",
  });
  await f.memory.collection("characters").insertOne({
    _id: member,
    countryId: "US",
    homeState: "TX",
    currencyBalances: { campaign: 2000 },
  });
  vi.spyOn(f.memory.collection("treasuryTransactions"), "insertOne").mockRejectedValueOnce(
    new Error("first caucus interrupted")
  );
  expect((await f.run()).totalTaxed).toBe(1000);
  expect((await f.run()).totalTaxed).toBe(1000);
  expect(f.memory.collection("caucuses").docs.map((row) => row.treasury)).toEqual([1000, 1000]);
});
