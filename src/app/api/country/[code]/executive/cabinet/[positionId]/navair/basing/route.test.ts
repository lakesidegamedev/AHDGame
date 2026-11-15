import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  find: vi.fn(),
  insert: vi.fn(),
  replace: vi.fn(),
  war: vi.fn(),
}));
vi.mock("@/lib/api/battleAuthz", () => ({ authorizeBattleAction: mocks.auth }));
vi.mock("@/lib/db/collections/navairBasing", () => ({
  getNavairBasingCollection: () => ({
    findOne: mocks.find,
    insertOne: mocks.insert,
    replaceOne: mocks.replace,
  }),
}));
vi.mock("@/lib/db/collections/conflicts", () => ({
  getConflictsCollection: () => ({ findOne: mocks.war }),
}));
import { POST } from "./route";
const params = { params: Promise.resolve({ code: "US", positionId: "secretary_of_defense" }) };
const call = (body: unknown) =>
  POST(
    new Request("http://localhost/api/basing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    params
  );
const offer = { host: "US", guest: "UK", domain: "naval", action: "offer" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({
    db: {},
    countryId: "US",
    currentTurn: 20,
    isHolder: true,
    isAdmin: false,
  });
  mocks.find.mockResolvedValue(null);
  mocks.war.mockResolvedValue(null);
  mocks.insert.mockResolvedValue({ acknowledged: true });
  mocks.replace.mockResolvedValue({ matchedCount: 1 });
});
describe("basing agreements API", () => {
  it("requires authenticated defense authority", async () => {
    mocks.auth.mockResolvedValueOnce({ error: new Response("Unauthorized", { status: 401 }) });
    expect((await call(offer)).status).toBe(401);
    mocks.auth.mockResolvedValueOnce({ db: {}, countryId: "US", isHolder: false, isAdmin: false });
    expect((await call(offer)).status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("validates countries and prevents third-party or guest-created offers", async () => {
    expect((await call({ ...offer, guest: "UNKNOWN" })).status).toBe(400);
    expect((await call({ ...offer, host: "JP" })).status).toBe(400);
    expect((await call({ ...offer, host: "UK", guest: "US" })).status).toBe(400);
  });
  it("creates only an offer until the guest accepts", async () => {
    expect((await call(offer)).status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "US:UK:naval", status: "offered" })
    );
    mocks.find.mockResolvedValue({
      _id: "UK:US:air",
      host: "UK",
      guest: "US",
      domain: "air",
      status: "offered",
      updatedTurn: 19,
    });
    expect((await call({ host: "UK", guest: "US", domain: "air", action: "accept" })).status).toBe(
      200
    );
    expect(mocks.replace).toHaveBeenCalledWith(
      expect.objectContaining({ status: "offered", updatedTurn: 19 }),
      expect.objectContaining({ status: "active" })
    );
  });
  it("rejects enemy acceptance and handles concurrent changes", async () => {
    mocks.war.mockResolvedValueOnce({ _id: "war" });
    expect((await call(offer)).status).toBe(400);
    mocks.find.mockResolvedValue({
      _id: "US:UK:naval",
      host: "US",
      guest: "UK",
      domain: "naval",
      status: "active",
      updatedTurn: 19,
    });
    mocks.replace.mockResolvedValue({ matchedCount: 0 });
    expect((await call({ ...offer, action: "revoke" })).status).toBe(409);
  });
});
