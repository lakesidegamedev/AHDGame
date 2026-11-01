import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { CORPORATION_RENAME_COST } from "@/lib/constants/corporations";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { logWireEvent } from "@/lib/wireEvent";
import { POST } from "./route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: () => ({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/gameState", () => ({ getGameState: async () => ({ currentTurn: 100 }) }));
vi.mock("@/lib/wireEvent", () => ({ logWireEvent: vi.fn() }));
vi.mock("@/lib/currency/corporationCapital", async (original) => ({
  ...(await original<typeof import("@/lib/currency/corporationCapital")>()),
  getCorpFxRate: async () => 1,
}));
let memory: ReturnType<typeof createInMemoryDb>, id: ObjectId;
beforeEach(() => {
  vi.clearAllMocks();
  memory = createInMemoryDb();
  id = new ObjectId();
  const user = new ObjectId();
  memory.seed("corporations", [
    {
      _id: id,
      name: "Original company",
      countryId: "US",
      headquartersState: "TX",
      userId: user,
      liquidCurrencyCode: "USD",
      liquidCapital: 2 * CORPORATION_RENAME_COST,
      marketingStrength: 100,
    },
  ]);
  memory.seed("gameState", [
    { _id: "current", corporationActionsPaused: false, isProcessing: false },
  ]);
  vi.mocked(getDb).mockResolvedValue(memory as unknown as Db);
  vi.mocked(requireBasicAuth).mockResolvedValue({
    ok: true,
    user: { userId: user.toHexString() },
  } as never);
});
const request = () =>
  POST(
    new Request("http://localhost/api/corporations/test/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed company" }),
    }),
    { params: Promise.resolve({ id: id.toHexString() }) }
  );
describe("rename cash and obligation guard", () => {
  it("charges and renames an eligible corporation once", async () => {
    expect((await request()).status).toBe(200);
    expect(await memory.collection("corporations").findOne({ _id: id })).toMatchObject({
      name: "Renamed company",
      liquidCapital: CORPORATION_RENAME_COST,
      marketingStrength: 75,
    });
    expect(logWireEvent).toHaveBeenCalledTimes(1);
  });
  it.each([
    { federalTaxArrearsAnchorByCountry: { US: 1 } },
    { operatingCashArrearsByCurrency: { USD: 1 } },
    { pendingOperatingCash: 1 },
  ])("rejects encumbered cash without changing or announcing the name: %j", async (fields) => {
    Object.assign(memory.collection("corporations").docs[0], fields);
    expect((await request()).status).toBe(409);
    expect(await memory.collection("corporations").findOne({ _id: id })).toMatchObject({
      name: "Original company",
      liquidCapital: 2 * CORPORATION_RENAME_COST,
      marketingStrength: 100,
    });
    expect(logWireEvent).not.toHaveBeenCalled();
  });
  it("rejects an intervening cash spend at the atomic update", async () => {
    const collection = memory.collection("corporations");
    const update = collection.updateOne.bind(collection);
    vi.spyOn(collection, "updateOne").mockImplementation(async (...args) => {
      collection.docs[0].liquidCapital = CORPORATION_RENAME_COST / 2;
      return update(...args);
    });
    expect((await request()).status).toBe(409);
    expect(await collection.findOne({ _id: id })).toMatchObject({
      name: "Original company",
      liquidCapital: CORPORATION_RENAME_COST / 2,
      marketingStrength: 100,
    });
    expect(logWireEvent).not.toHaveBeenCalled();
  });
});
