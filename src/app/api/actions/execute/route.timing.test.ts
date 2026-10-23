import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireHumanSession: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn(() => ({ ok: true })),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/actions/commands/executeAction", () => ({ executeCharacterAction: vi.fn() }));

describe("POST /api/actions/execute timing summary", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireHumanSession } = await import("@/lib/api/requireAuth");
    vi.mocked(requireHumanSession).mockResolvedValue({
      ok: true,
      user: { userId: new ObjectId().toString(), username: "Private Name" },
    } as never);
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue({
      collection: (name: string) => ({
        findOne: async () =>
          name === "users" ? { username: "Private Name" } : { _id: new ObjectId() },
      }),
    } as never);
    const { executeCharacterAction } = await import("@/lib/actions/commands/executeAction");
    vi.mocked(executeCharacterAction).mockResolvedValue({
      ok: false,
      status: 400,
      error: "refused",
    });
  });

  it("logs batch request timing without user or character details", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/actions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType: "fundraise", count: 10 }),
      })
    );
    expect(response.status).toBe(400);
    const timing = info.mock.calls.find(
      ([label]) => label === "[action-request-timing]"
    )?.[1] as Record<string, unknown>;
    expect(timing).toEqual(
      expect.objectContaining({ actionType: "fundraise", requestedCount: 10, status: 400 })
    );
    expect(timing).toHaveProperty("coreMs");
    expect(JSON.stringify(timing)).not.toMatch(/Private Name|[0-9a-f]{24}/);
    info.mockRestore();
  });
});
