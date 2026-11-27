import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { createShareListing } from "./createShareListing";
import { POST as selfIssue } from "@/lib/api/commands/corporations/[id]/shares/self-issue/handlers";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/api/requireCorporationActions", () => ({
  requireCorporationActionsEnabled: async () => null,
}));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
const owner = new ObjectId(),
  character = new ObjectId(),
  corp = new ObjectId();
let fixture: ReturnType<typeof createTransactionalMemoryDb>;
beforeEach(async () => {
  fixture = createTransactionalMemoryDb();
  fixture.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 100,
      isProcessing: false,
      worldEpochId: "test",
      forexEnabled: false,
    },
  ]);
  fixture.memory.seed("users", [
    { _id: owner, activeCharacterId: character, activeCharacterType: "regular" },
  ]);
  fixture.memory.seed("characters", [
    { _id: character, userId: owner, name: "Owner", countryId: "US", cashOnHand: 10000 },
  ]);
  fixture.memory.seed("corporations", [
    {
      _id: corp,
      countryId: "US",
      name: "Company",
      liquidCurrencyCode: "USD",
      liquidCapital: 1000,
      sharePrice: 10,
      fundamentalSharePrice: 10,
      totalShares: 1000,
      publicFloat: 0,
      ceoId: character,
      userId: owner,
      shareholders: [{ characterId: character, shares: 1000, avgCostPerShare: 10 }],
    },
  ]);
  const { requireBasicAuth } = await import("@/lib/api/requireAuth");
  vi.mocked(requireBasicAuth).mockResolvedValue({
    ok: true,
    user: { userId: owner.toString() },
  } as never);
});
async function run(action: "listing" | "issuance", db = fixture.db) {
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db);
  const request = new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shares: 10 }),
  });
  return (action === "listing" ? createShareListing : selfIssue)(request, {
    params: Promise.resolve({ id: corp.toString() }),
  });
}
it.each(["corporations", "shareListings"])(
  "listing rolls back landed %s writes before releasing the original shares",
  async (collection) => {
    const fault = withInjectedCrash(fixture.memory, { collection, onCall: 1, afterWrite: true });
    expect((await run("listing", fault.db)).status).toBe(500);
    expect(fault.crashed).toBe(true);
    expect(fixture.memory.collection("corporations").docs[0].shareholders).toMatchObject([
      { shares: 1000 },
    ]);
    expect(fixture.memory.collection("shareListings").docs).toHaveLength(0);
    expect((await run("listing", fault.db)).status).toBe(200);
    expect(fixture.memory.collection("corporations").docs[0].shareholders).toMatchObject([
      { shares: 990 },
    ]);
    expect(fixture.memory.collection("shareListings").docs).toHaveLength(1);
  }
);
it.each(["characters", "shareTradeHistory", "financialTxLog"])(
  "issuance rolls back a landed %s write without losing buyer or issuer cash",
  async (collection) => {
    const fault = withInjectedCrash(fixture.memory, { collection, onCall: 1, afterWrite: true });
    expect((await run("issuance", fault.db)).status).toBe(500);
    expect(fault.crashed).toBe(true);
    expect(fixture.memory.collection("characters").docs[0].cashOnHand).toBe(10000);
    expect(fixture.memory.collection("corporations").docs[0]).toMatchObject({
      totalShares: 1000,
      liquidCapital: 1000,
    });
    expect((await run("issuance", fault.db)).status).toBe(200);
    const company = fixture.memory.collection("corporations").docs[0];
    expect(company.totalShares).toBe(1010);
    expect(
      Number(company.liquidCapital) +
        Number(fixture.memory.collection("characters").docs[0].cashOnHand)
    ).toBeCloseTo(11000, 8);
    expect(fixture.memory.collection("financialTxLog").docs).toHaveLength(1);
  }
);
