import { beforeEach, describe, it, expect, vi } from "vitest";
import { NextResponse } from "next/server";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/adminLog", () => ({ createAdminLog: vi.fn() }));
let db: MockDb;
beforeEach(async () => {
  vi.clearAllMocks();
  db = createMockDb();
  db.collection("gameConfig");
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as never);
  const { requireAdmin } = await import("@/lib/api/requireAdmin");
  vi.mocked(requireAdmin).mockResolvedValue({
    ok: true,
    admin: { username: "Test Admin" },
  } as never);
});
describe("Discord character gate admin switch", () => {
  it("defaults to disabled without writing a config", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect(await res.json()).toEqual({ enabled: false });
    expect(db.collectionMocks.gameConfig.updateOne).not.toHaveBeenCalled();
  });
  it.each([true, false])("persists enabled=%s and logs the operator change", async (enabled) => {
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost/api/admin/discord-character-gate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
    );
    expect(res.status).toBe(200);
    expect(db.collectionMocks.gameConfig.updateOne).toHaveBeenCalledWith(
      { _id: "default" },
      { $set: { discordLinkRequiredForCharacter: enabled } },
      { upsert: true }
    );
    const { createAdminLog } = await import("@/lib/adminLog");
    expect(createAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "discord_character_gate_changed",
        adminUsername: "Test Admin",
      })
    );
  });
  it("rejects malformed switch values", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost/api/admin/discord-character-gate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: "yes" }),
      })
    );
    expect(res.status).toBe(400);
    expect(db.collectionMocks.gameConfig.updateOne).not.toHaveBeenCalled();
  });
  it("rejects non-admin reads and writes", async () => {
    const { requireAdmin } = await import("@/lib/api/requireAdmin");
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    const { GET, PATCH } = await import("./route");
    expect((await GET()).status).toBe(403);
    expect((await PATCH(new Request("http://localhost", { method: "PATCH" }))).status).toBe(403);
    expect(db.collectionMocks.gameConfig.updateOne).not.toHaveBeenCalled();
  });
});
