import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorId, updateOne, findOne } = await vi.hoisted(async () => {
  const { ObjectId } = await import("mongodb");
  return {
    authorId: new ObjectId(),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    findOne: vi.fn(),
  };
});

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/api/wikiGuard", () => ({ checkWikiDisabled: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/api/requireAuth", () => ({
  requireAuthWithCharacter: vi.fn().mockResolvedValue({
    ok: true,
    user: { userId: authorId.toHexString(), username: "writer" },
  }),
}));
vi.mock("@/lib/wiki/reviewNotifications", () => ({
  notifyModeratorsOfWikiSubmission: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db/repositories/users", () => ({
  usersCollection: () => ({ findOne: vi.fn().mockResolvedValue({ username: "writer" }) }),
}));
vi.mock("@/lib/db/repositories/wikiPages", () => ({
  wikiPagesCollection: () => ({ findOne, updateOne }),
}));

import { PATCH } from "./route";

const body = {
  title: "New title here",
  content: "y".repeat(80),
};

function patch(payload: unknown) {
  return PATCH(
    new Request("http://localhost/api/wiki/p", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    { params: Promise.resolve({ slug: "p" }) }
  );
}

function page(status: string) {
  return {
    _id: new ObjectId(),
    slug: "p",
    title: "Old title",
    description: "Old description text",
    content: "x".repeat(80),
    tags: [],
    status,
    submittedBy: authorId,
  };
}

describe("PATCH /api/wiki/[slug]", () => {
  beforeEach(() => {
    updateOne.mockClear();
    findOne.mockReset();
  });

  it("keeps a live page published and parks the edit beside it", async () => {
    findOne.mockResolvedValue(page("published"));
    const res = await patch(body);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const update = updateOne.mock.calls[0]![1] as { $set: Record<string, unknown> };
    expect(update.$set.status).toBeUndefined();
    expect(update.$set.content).toBeUndefined();
    expect(update.$set.pendingEdit).toMatchObject({
      title: "New title here",
      content: body.content,
    });
  });

  it("sends a rejected draft back to review", async () => {
    findOne.mockResolvedValue(page("draft"));
    await patch(body);
    const update = updateOne.mock.calls[0]![1] as { $set: Record<string, unknown> };
    expect(update.$set.status).toBe("pending_review");
    expect(update.$set.content).toBe(body.content);
  });

  it("refuses an edit from someone who is not the author", async () => {
    findOne.mockResolvedValue({ ...page("published"), submittedBy: new ObjectId() });
    const res = await patch(body);
    expect(res.status).toBe(403);
    expect(updateOne).not.toHaveBeenCalled();
  });
});
