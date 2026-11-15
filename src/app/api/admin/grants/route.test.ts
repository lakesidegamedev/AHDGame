import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: vi.fn() }));

const actorId = new ObjectId();
const requesterId = new ObjectId();
let db: MockDb;

const get = (qs = "") =>
  import("./route").then((m) => m.GET(new Request(`http://localhost/api/admin/grants${qs}`)));

beforeEach(async () => {
  vi.clearAllMocks();
  db = createMockDb();
  db.collection("actionAuditLog");
  db.collection("users");
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
});

describe("GET /api/admin/grants", () => {
  it("refuses anyone who is not an admin", async () => {
    const { requireAdmin } = await import("@/lib/api/requireAdmin");
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    } as never);
    expect((await get()).status).toBe(403);
    expect(db.collectionMocks.actionAuditLog!.find).not.toHaveBeenCalled();
  });

  it("lists grants with who did it and on whose request", async () => {
    const { requireAdmin } = await import("@/lib/api/requireAdmin");
    vi.mocked(requireAdmin).mockResolvedValue({ ok: true, admin: {} } as never);
    const row = {
      _id: new ObjectId(),
      ts: new Date("2026-11-13T10:00:00Z"),
      action: "grant.funds",
      actor: { userId: actorId, role: "admin" },
      subject: { type: "character", id: "c1", name: "Sample" },
      amount: 5000,
      reason: "bug repayment",
      outcome: "ok",
      world: "2027",
      meta: {
        grant: {
          recipients: [{ type: "character", id: "c1", name: "Sample" }],
          recipientCount: 1,
          via: { tool: "heal", requestedBy: requesterId.toString() },
        },
      },
    };
    const chain = {
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([row]),
    };
    db.collectionMocks.actionAuditLog!.find.mockReturnValue(chain);
    db.collectionMocks.users!.find.mockReturnValue({
      toArray: async () => [
        { _id: actorId, username: "alice" },
        { _id: requesterId, username: "bob" },
      ],
    });

    const response = await get("?kind=funds&recipient=Sample");
    expect(response.status).toBe(200);
    const { grants } = await response.json();
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      kind: "funds",
      amount: 5000,
      actor: { id: actorId.toString(), name: "alice", role: "admin" },
      onBehalfOf: { tool: "heal", requestedByName: "bob" },
    });
    const [filter] = db.collectionMocks.actionAuditLog!.find.mock.calls[0]!;
    expect(filter.action).toBe("grant.funds");
    expect(filter.$or).toBeDefined();
  });
});
