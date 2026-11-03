import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { checkRateLimit } from "@/lib/api/rateLimit";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireBotToken", () => ({ requireBotToken: vi.fn(() => true) }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn(() => ({ ok: true })),
  rateLimitResponse: vi.fn(() => new Response(null, { status: 429 })),
}));
vi.mock("@/lib/suggestionCounter", () => ({
  getNextSuggestionNumber: vi.fn(() => Promise.resolve(123)),
}));
vi.mock("@/lib/github", () => ({ createPlayerSuggestionGitHubIssue: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/discordWebhooks", () => ({
  notifyNewSuggestionDiscord: vi.fn(() => Promise.resolve({ status: "skipped" })),
}));
vi.mock("@/lib/suggestions/reporterIdentity", () => ({
  resolveSuggestionReporterIdentity: vi.fn(() => Promise.resolve(null)),
}));

const USER_ID = "6a1b2c3d4e5f60718293a4b5";

function request(body: Record<string, unknown>) {
  return new Request("https://example.com/api/discord-bot/suggestions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Show union support by state",
      description: "A map of union support would help plan organising.",
      category: "feature_request",
      gameSystem: "parties",
      ...body,
    }),
  });
}

describe("POST /api/discord-bot/suggestions", () => {
  let db: MockDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createMockDb();
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
    db.collection("users");
    db.collection("suggestions");
    db.collectionMocks.suggestions.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
  });

  it("files for a game account when there is no Discord id", async () => {
    db.collectionMocks.users.findOne.mockResolvedValue({
      _id: new ObjectId(USER_ID),
      username: "organiser",
    });
    const { POST } = await import("./route");
    const response = await POST(request({ userId: USER_ID }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ issueNumber: 123 });
    expect(checkRateLimit).toHaveBeenCalledWith(
      `discord-suggest:user:${USER_ID}`,
      expect.any(Number),
      expect.any(Number)
    );
    expect(db.collectionMocks.users.findOne.mock.calls[0][0]).toEqual({
      _id: new ObjectId(USER_ID),
    });
    const doc = db.collectionMocks.suggestions.insertOne.mock.calls[0][0];
    expect(doc.userId).toEqual(new ObjectId(USER_ID));
    expect(doc.discordSubmitUserId).toBeUndefined();
    expect(doc.context.pathname).toBe("/ask");
  });

  it("refuses an unknown game account", async () => {
    db.collectionMocks.users.findOne.mockResolvedValue(null);
    const { POST } = await import("./route");
    const response = await POST(request({ userId: USER_ID }));
    expect(response.status).toBe(404);
    expect(db.collectionMocks.suggestions.insertOne).not.toHaveBeenCalled();
  });

  it("rejects a malformed game account id", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ userId: "not-an-id" }));
    expect(response.status).toBe(400);
  });

  it("prefers the Discord id when both are given", async () => {
    db.collectionMocks.users.findOne.mockResolvedValue(null);
    const { POST } = await import("./route");
    const response = await POST(request({ userId: USER_ID, discordUserId: "123456789012345678" }));

    expect(response.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledWith(
      "discord-suggest:123456789012345678",
      expect.any(Number),
      expect.any(Number)
    );
    expect(db.collectionMocks.users.findOne.mock.calls[0][0]).toEqual({
      discordId: "123456789012345678",
    });
    const doc = db.collectionMocks.suggestions.insertOne.mock.calls[0][0];
    expect(doc.userId).toBeNull();
    expect(doc.context.pathname).toBe("/discord");
  });
});
