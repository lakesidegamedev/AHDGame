/**
 * Forex unit-invariant tests for corporation founding.
 * Verifies that starting capital is converted to the corp's home currency
 * using INITIAL_RATES, and that liquidCurrencyCode is set correctly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { CORPORATION_STARTING_CAPITAL } from "@/lib/constants/corporations";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/api/requireAuth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: () => ({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/wireEvent", () => ({
  logWireEvent: vi.fn(),
  wireHeadlineCorpFounded: vi.fn().mockReturnValue("headline"),
}));

function makeDb(countryId: string, baseRate?: number) {
  const f = createTransactionalMemoryDb();
  const currencyCode = countryId === "JP" ? "JPY" : countryId === "UK" ? "GBP" : "USD";
  const character = {
    _id: new ObjectId(),
    countryId,
    homeState: countryId === "JP" ? "jp_tokyo" : countryId === "UK" ? "london" : "california",
    currencyBalances: {
      personal: { [currencyCode]: countryId === "JP" ? 2_000_000_000 : 2_000_000 },
    },
    shareholders: [],
  };
  f.memory.seed("gameState", [{ _id: "current", currentYear: 1970, currentTurn: 56 }]);
  f.memory.seed("characters", [character]);
  f.memory.seed("states", [{ _id: character.homeState, countryId, name: "Synthetic region" }]);
  if (baseRate != null)
    f.memory.seed("exchangeRates", [{ currencyCode: "JPY", baseRate, rate: 106 }]);
  const corpInsertOne = vi.spyOn(f.memory.collection("corporations"), "insertOne");
  return { db: f.db, memory: f.memory, corpInsertOne, character };
}

describe("POST /api/corporations — forex enabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("JP corp: sets liquidCurrencyCode=JPY and converts starting capital via INITIAL_RATES", async () => {
    const { getDb } = await import("@/lib/mongodb");
    const { requireAuth } = await import("@/lib/api/requireAuth");
    const { db, corpInsertOne, character } = makeDb("JP");

    vi.mocked(getDb).mockResolvedValue(db as never);
    vi.mocked(requireAuth).mockResolvedValue({
      ok: true,
      user: {
        userId: new ObjectId().toString(),
        hasCharacter: true,
        character: character as never,
      },
    } as never);

    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/corporations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nippon Corp", tickerSymbol: "NIPN", type: "manufacturing" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const inserted = corpInsertOne.mock.calls[0][0];
    expect(inserted.liquidCurrencyCode).toBe("JPY");
    // INITIAL_RATES.JP = 106 ; exact assertion, not sanity check
    expect(inserted.liquidCapital).toBe(CORPORATION_STARTING_CAPITAL * 106);
  });

  it("uses the world base rate for both founding charge and corporate capital", async () => {
    const { getDb } = await import("@/lib/mongodb");
    const { requireAuth } = await import("@/lib/api/requireAuth");
    const { db, corpInsertOne, character } = makeDb("JP", 360);

    vi.mocked(getDb).mockResolvedValue(db as never);
    vi.mocked(requireAuth).mockResolvedValue({
      ok: true,
      user: {
        userId: new ObjectId().toString(),
        hasCharacter: true,
        character: character as never,
      },
    } as never);

    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/corporations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nippon Corp", tickerSymbol: "NIPN", type: "manufacturing" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const inserted = corpInsertOne.mock.calls[0][0];
    expect(inserted.liquidCurrencyCode).toBe("JPY");
    // Stored base is 360; the live quote of 106 must not price founding.
    expect(inserted.liquidCapital).toBe(CORPORATION_STARTING_CAPITAL * 360);
  });

  it("US corp: liquidCurrencyCode=USD and starting capital unchanged (rate=1.0)", async () => {
    const { getDb } = await import("@/lib/mongodb");
    const { requireAuth } = await import("@/lib/api/requireAuth");
    const { db, corpInsertOne, character } = makeDb("US");

    vi.mocked(getDb).mockResolvedValue(db as never);
    vi.mocked(requireAuth).mockResolvedValue({
      ok: true,
      user: {
        userId: new ObjectId().toString(),
        hasCharacter: true,
        character: character as never,
      },
    } as never);

    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/corporations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "American Corp", tickerSymbol: "AMER", type: "manufacturing" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const inserted = corpInsertOne.mock.calls[0][0];
    expect(inserted.liquidCurrencyCode).toBe("USD");
    // INITIAL_RATES.US = 1.0 → capital unchanged
    expect(inserted.liquidCapital).toBe(CORPORATION_STARTING_CAPITAL);
    // ticket #1056 — onboarding hasCompany matches ceoType:"character"
    expect(inserted.ceoType).toBe("character");
  });

  it("UK private founding stamps uk_ltd (not uk_plc) — ticket #1020", async () => {
    const { getDb } = await import("@/lib/mongodb");
    const { requireAuth } = await import("@/lib/api/requireAuth");
    const { db, corpInsertOne, character } = makeDb("UK");

    vi.mocked(getDb).mockResolvedValue(db as never);
    vi.mocked(requireAuth).mockResolvedValue({
      ok: true,
      user: {
        userId: new ObjectId().toString(),
        hasCharacter: true,
        character: character as never,
      },
    } as never);

    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/corporations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Pierce & Pierce", tickerSymbol: "PP", type: "financial" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const inserted = corpInsertOne.mock.calls[0][0];
    expect(inserted.isPrivate).toBe(true);
    expect(inserted.legalStructure).toBe("uk_ltd");
  });
});

it.each([
  { founding: false, lastCorporationFoundedTurn: undefined, expectedStatus: 201 },
  { founding: true, lastCorporationFoundedTurn: undefined, expectedStatus: 201 },
  { founding: false, lastCorporationFoundedTurn: 40, expectedStatus: 400 },
])(
  "allows new characters to found unless the account is on refounding cooldown: %j",
  async ({ founding, lastCorporationFoundedTurn, expectedStatus }) => {
    const { getDb } = await import("@/lib/mongodb");
    const { requireAuth } = await import("@/lib/api/requireAuth");
    const { db, memory, corpInsertOne, character } = makeDb("US");
    memory.seed("gameState", [
      { _id: "current", currentYear: 1970, currentTurn: 56, preIteration: { active: founding } },
    ]);
    const userId = new ObjectId().toHexString();
    memory.seed("users", [{ _id: new ObjectId(userId), lastCorporationFoundedTurn }]);
    vi.mocked(getDb).mockResolvedValue(db as never);
    vi.mocked(requireAuth).mockResolvedValue({
      ok: true,
      user: {
        userId,
        hasCharacter: true,
        character: { ...character, createdTurn: 54 },
      },
    } as never);
    const { POST } = await import("../route");
    const response = await POST(
      new Request("http://localhost/api/corporations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Example Company",
          tickerSymbol: "EXMP",
          type: "manufacturing",
        }),
      })
    );
    expect(response.status).toBe(expectedStatus);
    expect(corpInsertOne).toHaveBeenCalledTimes(expectedStatus === 201 ? 1 : 0);
    if (expectedStatus === 400) {
      expect((await response.json()).error).toBe("You can found another corporation in 80 turns.");
    }
  }
);
