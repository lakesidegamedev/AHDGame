import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { runHostileTakeover } from "./hostileTakeover";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/requireCorporationActions", () => ({
  requireCorporationActionsEnabled: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/mechanicalLaws/guards", () => ({
  assertForeignControlAllowed: vi.fn().mockResolvedValue(null),
  assertSubsidiaryWithinCap: vi.fn().mockResolvedValue(null),
  wouldGainControl: vi.fn().mockReturnValue(false),
}));
vi.mock("../acquisitions/referenceValuation", () => ({
  referenceValuation: vi.fn().mockResolvedValue({ minimumPriceAnchor: 0, portfolioAnchor: 0 }),
}));
vi.mock("@/lib/corporations/operatingReserveGuard", () => ({
  checkCorpPurchaseReserve: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/corporations/mergerReview/gate", () => ({
  assertMergerClearance: vi.fn().mockResolvedValue({ ok: true }),
  acquisitionsBarredByDivestiture: () => null,
}));
function fixture() {
  const f = createTransactionalMemoryDb();
  const userId = new ObjectId();
  const parentId = new ObjectId(),
    targetId = new ObjectId(),
    ceoId = new ObjectId(),
    holderId = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 10 }]);
  f.memory.seed("exchangeRates", [{ _id: "US", currencyCode: "USD", rate: 1 }]);
  f.memory.seed("corporations", [
    {
      _id: parentId,
      sequentialId: 2,
      userId,
      name: "Synthetic acquirer",
      countryId: "US",
      headquartersState: "TX",
      liquidCurrencyCode: "USD",
      liquidCapital: 10000,
      ceoId,
      ceoType: "player",
      totalShares: 100,
      sharePrice: 10,
      publicFloat: 0,
      shareholders: [{ characterId: ceoId, shares: 100 }],
    },
    {
      _id: targetId,
      sequentialId: 1,
      userId,
      name: "Synthetic target",
      countryId: "US",
      headquartersState: "TX",
      liquidCurrencyCode: "USD",
      liquidCapital: 1000,
      ceoId,
      ceoType: "player",
      totalShares: 100,
      sharePrice: 10,
      publicFloat: 0,
      shareholders: [
        { corporationId: parentId, shares: 90 },
        { characterId: holderId, shares: 10 },
      ],
    },
  ]);
  f.memory.seed("characters", [
    { _id: ceoId, cashOnHand: 0, countryId: "US" },
    { _id: holderId, cashOnHand: 0, countryId: "US" },
  ]);
  vi.mocked(requireBasicAuth).mockResolvedValue({
    ok: true,
    user: { userId: userId.toHexString(), activeCharacterId: ceoId.toHexString() },
  } as never);
  const request = () =>
    new Request("http://localhost/api/corporations/1/hostile-takeover", {
      method: "POST",
      body: JSON.stringify({
        parentCorporationId: parentId.toHexString(),
        overrideOperatingReserve: true,
      }),
    });
  return { ...f, parentId, targetId, holderId, request };
}
beforeEach(() => vi.clearAllMocks());
it.each([false, true])(
  "rolls back minority payouts and the acquirer refund when the final target deletion fails, afterWrite=%s",
  async (afterWrite) => {
    const f = fixture();
    const fault = withInjectedCrash(f.memory, {
      collection: "corporations",
      op: "deleteOne",
      onCall: 1,
      afterWrite,
    });
    vi.mocked(getDb).mockResolvedValue(fault.db);
    const response = await runHostileTakeover(f.request(), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(500);
    expect(fault.crashed).toBe(true);
    expect(f.memory.collection("corporations").docs).toHaveLength(2);
    expect(
      (await f.db.collection("corporations").findOne({ _id: f.parentId }))!.liquidCapital
    ).toBe(10000);
    expect((await f.db.collection("characters").findOne({ _id: f.holderId }))!.cashOnHand).toBe(0);
    vi.mocked(getDb).mockResolvedValue(f.db);
    const retry = await runHostileTakeover(f.request(), { params: Promise.resolve({ id: "1" }) });
    expect(await retry.json()).toMatchObject({ success: true });
    const parent = await f.db.collection("corporations").findOne({ _id: f.parentId });
    const holder = await f.db.collection("characters").findOne({ _id: f.holderId });
    expect(Number(parent!.liquidCapital) + Number(holder!.cashOnHand)).toBe(11000);
    expect(f.memory.collection("corporations").docs).toHaveLength(1);
  }
);
