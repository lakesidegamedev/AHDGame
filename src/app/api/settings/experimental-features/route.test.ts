import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { PATCH } from "./route";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { getDb } from "@/lib/mongodb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/settings/experimental-features", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("PATCH /api/settings/experimental-features", () => {
  let db: MockDb;
  const userId = new ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("users");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
    vi.mocked(requireBasicAuth).mockResolvedValue({
      ok: true,
      user: { userId: userId.toString() },
    } as never);
  });

  it("opts in without touching the drawer side", async () => {
    const response = await patch({ experimentalFeatures: true });
    expect(response.status).toBe(200);
    const update = vi.mocked(db.collectionMocks.users.updateOne).mock.calls[0];
    expect(update[0]).toEqual({ _id: userId });
    expect(update[1].$set).toMatchObject({ experimentalFeatures: true });
    expect(update[1].$set).not.toHaveProperty("askDrawerSide");
  });

  it("moves the drawer to the left", async () => {
    const response = await patch({ askDrawerSide: "left" });
    expect(response.status).toBe(200);
    const update = vi.mocked(db.collectionMocks.users.updateOne).mock.calls[0];
    expect(update[1].$set).toMatchObject({ askDrawerSide: "left" });
    expect(update[1].$set).not.toHaveProperty("experimentalFeatures");
  });

  it.each([{}, { askDrawerSide: "top" }, { experimentalFeatures: "yes" }])(
    "rejects %j",
    async (body) => {
      const response = await patch(body);
      expect(response.status).toBe(400);
      expect(db.collectionMocks.users.updateOne).not.toHaveBeenCalled();
    }
  );
});
