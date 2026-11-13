import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: vi.fn() }));
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTxBulk: vi.fn(),
  loadTxThresholds: vi.fn(),
}));
vi.mock("@/lib/gameState", () => ({ getGameState: vi.fn(async () => ({ currentTurn: 7 })) }));
vi.mock("@/lib/db/collections/gameState", () => ({
  getGameStatePresetOrDefault: vi.fn(async () => "2027"),
}));
vi.mock("@/lib/financialTxLog/expiresAt", () => ({ loadTurnLengthMinutes: vi.fn(async () => 60) }));

const adminId = new ObjectId().toString();

describe("POST /api/admin/resources/grant", () => {
  let db: MockDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createMockDb();

    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
    const { requireAdmin } = await import("@/lib/api/requireAdmin");
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: true,
      admin: { userId: adminId, username: "Admin" },
    } as never);
    const { isForexEnabled } = await import("@/lib/currency/featureFlag");
    vi.mocked(isForexEnabled).mockResolvedValue(false);
  });

  it("grants one voucher to every selected character and audits it", async () => {
    const characterId = new ObjectId();
    db.collection("characters");
    db.collection("adminLogs");
    db.collection("users");
    db.collection("actionAuditLog");
    db.collectionMocks.users!.findOne.mockResolvedValue({ role: "admin" });
    db.collectionMocks.characters!.updateMany.mockResolvedValue({ modifiedCount: 1 });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/admin/resources/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterIds: [characterId.toString()],
          positionUpdateVoucher: true,
        }),
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toMatch(/positions update voucher/i);
    expect(db.collectionMocks.characters!.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [characterId] } },
      [
        {
          $set: expect.objectContaining({
            positionUpdateVouchers: {
              $add: [{ $ifNull: ["$positionUpdateVouchers", 0] }, 1],
            },
          }),
        },
      ]
    );
    expect(db.collectionMocks.adminLogs!.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.stringMatching(/positions update voucher/i) })
    );
    const [[audit]] = db.collectionMocks.actionAuditLog!.insertMany.mock.calls[0]!;
    expect(audit).toMatchObject({ action: "grant.voucher", world: "2027", outcome: "ok" });
    expect(audit.actor.userId.toString()).toBe(adminId);
    expect(audit.actor.role).toBe("admin");
  });

  it("refuses and changes nothing when the actor has no staff account behind it", async () => {
    db.collection("characters");
    db.collection("adminLogs");
    db.collection("users");
    db.collection("actionAuditLog");
    db.collectionMocks.users!.findOne.mockResolvedValue(null);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/admin/resources/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allPlayers: true, actions: 5 }),
      })
    );

    expect(response.status).toBe(403);
    expect(db.collectionMocks.characters!.updateMany).not.toHaveBeenCalled();
    expect(db.collectionMocks.actionAuditLog!.insertMany).not.toHaveBeenCalled();
  });
});
