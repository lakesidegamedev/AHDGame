import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/gameState", () => ({ getGameState: vi.fn(async () => ({ currentTurn: 12 })) }));
vi.mock("@/lib/db/collections/gameState", () => ({
  getGameStatePresetOrDefault: vi.fn(async () => "2027"),
}));
vi.mock("@/lib/financialTxLog/expiresAt", () => ({ loadTurnLengthMinutes: vi.fn(async () => 60) }));

const adminId = new ObjectId().toString();
const requesterId = new ObjectId().toString();
const base = {
  actorUserId: adminId,
  recipients: [{ type: "character" as const, id: new ObjectId().toString(), name: "Sample" }],
  kind: "funds" as const,
  amount: 5000,
  reason: "compensation for a bug",
};

let db: MockDb;

function accounts(map: Record<string, { role?: string; isAdmin?: boolean } | null>) {
  db.collectionMocks.users!.findOne.mockImplementation(async (q: { _id: ObjectId }) => {
    return map[q._id.toString()] ?? null;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db = createMockDb();
  db.collection("users");
  db.collection("actionAuditLog");
});

describe("withAuditedGrant", () => {
  it("writes one record with actor id, role and world, then runs the change", async () => {
    accounts({ [adminId]: { role: "admin" } });
    const { withAuditedGrant } = await import("./recordGrant");
    const apply = vi.fn(async () => "done");

    await expect(withAuditedGrant(db as unknown as Db, base, apply)).resolves.toBe("done");

    expect(apply).toHaveBeenCalledOnce();
    const insert = db.collectionMocks.actionAuditLog!.insertMany;
    expect(insert).toHaveBeenCalledOnce();
    const [[record]] = insert.mock.calls[0]!;
    expect(record.action).toBe("grant.funds");
    expect(record.actor.userId.toString()).toBe(adminId);
    expect(record.actor.role).toBe("admin");
    expect(record.world).toBe("2027");
    expect(record.turn).toBe(12);
    expect(record.amount).toBe(5000);
    expect(record.reason).toBe("compensation for a bug");
  });

  it("records the tool and the requesting user id for a script or agent", async () => {
    accounts({ [adminId]: { role: "admin" }, [requesterId]: { role: "admin" } });
    const { withAuditedGrant } = await import("./recordGrant");
    await withAuditedGrant(
      db as unknown as Db,
      { ...base, via: { tool: "heal-ops", requestedBy: requesterId } },
      async () => 1
    );
    const [[record]] = db.collectionMocks.actionAuditLog!.insertMany.mock.calls[0]!;
    expect(record.meta.grant.via).toEqual({ tool: "heal-ops", requestedBy: requesterId });
  });

  it("refuses with nothing changed when the actor is not a staff account", async () => {
    accounts({ [adminId]: { role: "player" } });
    const { withAuditedGrant, GrantRefusedError } = await import("./recordGrant");
    const apply = vi.fn();
    await expect(withAuditedGrant(db as unknown as Db, base, apply)).rejects.toBeInstanceOf(
      GrantRefusedError
    );
    expect(apply).not.toHaveBeenCalled();
    expect(db.collectionMocks.actionAuditLog!.insertMany).not.toHaveBeenCalled();
  });

  it("refuses free-text requesters and requesters who are not staff", async () => {
    accounts({ [adminId]: { role: "admin" }, [requesterId]: { role: "player" } });
    const { withAuditedGrant } = await import("./recordGrant");
    const apply = vi.fn();
    for (const requestedBy of ["User-authorized administrative correction", requesterId]) {
      await expect(
        withAuditedGrant(
          db as unknown as Db,
          { ...base, via: { tool: "ops-agent", requestedBy } },
          apply
        )
      ).rejects.toThrow(/Grant refused/);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("writes one record per kind in a combined grant", async () => {
    accounts({ [adminId]: { role: "admin" } });
    const { withAuditedGrant } = await import("./recordGrant");
    await withAuditedGrant(
      db as unknown as Db,
      [base, { ...base, kind: "actions", amount: 5 }],
      async () => 1
    );
    const [records] = db.collectionMocks.actionAuditLog!.insertMany.mock.calls[0]!;
    expect(records.map((r: { action: string }) => r.action)).toEqual([
      "grant.funds",
      "grant.actions",
    ]);
  });

  it("marks the record failed when the change throws", async () => {
    accounts({ [adminId]: { isAdmin: true } });
    const { withAuditedGrant } = await import("./recordGrant");
    await expect(
      withAuditedGrant(db as unknown as Db, base, async () => {
        throw new Error("write failed");
      })
    ).rejects.toThrow("write failed");
    expect(db.collectionMocks.actionAuditLog!.updateMany).toHaveBeenCalledWith(expect.anything(), {
      $set: { outcome: "error" },
    });
  });
});
