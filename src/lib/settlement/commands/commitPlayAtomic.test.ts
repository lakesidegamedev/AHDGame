import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { commitSettlementPlay } from "./commitPlay";
const ids = vi.hoisted(() => ({ crisis: "" }));
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("../actorContext", () => ({
  loadSettlementActorContext: async () => ({
    crisisId: ids.crisis,
    seat: { id: "DD", direction: 1 },
  }),
}));
vi.mock("../playCost", () => ({
  seatFundsLocal: () => 10,
  resolvePersonalFunds: async () => ({ local: 10, field: "funds", balanceLocal: 100 }),
}));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
let f: ReturnType<typeof createTransactionalMemoryDb>;
const actor = new ObjectId();
beforeEach(() => {
  f = createTransactionalMemoryDb();
  ids.crisis = new ObjectId().toString();
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 10,
      worldEpochId: "fixture",
      preset: "1991-default",
      isProcessing: false,
    },
  ]);
  f.memory.seed("gameConfig", [{ _id: "default", treasuryCashLedgerEnabled: true }]);
  f.memory.seed("settlementCrises", [
    {
      _id: new ObjectId(ids.crisis),
      status: "open",
      seats: [{ id: "DD", capital: 100, actions: 10 }],
    },
  ]);
  f.memory.seed("characters", [{ _id: actor, actions: 10, funds: 100 }]);
  f.memory.seed("federalBudget", [
    {
      _id: "budget",
      countryId: "DD",
      currencyCode: "USD",
      treasuryCashLocal: 100,
      treasuryBalance: 100,
      debt: { principal: 0 },
    },
  ]);
  f.memory.seed("exchangeRates", [{ _id: "US", currencyCode: "USD", rate: 1 }]);
});
it("charges two distinct funded plays separately but replays the same action identity once", async () => {
  const first = { characterId: actor, actor: "seat" as const, playId: "aid", requestId: "first" };
  expect((await commitSettlementPlay(f.db, first)).ok).toBe(true);
  expect((await commitSettlementPlay(f.db, { ...first, requestId: "second" })).ok).toBe(true);
  expect((await commitSettlementPlay(f.db, first)).ok).toBe(true);
  expect(f.memory.collection("federalBudget").docs[0]).toMatchObject({
    treasuryCashLocal: 80,
    treasuryBalance: 80,
  });
  expect(f.memory.collection("settlementPlays").docs).toHaveLength(2);
});
it.each(["seat", "personal"] as const)(
  "restores %s resources when effect acknowledgement is lost and resolves racing retries once",
  async (actorKind) => {
    const input = {
      characterId: actor,
      actor: actorKind,
      playId: actorKind === "seat" ? "aid" : "letter",
      direction: 1 as const,
      requestId: "same",
    };
    const fault = withInjectedCrash(f.memory, {
      collection: "settlementPlays",
      op: "insertOne",
      onCall: 1,
      afterWrite: true,
    });
    Object.assign(fault.db, { client: f.db.client });
    await expect(commitSettlementPlay(fault.db, input)).rejects.toThrow();
    expect(f.memory.collection("characters").docs[0]).toMatchObject({ actions: 10, funds: 100 });
    expect(f.memory.collection("federalBudget").docs[0].treasuryCashLocal).toBe(100);
    expect(
      (f.memory.collection("settlementCrises").docs[0].seats as { actions: number }[])[0].actions
    ).toBe(10);
    expect(f.memory.collection("settlementPlays").docs).toHaveLength(0);
    fault.disarm();
    await Promise.all([commitSettlementPlay(f.db, input), commitSettlementPlay(f.db, input)]);
    expect(f.memory.collection("settlementPlays").docs).toHaveLength(1);
  }
);
