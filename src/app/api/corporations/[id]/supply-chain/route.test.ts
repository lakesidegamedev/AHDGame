import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
const m = vi.hoisted(() => ({ auth: vi.fn(), resolve: vi.fn(), parent: vi.fn(), load: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthUser: m.auth }));
vi.mock("@/lib/mongodb", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/api/corporations/resolveQuery", () => ({ resolveCorporation: m.resolve }));
vi.mock("@/lib/corporations/reservedCorporateHoldings", () => ({
  isSittingCeoOfControllingParent: m.parent,
}));
vi.mock("@/lib/corporations/supplyChain/query", () => ({ loadCompanySupplyChain: m.load }));
import { GET } from "./route";
const companyId = new ObjectId("000000000000000000000001");
const call = (query = "") =>
  GET(new Request(`https://game.example/api/corporations/12/supply-chain${query}`), {
    params: Promise.resolve({ id: "12" }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ userId: "owner" });
  m.resolve.mockResolvedValue({ ok: true, corporation: { _id: companyId, userId: "owner" } });
  m.parent.mockResolvedValue(false);
  m.load.mockResolvedValue({ turn: 4, flows: [] });
});
describe("corporate supply-chain access", () => {
  it("serves canonical company data without shared caching", async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(m.load).toHaveBeenCalledWith({}, companyId.toHexString());
  });
  it("requires authentication before loading any private data", async () => {
    m.auth.mockResolvedValue(null);
    const r = await call();
    expect(r.status).toBe(401);
    expect(m.resolve).not.toHaveBeenCalled();
    expect(m.load).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "does not expose trade details to outside viewers, private=%s",
    async (isPrivate) => {
      m.auth.mockResolvedValue({ userId: "outsider" });
      m.resolve.mockResolvedValue({
        ok: true,
        corporation: { _id: companyId, userId: "owner", isPrivate },
      });
      expect((await call()).status).toBe(403);
      expect(m.load).not.toHaveBeenCalled();
    }
  );
  it("allows a controlling parent's CEO", async () => {
    m.auth.mockResolvedValue({ userId: "parent" });
    m.parent.mockResolvedValue(true);
    expect((await call()).status).toBe(200);
  });
  it("requires the moderator's explicit view switch", async () => {
    m.auth.mockResolvedValue({ userId: "mod", isModerator: true });
    expect((await call()).status).toBe(403);
    expect((await call("?modView=1")).status).toBe(200);
  });
  it("allows admins and propagates invalid or missing company responses", async () => {
    m.auth.mockResolvedValue({ userId: "admin", isAdmin: true });
    expect((await call()).status).toBe(200);
    m.resolve.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) });
    expect((await call()).status).toBe(404);
  });
});
