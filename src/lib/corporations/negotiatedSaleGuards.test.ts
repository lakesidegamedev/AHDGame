import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { checkNegotiatedSale, checkNegotiatedSaleParties } from "./negotiatedSaleGuards";

vi.mock("@/lib/db/collections", () => ({
  getGameStateCollection: vi.fn(async (db: Db) => db.collection("gameState")),
}));

const party = (createdTurn = 1) => ({
  _id: new ObjectId(),
  userId: new ObjectId(),
  name: "Dana Ross",
  createdTurn,
  createdAt: new Date(0),
});

function fakeDb(docs: Record<string, object | null>) {
  return {
    collection: (name: string) => ({ findOne: vi.fn().mockResolvedValue(docs[name] ?? null) }),
  } as unknown as Db;
}

describe("checkNegotiatedSaleParties", () => {
  it("rejects self-sales, same-account characters and new characters", () => {
    const seller = party();
    expect(checkNegotiatedSaleParties(seller, seller, 100, 0).ok).toBe(false);
    expect(
      checkNegotiatedSaleParties(seller, { ...party(), userId: seller.userId }, 100, 0)
    ).toMatchObject({ ok: false, status: 400 });
    expect(checkNegotiatedSaleParties(seller, party(95), 100, 0)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(checkNegotiatedSaleParties(seller, party(), 100, 0)).toEqual({ ok: true });
  });
});

describe("checkNegotiatedSale", () => {
  it("blocks while player transfers are paused", async () => {
    const db = fakeDb({ gameState: { playerTransfersPaused: true } });
    expect(await checkNegotiatedSale(db, party(), party(), 100, 0)).toMatchObject({ ok: false });
  });

  it("blocks a strong alt link unless a moderator dismissed the ring", async () => {
    const strong = fakeDb({ altLinks: { confidence: 0.9 } });
    expect(await checkNegotiatedSale(strong, party(), party(), 100, 0)).toMatchObject({
      ok: false,
      status: 403,
    });
    const dismissed = fakeDb({ altLinks: { confidence: 0.9 }, altClusters: { _id: "c" } });
    expect(await checkNegotiatedSale(dismissed, party(), party(), 100, 0)).toEqual({ ok: true });
    const weak = fakeDb({ altLinks: { confidence: 0.5 } });
    expect(await checkNegotiatedSale(weak, party(), party(), 100, 0)).toEqual({ ok: true });
  });
});
