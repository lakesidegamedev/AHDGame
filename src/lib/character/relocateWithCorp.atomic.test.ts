import { beforeEach, describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { getDb } from "@/lib/mongodb";
import { handleRelocateWithCorp } from "./relocateWithCorp";
const ids = vi.hoisted(() => ({
  user: "000000000000000000000101",
  character: "000000000000000000000102",
}));
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireAuthWithCharacter: async () => ({
    ok: true,
    user: {
      userId: ids.user,
      activeCharacterId: ids.character,
      character: {
        _id: new ObjectId(ids.character),
        countryId: "US",
        homeState: "CA",
        party: "independent",
      },
    },
  }),
}));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/countryAccess", () => ({
  getCountryAccessFromDb: async () => ({ enabledForPlayers: true }),
}));
vi.mock("@/lib/corporations/relocationCommandEconomyGate", () => ({
  commandEconomyRelocationBlock: async () => null,
}));
vi.mock("@/lib/time/gameTime", () => ({
  getGameTime: async () => ({
    currentTurn: 1000,
    effectiveNow: new Date(100000),
    lastTurnProcessed: new Date(0),
  }),
}));
vi.mock("@/lib/wireEvent", () => ({ logWireEvent: vi.fn() }));
vi.mock("@/lib/analytics/officeTransitionAnalytics", () => ({ captureOfficeTransition: vi.fn() }));
vi.mock("@/lib/analytics/serverPosthog", () => ({ flushServerPosthog: vi.fn() }));
function world() {
  const f = createTransactionalMemoryDb(),
    corp = new ObjectId(),
    site = new ObjectId();
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 1000,
      currentYear: 2027,
      startingYear: 2027,
      preset: "2027-default",
      worldEpochId: "move-world",
    },
  ]);
  f.memory.seed("states", [
    { _id: "CA", countryId: "US", name: "California" },
    { _id: "TX", countryId: "US", name: "Texas" },
  ]);
  f.memory.seed("exchangeRates", [{ currencyCode: "USD", rate: 1 }]);
  f.memory.seed("characters", [
    {
      _id: new ObjectId(ids.character),
      userId: new ObjectId(ids.user),
      countryId: "US",
      homeState: "CA",
      name: "Owner",
      party: "independent",
      lastRelocatedAt: null,
    },
  ]);
  f.memory.seed("corporations", [
    {
      _id: corp,
      name: "Mover",
      userId: new ObjectId(ids.user),
      ceoId: new ObjectId(ids.character),
      ceoType: "character",
      countryId: "US",
      headquartersState: "CA",
      liquidCurrencyCode: "USD",
      liquidCapital: 1000,
      sharePrice: 10,
      totalShares: 100,
    },
  ]);
  f.memory.seed("corporateSectors", [
    {
      _id: site,
      corporationId: corp,
      countryId: "US",
      stateId: "CA",
      sectorType: "agriculture",
      capitalStock: 100,
      capacityBookAnchor: 1000,
    },
  ]);
  return { ...f, corp, site };
}
const call = () =>
  handleRelocateWithCorp(
    new Request("https://example.com/relocate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetStateId: "TX", paymentMethod: "cash" }),
    })
  );
beforeEach(() => vi.clearAllMocks());
describe("combined relocation atomicity", () => {
  it.each(["characters", "corporations"])(
    "rolls back a landed %s move and retries without a second charge",
    async (collection) => {
      const f = world(),
        fault = withInjectedCrash(f.memory, {
          collection,
          op: "updateOne",
          onCall: 1,
          afterWrite: true,
        });
      vi.mocked(getDb).mockResolvedValue(fault.db);
      expect((await call()).ok).toBe(false);
      expect(fault.crashed).toBe(true);
      expect(await f.db.collection("corporations").findOne({ _id: f.corp })).toMatchObject({
        headquartersState: "CA",
        liquidCapital: 1000,
      });
      expect(
        (await f.db.collection("characters").findOne({ _id: new ObjectId(ids.character) }))
          ?.homeState
      ).toBe("CA");
      expect(
        (await f.db.collection("corporateSectors").findOne({ _id: f.site }))
          ?.constructionPropertyTransition
      ).toBeUndefined();
      fault.disarm();
      vi.mocked(getDb).mockResolvedValue(f.db);
      const replies = await Promise.all([call(), call()]);
      expect(replies.filter((reply) => reply.ok)).toHaveLength(1);
      expect(await f.db.collection("corporations").findOne({ _id: f.corp })).toMatchObject({
        headquartersState: "TX",
        liquidCapital: 930,
      });
      expect(
        (await f.db.collection("characters").findOne({ _id: new ObjectId(ids.character) }))
          ?.homeState
      ).toBe("TX");
      expect((await call()).ok).toBe(false);
      expect((await f.db.collection("corporations").findOne({ _id: f.corp }))?.liquidCapital).toBe(
        930
      );
    }
  );
  it("refuses the combined move while a turn is processing", async () => {
    const f = world();
    await f.db
      .collection("gameState")
      .updateOne({ _id: "current" as never }, { $set: { isProcessing: true } });
    vi.mocked(getDb).mockResolvedValue(f.db);
    expect((await call()).status).toBe(409);
    expect((await f.db.collection("corporations").findOne({ _id: f.corp }))?.liquidCapital).toBe(
      1000
    );
  });
});
