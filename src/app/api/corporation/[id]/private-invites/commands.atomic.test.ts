import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { POST as respond } from "./[inviteId]/route";
import { POST as create } from "./route";
const host = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  userId: "",
  activeCharacterId: "",
}));
vi.mock("@/lib/mongodb", () => ({ getDb: async () => host.db }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireBasicAuth: async () => ({
    ok: true,
    user: { userId: host.userId, activeCharacterId: host.activeCharacterId },
  }),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: () => ({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => true }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));
let f: ReturnType<typeof createTransactionalMemoryDb>;
const corp = new ObjectId(),
  ceo = new ObjectId(),
  owner = new ObjectId(),
  investor = new ObjectId(),
  investorUser = new ObjectId(),
  invite = new ObjectId();
const request = (body = { action: "accept" }) =>
  new Request("http://localhost/api/corporation/test/private-invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const run = () =>
  respond(request(), {
    params: Promise.resolve({ id: corp.toString(), inviteId: invite.toString() }),
  });
beforeEach(() => {
  f = createTransactionalMemoryDb();
  host.db = f.db;
  host.userId = investorUser.toString();
  host.activeCharacterId = investor.toString();
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 10,
      worldEpochId: "fixture",
      preset: "2027-default",
      isProcessing: false,
    },
  ]);
  f.memory.seed("users", [{ _id: investorUser, activeCharacterId: investor }]);
  f.memory.seed("characters", [
    {
      _id: investor,
      userId: investorUser,
      countryId: "US",
      name: "Synthetic investor",
      currencyBalances: { personal: { USD: 1000 } },
    },
    { _id: ceo, userId: owner, name: "Synthetic issuer" },
  ]);
  f.memory.seed("corporations", [
    {
      _id: corp,
      userId: owner,
      ceoId: ceo,
      countryId: "US",
      isPrivate: true,
      legalStructure: "us_s_corp",
      name: "Synthetic issuer",
      liquidCurrencyCode: "USD",
      liquidCapital: 100,
      totalShares: 100,
      publicFloat: 0,
      shareholders: [{ characterId: ceo, shares: 80 }],
    },
  ]);
  f.memory.seed("corporationShareInvites", [
    {
      _id: invite,
      corporationId: corp,
      invitedCharacterId: investor,
      shares: 20,
      pricePerShare: 5,
      totalCost: 100,
      currencyCode: "USD",
      status: "pending",
      expiresAt: new Date(Date.now() + 100000),
    },
  ]);
  f.memory.seed("exchangeRates", [{ _id: "US", currencyCode: "USD", rate: 1 }]);
});
it.each(["characters", "corporations", "financialTxLog"])(
  "restores invite and cash after a lost %s acknowledgement, then accepts racing retries once",
  async (collection) => {
    const fault = withInjectedCrash(f.memory, {
      collection,
      op:
        collection === "financialTxLog"
          ? "insertOne"
          : collection === "characters"
            ? "findOneAndUpdate"
            : "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    Object.assign(fault.db, { client: f.db.client });
    host.db = fault.db;
    expect((await run()).status).toBe(500);
    expect(
      (
        f.memory.collection("characters").docs[0].currencyBalances as {
          personal: Record<string, number>;
          savings: Record<string, number>;
        }
      ).personal.USD
    ).toBe(1000);
    expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(100);
    expect(f.memory.collection("corporationShareInvites").docs[0].status).toBe("pending");
    fault.disarm();
    host.db = f.db;
    expect((await Promise.all([run(), run()])).map((r) => r.status)).toEqual([200, 200]);
    expect(
      (
        f.memory.collection("characters").docs[0].currencyBalances as {
          personal: Record<string, number>;
          savings: Record<string, number>;
        }
      ).personal.USD
    ).toBe(900);
    expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(200);
    expect(
      (
        f.memory.collection("corporations").docs[0].shareholders as {
          characterId: ObjectId;
          shares: number;
        }[]
      ).find((sh) => sh.characterId.equals(investor))!.shares
    ).toBe(20);
  }
);
it("refuses an offer whose issuer has insufficient unissued shares or changed denomination", async () => {
  f.memory.collection("corporations").docs[0].totalShares = 99;
  expect((await run()).status).toBe(409);
  f.memory.collection("corporations").docs[0].totalShares = 100;
  f.memory.collection("corporations").docs[0].liquidCurrencyCode = "CAD";
  expect((await run()).status).toBe(409);
  expect(
    (
      f.memory.collection("characters").docs[0].currencyBalances as {
        personal: Record<string, number>;
        savings: Record<string, number>;
      }
    ).personal.USD
  ).toBe(1000);
});
it("cannot reserve the same unissued capacity through concurrent invite creations", async () => {
  f.memory.collection("corporationShareInvites").docs.splice(0);
  host.userId = owner.toString();
  host.activeCharacterId = ceo.toString();
  const make = () =>
    create(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitedCharacterId: investor.toString(),
          shares: 20,
          pricePerShare: 5,
        }),
      }),
      { params: Promise.resolve({ id: corp.toString() }) }
    );
  expect((await Promise.all([make(), make()])).map((r) => r.status).sort()).toEqual([200, 400]);
  expect(f.memory.collection("corporationShareInvites").docs).toHaveLength(1);
});
