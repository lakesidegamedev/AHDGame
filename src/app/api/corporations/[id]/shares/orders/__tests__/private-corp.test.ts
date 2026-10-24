import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import type { Db } from "mongodb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/requireCorporationActions", () => ({
  requireCorporationActionsEnabled: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/api/corporations/resolveQuery", () => ({ resolveCorporation: vi.fn() }));
vi.mock("@/lib/db/characterLookup", () => ({ getCharacterByUserId: vi.fn() }));
vi.mock("@/lib/api/rejectDuringTurn", () => ({
  rejectDuringTurn: vi.fn().mockResolvedValue(null),
}));

let db: MockDb;
const userId = new ObjectId();
const characterId = new ObjectId();
const corpId = new ObjectId();

beforeEach(async () => {
  vi.clearAllMocks();
  db = createMockDb();
  for (const n of ["shareTradeHistory", "shareOrders", "shareOffers", "gameState"])
    db.collection(n);
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  const { requireBasicAuth } = await import("@/lib/api/requireAuth");
  vi.mocked(requireBasicAuth).mockResolvedValue({
    ok: true,
    user: { userId: userId.toString() },
  } as never);
  const { getCharacterByUserId } = await import("@/lib/db/characterLookup");
  vi.mocked(getCharacterByUserId).mockResolvedValue({
    _id: characterId,
    userId,
    countryId: "US",
  } as never);
});

function placeOrder(body: Record<string, unknown>) {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("placeShareOrder on a private corporation", () => {
  // Cold transform of this route's import graph costs about 20s on the shared
  // box, above the suite's 15s default.
  it("refuses a limit order and points the player at private sale", async () => {
    const { resolveCorporation } = await import("@/lib/api/corporations/resolveQuery");
    vi.mocked(resolveCorporation).mockResolvedValue({
      ok: true,
      corporation: {
        _id: corpId,
        name: "Quiet Holdings",
        isPrivate: true,
        ceoId: characterId,
        totalShares: 1_000_000,
        publicFloat: 0,
        sharePrice: 10,
        fundamentalSharePrice: 10,
      },
    } as never);
    const { placeShareOrder } =
      await import("@/lib/corporations/commands/shareTrading/placeShareOrder");

    const res = await placeShareOrder(placeOrder({ type: "buy", shares: 100, pricePerShare: 10 }), {
      params: Promise.resolve({ id: corpId.toString() }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("private company");
    expect(body.error).toContain("private sale");
    // No order reaches the book, so no holder is left with a bid they cannot see.
    expect(db.collectionMocks["shareOrders"]!.insertOne).not.toHaveBeenCalled();
  }, 60_000);
});
