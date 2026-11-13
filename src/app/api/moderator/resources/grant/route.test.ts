import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthAdmin: vi.fn(), getAuthJuniorDev: vi.fn() }));
vi.mock("@/lib/staff/requestMethod", () => ({ currentRequestMethod: vi.fn() }));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: vi.fn() }));
vi.mock("@/lib/modAuditLog", () => ({ createModAuditLog: vi.fn() }));
vi.mock("@/lib/gameState", () => ({ getGameState: vi.fn(async () => ({ currentTurn: 7 })) }));
vi.mock("@/lib/db/collections/gameState", () => ({
  getGameStatePresetOrDefault: vi.fn(async () => "2027"),
}));
vi.mock("@/lib/financialTxLog/expiresAt", () => ({ loadTurnLengthMinutes: vi.fn(async () => 60) }));

const admin = { userId: new ObjectId().toString(), username: "Sample Admin" };

function grantRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/moderator/resources/grant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/moderator/resources/grant is admin-only", () => {
  let db: MockDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("characters");
    db.collection("users");
    db.collection("actionAuditLog");
    db.collectionMocks.users!.findOne.mockResolvedValue({ role: "admin" });
    db.collectionMocks.characters!.updateMany.mockResolvedValue({ modifiedCount: 1 });
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
    const { isForexEnabled } = await import("@/lib/currency/featureFlag");
    vi.mocked(isForexEnabled).mockResolvedValue(false);
    const { currentRequestMethod } = await import("@/lib/staff/requestMethod");
    vi.mocked(currentRequestMethod).mockResolvedValue("POST");
  });

  it("refuses a moderator (not an admin) with 403 and writes nothing", async () => {
    const auth = await import("@/lib/auth");
    vi.mocked(auth.getAuthAdmin).mockResolvedValue(null as never);
    vi.mocked(auth.getAuthJuniorDev).mockResolvedValue(null as never);
    const { POST } = await import("./route");

    for (const body of [
      { characterIds: [new ObjectId().toString()], funds: 1000 },
      { allPlayers: true, funds: 1000 },
    ]) {
      const response = await POST(grantRequest(body));
      expect(response.status).toBe(403);
    }
    expect(db.collectionMocks.characters!.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a junior dev on POST", async () => {
    const auth = await import("@/lib/auth");
    vi.mocked(auth.getAuthAdmin).mockResolvedValue(null as never);
    vi.mocked(auth.getAuthJuniorDev).mockResolvedValue(admin as never);
    const { POST } = await import("./route");
    const response = await POST(grantRequest({ allPlayers: true, actions: 5 }));
    expect(response.status).toBe(403);
    expect(db.collectionMocks.characters!.updateMany).not.toHaveBeenCalled();
  });

  it("lets an admin grant to chosen characters and to all players", async () => {
    const auth = await import("@/lib/auth");
    vi.mocked(auth.getAuthAdmin).mockResolvedValue(admin as never);
    const { POST } = await import("./route");

    const single = await POST(
      grantRequest({ characterIds: [new ObjectId().toString()], actions: 5 })
    );
    expect(single.status).toBe(200);
    const everyone = await POST(grantRequest({ allPlayers: true, actions: 5 }));
    expect(everyone.status).toBe(200);
    expect(db.collectionMocks.characters!.updateMany).toHaveBeenCalledTimes(2);
  });
});
