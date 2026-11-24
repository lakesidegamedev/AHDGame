import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { capitalInjection } from "./capitalInjection";
import { canActOnCorporationAsParent } from "../authorization";
import { controllerTransferBarrierError } from "@/lib/corporations/commands/acquisitions/controllerTransferBarrier";
vi.mock("../authorization", () => ({
  canActOnCorporationAsParent: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/corporations/commands/acquisitions/controllerTransferBarrier", () => ({
  controllerTransferBarrierError: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/corporations/reservedCorporateHoldings", () => ({
  resolveControllingCorporateParent: vi.fn(async () => ({
    corporationId: new ObjectId("000000000000000000000001"),
  })),
}));
vi.mock("@/lib/currency/corporationCapital", async (original) => ({
  ...(await original<typeof import("@/lib/currency/corporationCapital")>()),
  getCorpFxRate: vi.fn(async (_db, corp) => (corp.liquidCurrencyCode === "JPY" ? 150 : 0.9)),
}));
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
const parentId = new ObjectId("000000000000000000000001");
const subId = new ObjectId("000000000000000000000002");
const userId = new ObjectId();
function world(cash = 10_000, subCurrency = "USD") {
  const memory = createInMemoryDb();
  memory.seed("corporations", [
    {
      _id: parentId,
      liquidCapital: cash,
      liquidCurrencyCode: "USD",
      countryId: "US",
      name: "Parent",
    },
    {
      _id: subId,
      liquidCapital: 0,
      liquidCurrencyCode: subCurrency,
      countryId: subCurrency === "JPY" ? "JP" : "US",
      name: "Subsidiary",
    },
  ]);
  return memory;
}
const input = (amount = 1000, turn = 100) => ({
  sub: { _id: subId } as never,
  callerUserId: userId,
  amount,
  turn,
  now: new Date("2026-01-01"),
});
const balances = (memory: ReturnType<typeof world>) =>
  memory.collection("corporations").docs.map((d) => d.liquidCapital);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(canActOnCorporationAsParent).mockResolvedValue(true);
  vi.mocked(controllerTransferBarrierError).mockResolvedValue(null);
});
describe("journaled subsidiary contributions", () => {
  it("conserves cash and replays identical requests without moving it twice", async () => {
    const memory = world();
    const db = memory as unknown as Db;
    expect((await capitalInjection(db, input())).ok).toBe(true);
    expect((await capitalInjection(db, input())).ok).toBe(true);
    expect(balances(memory)).toEqual([9000, 1000]);
    expect(memory.collection("financialTxLog").docs).toHaveLength(2);
    expect(memory.collection("corporations").docs[1].lastCapitalInjectionTurn).toBe(100);
  });
  it("two simultaneous requests own one cooldown slot", async () => {
    const memory = world();
    const db = memory as unknown as Db;
    await Promise.all([capitalInjection(db, input()), capitalInjection(db, input())]);
    expect((await capitalInjection(db, input())).ok).toBe(true);
    expect(balances(memory)).toEqual([9000, 1000]);
    expect(memory.collection("financialTxLog").docs).toHaveLength(2);
  });
  it("a conflicting amount cannot change a frozen transfer", async () => {
    const memory = world();
    const db = memory as unknown as Db;
    await capitalInjection(db, input());
    expect((await capitalInjection(db, input(1500))).ok).toBe(false);
    expect((await capitalInjection(db, input(1000, 101))).ok).toBe(false);
    expect(balances(memory)).toEqual([9000, 1000]);
  });
  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 2501])(
    "rejects invalid or oversized amount %s before writes",
    async (amount) => {
      const memory = world();
      expect((await capitalInjection(memory as unknown as Db, input(amount))).ok).toBe(false);
      expect(balances(memory)).toEqual([10000, 0]);
      expect(memory.collection("bankMoneyMoves").docs).toHaveLength(0);
    }
  );
  it("keeps controller and authorization barriers", async () => {
    const memory = world();
    vi.mocked(canActOnCorporationAsParent).mockResolvedValueOnce(false);
    expect((await capitalInjection(memory as unknown as Db, input())).ok).toBe(false);
    vi.mocked(controllerTransferBarrierError).mockResolvedValueOnce(
      "New characters cannot transfer corporate funds"
    );
    expect((await capitalInjection(memory as unknown as Db, input())).ok).toBe(false);
    expect(balances(memory)).toEqual([10000, 0]);
  });
  it("balances mixed currencies at the frozen quote with no rounded-away principal", async () => {
    const memory = world(1e13, "JPY");
    const amount = 1_000_000_000;
    await capitalInjection(memory as unknown as Db, input(amount));
    const [parent, sub] = balances(memory) as number[];
    expect(parent).toBe(1e13 - amount);
    expect(sub).toBeCloseTo((amount / 0.9) * 150, 3);
    expect((1e13 - parent) / 0.9).toBeCloseTo(sub / 150, 3);
  });
  for (const afterWrite of [false, true])
    for (const boundary of [
      "reservation",
      "debit",
      "credit",
      "cooldown",
      "receipt",
      "completion",
    ] as const) {
      it(`recovers ${afterWrite ? "after" : "before"} ${boundary} without losing or duplicating cash`, async () => {
        const memory = world();
        const fault = withInjectedCrash(memory, {
          onCall: 1,
          afterWrite,
          collection: boundary === "receipt" ? "financialTxLog" : "corporations",
          matches: (args) => {
            const update = args[1] as Record<string, Record<string, unknown>> | undefined;
            if (boundary === "receipt") return true;
            if (boundary === "completion")
              return update?.$set?.["capitalInjectionIntent.completed"] === true;
            if (boundary === "reservation") return Boolean(update?.$set?.capitalInjectionIntent);
            if (boundary === "cooldown") return update?.$set?.lastCapitalInjectionTurn === 100;
            return boundary === "debit"
              ? (update?.$inc?.liquidCapital as number) < 0
              : (update?.$inc?.liquidCapital as number) > 0;
          },
        });
        try {
          await capitalInjection(fault.db, input());
        } catch {
          /* Simulated process interruption. */
        }
        expect(fault.crashed).toBe(true);
        fault.disarm();
        const recovered = await capitalInjection(fault.db, input());
        expect(recovered.ok).toBe(true);
        expect((await capitalInjection(fault.db, input())).ok).toBe(true);
        expect(balances(memory)).toEqual([9000, 1000]);
        expect(memory.collection("financialTxLog").docs).toHaveLength(2);
      });
    }
});
