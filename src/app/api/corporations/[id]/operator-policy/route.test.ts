import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/api/corporations/resolveQuery", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api/corporations/resolveQuery")>()),
  resolveCorporation: vi.fn(),
}));
vi.mock("@/lib/turn/currentTurn", () => ({ getCurrentTurn: vi.fn().mockResolvedValue(90) }));
vi.mock("@/lib/corporations/subsidiaries/authorization", () => ({
  canActOnCorporationAsParent: vi.fn().mockResolvedValue(false),
}));

import { GET, PUT, DELETE } from "./route";

let db: MockDb;
const ownerId = new ObjectId();
const corpId = new ObjectId();
const ctx = { params: Promise.resolve({ id: corpId.toString() }) };
const updateOne = () => db.collectionMocks["corporations"]!.updateOne;

async function setCorp(overrides: Record<string, unknown> = {}) {
  const { resolveCorporation } = await import("@/lib/api/corporations/resolveQuery");
  vi.mocked(resolveCorporation).mockResolvedValue({
    ok: true,
    corporation: {
      _id: corpId,
      userId: ownerId,
      ceoType: "character",
      ceoVacant: false,
      autopilot: { enabledTurn: 1 },
      ...overrides,
    },
  } as never);
}

async function signIn(userId: ObjectId) {
  const { requireBasicAuth } = await import("@/lib/api/requireAuth");
  vi.mocked(requireBasicAuth).mockResolvedValue({
    ok: true,
    user: { userId: userId.toString() },
  } as never);
}

const put = (body: unknown) =>
  PUT(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify(body) }), ctx);

beforeEach(async () => {
  vi.clearAllMocks();
  db = createMockDb();
  db.collection("corporations");
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as never);
  updateOne().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  await signIn(ownerId);
  await setCorp();
});

describe("/api/corporations/[id]/operator-policy", () => {
  it("shows role defaults when no policy is stored", async () => {
    const body = await (await GET(new Request("http://localhost/x"), ctx)).json();
    expect(body.policy).toBeNull();
    expect(body.effective.role).toBe("autopilot");
    expect(body.effective.actions.borrow).toBe("never");
  });

  it("stores a normalized policy and returns the effective permissions", async () => {
    const res = await put({
      actions: { divest: "allow", grow: "never" },
      sectorTypes: ["energy", "energy"],
      countryIds: ["US", "US"],
    });
    expect(res.status).toBe(200);
    const set = updateOne().mock.calls[0]![1].$set.operatorPolicy;
    expect(set).toEqual({
      actions: { divest: "allow", grow: "never" },
      sectorTypes: ["energy"],
      countryIds: ["US"],
      setTurn: 90,
    });
    const body = await res.json();
    expect(body.effective.actions.divest).toBe("allow");
    expect(body.effective.actions.grow).toBe("never");
  });

  it("rejects unknown actions, sector types and malformed countries", async () => {
    for (const bad of [
      { actions: { fly: "allow" } },
      { actions: { grow: "maybe" } },
      { sectorTypes: ["nonsense"] },
      { countryIds: ["usa"] },
      { extra: 1 },
    ]) {
      expect((await put(bad)).status).toBe(400);
    }
    expect(updateOne()).not.toHaveBeenCalled();
  });

  it("refuses someone who is not the CEO or the parent's CEO", async () => {
    await signIn(new ObjectId());
    expect((await put({ actions: { grow: "never" } })).status).toBe(403);
    expect(updateOne()).not.toHaveBeenCalled();
  });

  it("lets the controlling parent's CEO write a subsidiary's policy", async () => {
    const { canActOnCorporationAsParent } =
      await import("@/lib/corporations/subsidiaries/authorization");
    vi.mocked(canActOnCorporationAsParent).mockResolvedValue(true);
    await signIn(new ObjectId());
    await setCorp({ userId: undefined, ceoType: "npp", autopilot: undefined });
    expect((await put({ actions: { grow: "never" } })).status).toBe(200);
  });

  it("refuses state-owned corporations", async () => {
    await setCorp({ countryOwnerId: "US" });
    expect((await put({})).status).toBe(400);
  });

  it("reports a conflict when the seat changed under the write", async () => {
    updateOne().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    expect((await put({ actions: { grow: "never" } })).status).toBe(409);
  });

  it("clears the policy", async () => {
    const res = await DELETE(new Request("http://localhost/x", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    expect(updateOne().mock.calls[0]![1].$unset).toEqual({ operatorPolicy: "" });
  });
});
