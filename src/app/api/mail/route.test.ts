import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { ObjectId } from "mongodb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireAuthWithCharacter: vi.fn(),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn(),
  rateLimitResponse: vi.fn(
    (retryAfter?: number) =>
      new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "Retry-After": String(retryAfter ?? 60) },
      })
  ),
}));

let db: MockDb;
beforeEach(async () => {
  vi.resetModules();
  db = createMockDb();
  // Pre-initialize collections used in tests so mocks are accessible before route runs
  db.collection("playerMail");
  db.collection("characters");
  db.collection("users");
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as unknown as import("mongodb").Db);
});

describe("GET /api/mail", () => {
  it("returns 401 when not authenticated", async () => {
    const { requireAuthWithCharacter } = await import("@/lib/api/requireAuth");
    vi.mocked(requireAuthWithCharacter).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    } as never);

    const { GET } = await import("./route");
    const req = new Request("http://localhost/api/mail");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns inbox mails for authenticated user", async () => {
    const userId = new ObjectId();
    const charId = new ObjectId();
    const { requireAuthWithCharacter } = await import("@/lib/api/requireAuth");
    vi.mocked(requireAuthWithCharacter).mockResolvedValue({
      ok: true,
      user: {
        userId: userId.toString(),
        character: { _id: charId, name: "Test Char", sequentialId: 1 },
      },
    } as never);

    const mailId = new ObjectId();
    db.collectionMocks.playerMail.aggregate.mockReturnValue({
      toArray: async () => [
        {
          mails: [
            {
              _id: mailId,
              fromCharacterId: new ObjectId(),
              fromCharacterName: "Sender",
              fromCharacterSequentialId: 2,
              toUserId: userId,
              toCharacterId: charId,
              toCharacterName: "Test Char",
              toCharacterSequentialId: 1,
              subject: "Hello",
              body: "World",
              read: false,
              deletedByRecipient: false,
              deletedBySender: false,
              createdAt: new Date(),
            },
          ],
          totalCount: [{ count: 1 }],
          unreadCount: [{ count: 1 }],
        },
      ],
    });

    const { GET } = await import("./route");
    const req = new Request("http://localhost/api/mail");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.mails).toHaveLength(1);
    expect(data.mails[0].subject).toBe("Hello");
    expect(data.unreadCount).toBe(1);
    expect(data.total).toBe(1);
    expect(data.hasMore).toBe(false);
  });
});

describe("POST /api/mail", () => {
  it("returns 429 when rate limited", async () => {
    const userId = new ObjectId();
    const charId = new ObjectId();
    const { requireAuthWithCharacter } = await import("@/lib/api/requireAuth");
    vi.mocked(requireAuthWithCharacter).mockResolvedValue({
      ok: true,
      user: {
        userId: userId.toString(),
        character: { _id: charId, name: "Test", sequentialId: 1 },
      },
    } as never);

    const { checkRateLimit } = await import("@/lib/api/rateLimit");
    vi.mocked(checkRateLimit).mockReturnValue({
      ok: false,
      retryAfter: 45,
      limit: 100,
      remaining: 0,
      resetAt: Date.now() + 45_000,
    });

    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/mail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toCharacterId: new ObjectId().toString(),
        subject: "Hi",
        body: "Test message",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");
  });

  it("returns 400 when sending to own character", async () => {
    const userId = new ObjectId();
    const charId = new ObjectId();
    const { requireAuthWithCharacter } = await import("@/lib/api/requireAuth");
    vi.mocked(requireAuthWithCharacter).mockResolvedValue({
      ok: true,
      user: {
        userId: userId.toString(),
        character: { _id: charId, name: "Test", sequentialId: 1 },
      },
    } as never);

    const { checkRateLimit } = await import("@/lib/api/rateLimit");
    vi.mocked(checkRateLimit).mockReturnValue({
      ok: true,
      limit: 100,
      remaining: 99,
      resetAt: Date.now() + 60_000,
    });

    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/mail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toCharacterId: charId.toString(),
        subject: "Hi",
        body: "Test message",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Cannot send mail to yourself");
  });
});

describe("PATCH /api/mail", () => {
  const authAs = async (userId: ObjectId) => {
    const { requireAuthWithCharacter } = await import("@/lib/api/requireAuth");
    vi.mocked(requireAuthWithCharacter).mockResolvedValue({
      ok: true,
      user: {
        userId: userId.toString(),
        character: { _id: new ObjectId(), name: "T", sequentialId: 1 },
      },
    } as never);
    const { checkRateLimit } = await import("@/lib/api/rateLimit");
    vi.mocked(checkRateLimit).mockReturnValue({
      ok: true,
      limit: 30,
      remaining: 29,
      resetAt: Date.now() + 60_000,
    });
  };

  const patch = async (body: unknown) => {
    const { PATCH } = await import("./route");
    return PATCH(
      new Request("http://localhost/api/mail", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  };

  it("marks the listed received mails read in one write scoped to the recipient", async () => {
    const userId = new ObjectId();
    await authAs(userId);
    const a = new ObjectId();
    const b = new ObjectId();

    const res = await patch({ ids: [a.toString(), b.toString()] });

    expect(res.status).toBe(200);
    expect(db.collectionMocks.playerMail.updateMany).toHaveBeenCalledOnce();
    expect(db.collectionMocks.playerMail.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [a, b] }, toUserId: userId, deletedByRecipient: false },
      { $set: { read: true } }
    );
  });

  it("returns 400 for an empty or oversized list and writes nothing", async () => {
    await authAs(new ObjectId());
    expect((await patch({ ids: [] })).status).toBe(400);
    const tooMany = Array.from({ length: 101 }, () => new ObjectId().toString());
    expect((await patch({ ids: tooMany })).status).toBe(400);
    expect(db.collectionMocks.playerMail.updateMany).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    await authAs(new ObjectId());
    const { checkRateLimit } = await import("@/lib/api/rateLimit");
    vi.mocked(checkRateLimit).mockReturnValue({
      ok: false,
      limit: 30,
      remaining: 0,
      resetAt: Date.now() + 5000,
      retryAfter: 5,
    });
    const res = await patch({ ids: [new ObjectId().toString()] });
    expect(res.status).toBe(429);
    expect(db.collectionMocks.playerMail.updateMany).not.toHaveBeenCalled();
  });
});
