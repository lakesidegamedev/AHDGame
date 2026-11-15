import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/publicApi/middleware", () => ({
  publicApiGuard: vi.fn(async () => ({ ok: true, headers: {} })),
}));

describe("GET /api/public/v1/market", () => {
  let db: MockDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("corporateSectors");
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  });

  it("keeps view=unowned valid and answers with an empty list and a deprecation note", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/public/v1/market?type=energy&view=unowned")
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ ok: true, found: false, mode: "unowned", sectors: [] });
    expect(data.totalItems).toBe(0);
    expect(typeof data.deprecated).toBe("string");
    expect(db.collectionMocks.corporateSectors.find).not.toHaveBeenCalled();
  });
});
