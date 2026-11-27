import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { POST as deposit } from "./deposit/route";
import { POST as withdraw } from "./withdraw/route";
const host = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  userId: "",
  authoritative: false,
}));
vi.mock("@/lib/mongodb", () => ({ getDb: async () => host.db }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireBasicAuth: async () => ({ ok: true, user: { userId: host.userId } }),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: () => ({ ok: true }),
  SAVINGS_WALLET_LIMITS: { maxRequests: 10, windowMs: 1000 },
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => true }));
vi.mock("@/lib/banking/policy", () => ({
  loadBankingPolicy: async () => ({
    savingsAccounts: host.authoritative ? "authoritative" : "shadow",
    privateBanking: false,
  }),
}));
vi.mock("@/lib/banking/auditEvents", () => ({ emitBankingAuditEvent: vi.fn() }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
let world: ReturnType<typeof createTransactionalMemoryDb>;
const owner = new ObjectId();
const request = (amount = 200, requestId = "same-request", currency = "CAD") =>
  new Request("http://localhost/api/character/savings/deposit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, currency, requestId }),
  });
beforeEach(() => {
  host.authoritative = false;
  world = createTransactionalMemoryDb();
  host.db = world.db;
  host.userId = new ObjectId().toString();
  world.memory.seed("gameState", [
    { _id: "current", currentTurn: 10, worldEpochId: "fixture", isProcessing: false },
  ]);
  world.memory.seed("users", [{ _id: new ObjectId(host.userId), activeCharacterId: owner }]);
  world.memory.seed("characters", [
    {
      _id: owner,
      userId: new ObjectId(host.userId),
      name: "Synthetic saver",
      countryId: "CA",
      savingsAccountsOpened: { CAD: true, JPY: true },
      currencyBalances: {
        personal: { CAD: 1000, JPY: 1000000000000 },
        savings: { CAD: 100, JPY: 0 },
      },
    },
  ]);
  world.memory.seed("exchangeRates", [
    { _id: "CA", currencyCode: "CAD", rate: 2 },
    { _id: "JP", currencyCode: "JPY", rate: 150 },
  ]);
});
const balances = () =>
  world.memory.collection("characters").docs[0].currencyBalances as {
    personal: Record<string, number>;
    savings: Record<string, number>;
  };
it.each(["deposit", "withdraw"])(
  "rolls back a %s whose ledger acknowledgement is lost, then accepts racing retries once",
  async (action) => {
    const run = action === "deposit" ? deposit : withdraw;
    const fault = withInjectedCrash(world.memory, {
      collection: "savingsLedger",
      op: "insertOne",
      onCall: 1,
      afterWrite: true,
    });
    Object.assign(fault.db, { client: world.db.client });
    host.db = fault.db;
    expect((await run(request(50))).status).toBe(500);
    expect(balances()).toMatchObject({ personal: { CAD: 1000 }, savings: { CAD: 100 } });
    expect(world.memory.collection("financialTxLog").docs).toHaveLength(0);
    fault.disarm();
    host.db = world.db;
    const responses = await Promise.all([run(request(50)), run(request(50))]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(balances()).toMatchObject({
      personal: { CAD: action === "deposit" ? 950 : 1050 },
      savings: { CAD: action === "deposit" ? 150 : 50 },
    });
    expect(world.memory.collection("savingsLedger").docs).toHaveLength(1);
    expect((await run(request(51))).status).toBe(409);
  }
);
it("keeps large foreign balances conserved and freezes the accepted result across turns", async () => {
  expect((await deposit(request(500000000000, "large", "JPY"))).status).toBe(200);
  await world.db
    .collection("gameState")
    .updateOne({ _id: "current" as never }, { $set: { currentTurn: 11 } });
  expect((await deposit(request(500000000000, "large", "JPY"))).status).toBe(200);
  expect(balances()).toMatchObject({
    personal: { JPY: 500000000000 },
    savings: { JPY: 500000000000 },
  });
  expect(world.memory.collection("savingsLedger").docs).toHaveLength(1);
});
it("refuses commands while a turn is processing without changing balances", async () => {
  world.memory.collection("gameState").docs[0].isProcessing = true;
  expect((await deposit(request())).status).toBe(409);
  expect(balances().personal.CAD).toBe(1000);
});

it("rolls back authoritative account, backing cash and liability with a lost final receipt", async () => {
  host.authoritative = true;
  world.memory.seed("centralBanks", [
    { _id: "CA", countryId: "CA", externalBroadMoney: 5000, householdSavingsLiability: 0 },
  ]);
  const fault = withInjectedCrash(world.memory, {
    collection: "savingsLedger",
    op: "insertOne",
    onCall: 1,
    afterWrite: true,
  });
  Object.assign(fault.db, { client: world.db.client });
  host.db = fault.db;
  expect((await deposit(request(50))).status).toBe(500);
  expect(balances().personal.CAD).toBe(1000);
  expect(world.memory.collection("savingsAccounts").docs).toHaveLength(0);
  expect(world.memory.collection("centralBanks").docs[0]).toMatchObject({
    externalBroadMoney: 5000,
    householdSavingsLiability: 0,
  });
  fault.disarm();
  host.db = world.db;
  const responses = await Promise.all([deposit(request(50)), deposit(request(50))]);
  expect(responses.map((r) => r.status)).toEqual([200, 200]);
  expect(balances()).toMatchObject({ personal: { CAD: 950 }, savings: { CAD: 150 } });
  expect(world.memory.collection("savingsAccounts").docs).toHaveLength(1);
  expect(world.memory.collection("savingsAccounts").docs[0].balance).toBe(150);
  expect(world.memory.collection("centralBanks").docs[0]).toMatchObject({
    externalBroadMoney: 5050,
    householdSavingsLiability: 150,
  });
});
