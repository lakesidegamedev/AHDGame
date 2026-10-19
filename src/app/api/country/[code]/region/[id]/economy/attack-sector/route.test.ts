import { describe, expect, it, vi } from "vitest";

const getDb = vi.fn();
vi.mock("@/lib/mongodb", () => ({ getDb, getMongoClient: vi.fn() }));
const requireHumanSession = vi.fn();
vi.mock("@/lib/api/requireAuth", () => ({ requireHumanSession }));

describe("POST /api/country/[code]/region/[id]/economy/attack-sector", () => {
  it("is gone: refuses before any auth, read, write or charge", async () => {
    const { POST } = await import("./route");
    const res = await POST();

    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({
      error: "Splitting rival plants has been removed from the game.",
    });
    expect(requireHumanSession).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
  });
});
