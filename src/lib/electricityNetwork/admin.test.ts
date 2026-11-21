import { beforeEach, describe, it, expect, vi } from "vitest";
import { NextResponse } from "next/server";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/adminLog", () => ({ createAdminLog: vi.fn() }));
import { GET, PATCH } from "@/app/api/admin/electricity-network/route";
import { GET as REPORTS } from "@/app/api/admin/electricity-network/reports/route";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
let db: MockDb;
beforeEach(() => {
  vi.clearAllMocks();
  db = createMockDb();
  vi.mocked(getDb).mockResolvedValue(db as never);
  vi.mocked(requireAdmin).mockResolvedValue({ ok: true, admin: { username: "Admin" } } as never);
});
const request = (body: unknown) =>
  new Request("http://localhost/api/admin/electricity-network", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
describe("electricity admin controls", () => {
  it("defaults to Shadow without modifying config and disables caching", async () => {
    const r = await GET();
    expect((await r.json()).mode).toBe("shadow");
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(db.collection("gameConfig").updateOne).not.toHaveBeenCalled();
  });
  it.each(["off", "shadow", "enforced"])("saves %s with an audit record", async (mode) => {
    expect((await PATCH(request({ mode }))).status).toBe(200);
    expect(db.collection("gameConfig").updateOne).toHaveBeenCalledWith(
      { _id: "default" },
      { $set: { electricityNetworkMode: mode } },
      { upsert: true }
    );
    const { createAdminLog } = await import("@/lib/adminLog");
    expect(createAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "electricity_network_mode_changed",
        adminUsername: "Admin",
      })
    );
  });
  it.each([{ mode: "enabled" }, { mode: "enforced", extra: true }, { mode: true }])(
    "rejects malformed mode %j",
    async (value) => {
      expect((await PATCH(request(value))).status).toBe(400);
      expect(db.collection("gameConfig").updateOne).not.toHaveBeenCalled();
    }
  );
  it("blocks non-admin report, read and change access", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    expect((await GET()).status).toBe(403);
    expect((await PATCH(request({ mode: "enforced" }))).status).toBe(403);
    expect((await REPORTS(new Request("http://localhost"))).status).toBe(403);
    expect(getDb).not.toHaveBeenCalled();
  });
  it("queries only completed settlements in the current world at or before the completed turn", async () => {
    db.collection("gameState").findOne.mockResolvedValue({
      worldEpochId: "current-world",
      currentTurn: 7,
    });
    const r = await REPORTS(new Request("http://localhost"));
    expect(r.status).toBe(200);
    expect(db.collection("producerEconomyTurns").find).toHaveBeenCalledWith(
      {
        worldEpoch: "current-world",
        status: "settled",
        turn: { $lte: 7 },
        electricityReport: { $exists: true },
      },
      { projection: { turn: 1, electricityReport: 1 } }
    );
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects invalid report turn filters", async () =>
    expect((await REPORTS(new Request("http://localhost?turn=-2"))).status).toBe(400));
});
