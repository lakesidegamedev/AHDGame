import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const { updateOne, findOne, insertOne, revisionFindOne } = vi.hoisted(() => ({
  updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
  findOne: vi.fn(),
  insertOne: vi.fn().mockResolvedValue({ insertedId: "rev" }),
  revisionFindOne: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn().mockResolvedValue({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/modAuditLog", () => ({ createModAuditLog: vi.fn() }));
vi.mock("@/lib/api/requireModerator", () => ({
  requireModerator: vi.fn().mockResolvedValue({
    ok: true,
    user: { userId: "507f1f77bcf86cd799439011", username: "mod" },
  }),
}));
vi.mock("@/lib/wiki/reviewNotifications", () => ({
  notifySubmitterOfWikiDecision: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db/repositories/users", () => ({
  usersCollection: () => ({ findOne: vi.fn().mockResolvedValue({ username: "writer" }) }),
}));
vi.mock("@/lib/db/repositories/wikiPages", () => ({
  wikiPagesCollection: () => ({ findOne, updateOne }),
}));
vi.mock("@/lib/db/collections", () => ({
  getWikiRevisionsCollection: () => ({ insertOne, findOne: revisionFindOne }),
}));

import { POST } from "./route";

const authorId = new ObjectId();

function approve(body: unknown = {}) {
  return POST(
    new Request("http://localhost/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug: "p" }) }
  );
}

const livePage = {
  slug: "p",
  title: "Live title",
  description: "Live description text",
  content: "live ".repeat(20),
  tags: [],
  status: "published",
  submittedBy: authorId,
};

describe("POST approve", () => {
  beforeEach(() => {
    updateOne.mockClear();
    insertOne.mockClear();
    findOne.mockReset();
  });

  it("publishes a pending edit, clears it and stores the version", async () => {
    const pendingEdit = {
      title: "Edited title",
      description: "Edited description text",
      content: "edit ".repeat(20),
      tags: ["x"],
      submittedBy: authorId,
      submittedAt: new Date(),
    };
    findOne.mockResolvedValue({ ...livePage, pendingEdit });
    const res = await approve({ note: "Looks good" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");

    const call = updateOne.mock.calls[0]![1] as {
      $set: Record<string, unknown>;
      $unset?: Record<string, unknown>;
    };
    expect(call.$set.content).toBe(pendingEdit.content);
    expect(call.$set.status).toBe("published");
    expect(call.$unset).toEqual({ pendingEdit: "" });

    const stored = insertOne.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(stored.map((r) => r.kind)).toEqual(["baseline", "approved"]);
    expect(stored[1]).toMatchObject({ note: "Looks good", moderatorName: "mod" });
  });

  it("refuses a page that has nothing waiting", async () => {
    findOne.mockResolvedValue(livePage);
    const res = await approve();
    expect(res.status).toBe(400);
    expect(updateOne).not.toHaveBeenCalled();
  });
});
