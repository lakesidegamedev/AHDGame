import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireBotToken", () => ({ requireBotToken: vi.fn(() => true) }));
vi.mock("@/lib/api/rateLimit", () => ({
  BOT_FINANCIAL_LIMITS: { maxRequests: 30, windowMs: 60_000 },
  checkRateLimit: vi.fn(() => ({ ok: true })),
  rateLimitResponse: vi.fn(),
}));

describe("GET /api/discord-bot/sectors", () => {
  let db: MockDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createMockDb();
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  });

  it("keeps unowned=true valid and answers with an empty list and a deprecation note", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/discord-bot/sectors?type=energy&unowned=true")
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ found: false, mode: "unowned", totalItems: 0, sectors: [] });
    expect(typeof data.deprecated).toBe("string");
  });
});
