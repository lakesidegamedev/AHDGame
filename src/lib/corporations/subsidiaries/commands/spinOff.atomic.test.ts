import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { spinOff } from "./spinOff";
vi.mock("@/lib/economy/queries/privateEnterpriseGate", () => ({
  isPrivateEnterpriseBlocked: async () => false,
}));
vi.mock("@/lib/mechanicalLaws/guards", () => ({
  assertSubsidiaryWithinCap: async () => undefined,
}));
vi.mock("@/lib/currency/corporationCapital", async (original) => ({
  ...(await original<typeof import("@/lib/currency/corporationCapital")>()),
  getCorpFxRate: async () => 1,
}));
vi.mock("@/lib/nationalization/treasury", () => ({
  creditTreasuryProceedsPaired: async (
    db: import("mongodb").Db,
    input: { countryId: string; amountLocal: number }
  ) => {
    await db
      .collection("federalBudget")
      .updateOne({ countryId: input.countryId }, { $inc: { cash: input.amountLocal } });
    return input.amountLocal;
  },
}));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
function world() {
  const f = createTransactionalMemoryDb();
  const parentId = new ObjectId(),
    user = new ObjectId(),
    ceo = new ObjectId(),
    appointed = new ObjectId(),
    newUser = new ObjectId(),
    site = new ObjectId();
  const parent = {
    _id: parentId,
    name: "Parent",
    countryId: "US",
    headquartersState: "TX",
    userId: user,
    ceoId: ceo,
    ceoType: "character",
    liquidCapital: 1e8,
    liquidCurrencyCode: "USD",
    totalShares: 100,
    publicFloat: 0,
    shareholders: [],
  } as unknown as Corporation;
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 1000, currentYear: 2027, preset: "2027-default" },
  ]);
  f.memory.seed("corporations", [{ ...parent }]);
  f.memory.seed("characters", [
    { _id: ceo, userId: user },
    { _id: appointed, userId: newUser },
  ]);
  f.memory.seed("federalBudget", [{ countryId: "US", cash: 100 }]);
  f.memory.seed("corporateSectors", [
    {
      _id: site,
      corporationId: parentId,
      countryId: "US",
      stateId: "TX",
      sectorType: "technology",
      strategyId: "software",
      revenue: 10000,
      currentGrowthCost: 100,
      capitalStock: 500,
      capacityBookAnchor: 10000,
      inventoryUnits: { technology: 25 },
      inventoryValueAnchor: 500,
      constructionInProgressAnchor: 2000,
      buildQueue: [
        { id: "paid-build", costPaidAnchor: 2000, targetCapacity: 50, completesAtTurn: 1005 },
      ],
    },
  ]);
  const input = {
    parent,
    callerUserId: user,
    callerCharacterId: ceo.toHexString(),
    sectorType: "technology" as const,
    name: "Subsidiary",
    tickerSymbol: "SUB",
    appointedCeoType: "character" as const,
    appointedCeoCharacterId: appointed,
    turn: 1000,
    now: new Date(0),
  };
  return { ...f, parentId, site, input };
}
describe("atomic subsidiary spin-off", () => {
  it.each(["corporations", "corporateSectors", "federalBudget"])(
    "rolls back a landed %s write and retains paid construction",
    async (collection) => {
      const f = world(),
        fault = withInjectedCrash(f.memory, {
          collection,
          op: collection === "corporations" ? "insertOne" : "updateOne",
          onCall: 1,
          afterWrite: true,
        });
      await expect(spinOff(fault.db, f.input)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(await f.db.collection("corporations").countDocuments({})).toBe(1);
      expect(
        (await f.db.collection("corporations").findOne({ _id: f.parentId }))?.liquidCapital
      ).toBe(1e8);
      expect((await f.db.collection("federalBudget").findOne({}))?.cash).toBe(100);
      const before = await f.db.collection("corporateSectors").findOne({ _id: f.site });
      expect(before?.corporationId.equals(f.parentId)).toBe(true);
      expect(before?.constructionPropertyTransition).toBeUndefined();
      fault.disarm();
      const results = await Promise.all([spinOff(f.db, f.input), spinOff(f.db, f.input)]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      const after = await f.db.collection("corporateSectors").findOne({ _id: f.site });
      expect(after?.corporationId.equals(f.parentId)).toBe(false);
      for (const field of [
        "capitalStock",
        "capacityBookAnchor",
        "inventoryUnits",
        "inventoryValueAnchor",
        "buildQueue",
        "constructionInProgressAnchor",
        "strategyId",
      ])
        expect(after?.[field]).toEqual(before?.[field]);
      const corp = await f.db.collection("corporations").findOne({ _id: f.parentId }),
        treasury = await f.db.collection("federalBudget").findOne({});
      expect(corp!.liquidCapital + treasury!.cash).toBe(1e8 + 100);
    }
  );
});
