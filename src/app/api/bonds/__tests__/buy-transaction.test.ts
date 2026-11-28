import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { POST } from "../[bondId]/buy/route";
import { POST as sell } from "../[bondId]/sell/route";
const host = vi.hoisted(() => ({ db: undefined as Db | undefined, userId: "" }));
vi.mock("@/lib/mongodb", () => ({ getDb: async () => host.db }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireBasicAuth: async () => ({ ok: true, user: { userId: host.userId } }),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: () => ({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => true }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
let f: ReturnType<typeof createTransactionalMemoryDb>;
const owner = new ObjectId(),
  buyer = new ObjectId(),
  corp = new ObjectId(),
  issuer = new ObjectId(),
  bond = new ObjectId();
beforeEach(() => {
  f = createTransactionalMemoryDb();
  host.db = f.db;
  host.userId = owner.toString();
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 10,
      worldEpochId: "fixture",
      forexEnabled: true,
      isProcessing: false,
    },
  ]);
  f.memory.seed("users", [
    {
      _id: owner,
      activeCharacterId: buyer,
      activeCharacterType: "regular",
      activeImperialCharacterId: buyer,
    },
  ]);
  const saver = {
    _id: buyer,
    userId: owner,
    name: "Synthetic investor",
    countryId: "US",
    currencyBalances: { personal: { USD: 10000 }, campaign: 0, savings: {} },
  };
  f.memory.seed("characters", [saver]);
  f.memory.seed("imperialCharacters", [saver]);
  f.memory.seed("corporations", [
    {
      _id: corp,
      userId: owner,
      name: "Synthetic buyer",
      liquidCapital: 10000,
      liquidCurrencyCode: "USD",
      countryId: "US",
    },
    { _id: issuer, ceoId: new ObjectId() },
  ]);
  f.memory.seed("bonds", [
    {
      _id: bond,
      corporationId: issuer,
      currencyCode: "USD",
      countryId: "US",
      issuerType: "sovereign",
      faceValue: 1000,
      totalIssued: 100000,
      marketPrice: 1,
      publicFloat: 100,
      holders: [],
      matured: false,
      defaulted: false,
    },
  ]);
  f.memory.seed("exchangeRates", [{ _id: "US", currencyCode: "USD", rate: 1 }]);
  f.memory.seed("bondMarketPools", [{ _id: "USD", cashLocal: 0, targetCashLocal: 0 }]);
});
it.each(["character", "imperial", "corporation"])(
  "rolls back %s wallet, bond units and pool on lost pool acknowledgement and accepts one racing retry",
  async (kind) => {
    if (kind === "imperial") f.memory.collection("users").docs[0].activeCharacterType = "imperial";
    const run = () =>
      POST(
        new Request(
          `http://localhost/api/bonds/${bond}/buy${kind === "corporation" ? `?corporationId=${corp}` : ""}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ units: 1, requestId: "same" }),
          }
        ),
        { params: Promise.resolve({ bondId: bond.toString() }) }
      );
    const fault = withInjectedCrash(f.memory, {
      collection: "bondMarketPools",
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    Object.assign(fault.db, { client: f.db.client });
    host.db = fault.db;
    expect((await run()).status).toBe(500);
    expect(f.memory.collection("bonds").docs[0]).toMatchObject({ publicFloat: 100, holders: [] });
    expect(f.memory.collection("bondMarketPools").docs[0].cashLocal).toBe(0);
    expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(10000);
    expect(f.memory.collection("characters").docs[0].currencyBalances).toMatchObject({
      personal: { USD: 10000 },
    });
    fault.disarm();
    host.db = f.db;
    const responses = await Promise.all([run(), run()]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const body = (await responses[0].json()) as { cost: number };
    expect(f.memory.collection("bonds").docs[0].publicFloat).toBe(99);
    expect(f.memory.collection("bondMarketPools").docs[0].cashLocal).toBe(body.cost);
    if (kind === "corporation")
      expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(10000 - body.cost);
    else
      expect(
        (
          f.memory.collection(kind === "imperial" ? "imperialCharacters" : "characters").docs[0]
            .currencyBalances as { personal: { USD: number } }
        ).personal.USD
      ).toBe(10000 - body.cost);
  }
);

it.each(["character", "imperial", "corporation"])(
  "keeps %s sale units and payout paired after a lost payout acknowledgement and overlapping retry",
  async (kind) => {
    if (kind === "imperial") f.memory.collection("users").docs[0].activeCharacterType = "imperial";
    const path = `http://localhost/api/bonds/${bond}/${kind === "corporation" ? `sell?corporationId=${corp}` : "sell"}`;
    const run = () =>
      sell(
        new Request(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ units: 1, requestId: "sale" }),
        }),
        { params: Promise.resolve({ bondId: bond.toString() }) }
      );
    const holderKey =
      kind === "corporation"
        ? "corporationId"
        : kind === "imperial"
          ? "imperialCharacterId"
          : "characterId";
    f.memory.collection("bonds").docs[0].holders = [
      { [holderKey]: kind === "corporation" ? corp : buyer, units: 1 },
    ];
    f.memory.collection("bondMarketPools").docs[0].cashLocal = 10000;
    const collection =
      kind === "corporation"
        ? "corporations"
        : kind === "imperial"
          ? "imperialCharacters"
          : "characters";
    const fault = withInjectedCrash(f.memory, {
      collection,
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    Object.assign(fault.db, { client: f.db.client });
    host.db = fault.db;
    expect((await run()).status).toBe(500);
    expect(f.memory.collection("bonds").docs[0]).toMatchObject({
      holders: [{ units: 1 }],
      publicFloat: 100,
    });
    expect(f.memory.collection("bondMarketPools").docs[0].cashLocal).toBe(10000);
    fault.disarm();
    host.db = f.db;
    const responses = await Promise.all([run(), run()]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const reply = (await responses[0].json()) as { proceeds: number; unitsSold: number };
    expect(reply.unitsSold).toBe(1);
    expect(f.memory.collection("bondMarketPools").docs[0].cashLocal).toBe(10000 - reply.proceeds);
    expect(
      f.memory.collection("financialTxLog").docs.filter((r) => r.type === "bond_sell")
    ).toHaveLength(1);
  }
);
it("acknowledges a provably paid legacy sale on its original units and proceeds, not the new request quote", async () => {
  const intent = new ObjectId();
  f.memory.collection("bonds").docs[0].holders = [
    { characterId: buyer, units: 0, saleIntentId: intent },
  ];
  f.memory.collection("bondMarketPools").docs[0].cashLocal = 10000;
  f.memory.seed("bondSaleIntents", [
    {
      _id: intent,
      bondId: bond,
      holderKey: "characterId",
      holderId: buyer,
      sellerCollection: "characters",
      units: 1,
      proceedsLocal: 970,
      poolCurrency: "USD",
      payoutInc: { "currencyBalances.personal.USD": 970 },
      status: "claimed",
      claimApplied: true,
      poolDebited: true,
      payoutApplied: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  const response = await sell(
    new Request(`http://localhost/api/bonds/${bond}/sell`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ units: 2, requestId: "resume" }),
    }),
    { params: Promise.resolve({ bondId: bond.toString() }) }
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ unitsSold: 1, proceeds: 970, pricePerUnit: 970 });
  expect(
    f.memory.collection("financialTxLog").docs.find((r) => r.type === "bond_sell")
  ).toMatchObject({ amount: 970, meta: { units: 1, pricePerUnit: 970 } });
  expect(f.memory.collection("characters").docs[0].currencyBalances).toMatchObject({
    personal: { USD: 10000 },
  });
});
it("retains an ambiguous legacy payout instead of trusting a missing rolled-off target stamp", async () => {
  const intent = new ObjectId();
  f.memory.collection("bonds").docs[0].holders = [
    { characterId: buyer, units: 0, saleIntentId: intent },
  ];
  f.memory.collection("bondMarketPools").docs[0].cashLocal = 10000;
  f.memory.seed("bondSaleIntents", [
    {
      _id: intent,
      bondId: bond,
      holderKey: "characterId",
      holderId: buyer,
      sellerCollection: "characters",
      units: 1,
      proceedsLocal: 970,
      poolCurrency: "USD",
      payoutInc: { "currencyBalances.personal.USD": 970 },
      status: "claimed",
      claimApplied: true,
      poolDebited: true,
      payoutApplied: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  const response = await sell(
    new Request(`http://localhost/api/bonds/${bond}/sell`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ units: 1, requestId: "resume" }),
    }),
    { params: Promise.resolve({ bondId: bond.toString() }) }
  );
  expect(response.status).toBe(400);
  expect(f.memory.collection("characters").docs[0].currencyBalances).toMatchObject({
    personal: { USD: 10000 },
  });
  expect(f.memory.collection("bondSaleIntents").docs[0].status).toBe("claimed");
});
