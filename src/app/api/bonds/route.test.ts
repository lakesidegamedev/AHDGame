import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { getDb } from "@/lib/mongodb";
import { GET } from "./route";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn().mockResolvedValue({ isAdmin: true }) }));
vi.mock("@/lib/gameState", () => ({
  getGameState: vi.fn().mockResolvedValue({ currentTurn: 12 }),
}));
vi.mock("@/lib/currency/corporationCapital", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/currency/corporationCapital")>()),
  loadFxRatesByCurrency: vi.fn().mockResolvedValue(new Map([["JPY", 100]])),
}));

describe("sovereign bond listing risk", () => {
  beforeEach(() => vi.clearAllMocks());
  it("includes issuer rating and prior default even for a non-defaulted series", async () => {
    const db = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
    db.collection("bonds")
      .find()
      .toArray.mockResolvedValue([
        {
          _id: new ObjectId(),
          corporationId: new ObjectId(),
          issuerType: "sovereign",
          countryId: "JP",
          currencyCode: "JPY",
          issuerName: "Japan",
          couponRate: 5,
          maturityTurns: 48,
          issuedAtTurn: 1,
          maturityTurn: 49,
          marketPrice: 1,
          totalIssued: 10_000,
          publicFloat: 10,
          holders: [],
          defaulted: false,
        },
      ]);
    db.collection("federalBudget")
      .find()
      .toArray.mockResolvedValue([
        { _id: "JP", creditRating: "BB", sovereignCrisisState: "recovering", lastDefaultTurn: 8 },
      ]);
    const response = await GET(new Request("http://localhost/api/bonds?exchange=global"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.bonds).toHaveLength(1);
    expect(body.bonds[0]).toMatchObject({
      defaulted: false,
      sovereignRisk: {
        creditRating: "BB",
        crisisState: "recovering",
        lastDefaultTurn: 8,
      },
    });
  });
});
