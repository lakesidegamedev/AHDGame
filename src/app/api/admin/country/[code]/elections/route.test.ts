import { ObjectId, type Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { DEFAULT_DURATIONS } from "@/lib/constants/electionDurations";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/turn/perpetualElections", () => ({ DEFAULT_DURATIONS }));

describe("country election timer PATCH", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  let db: ReturnType<typeof createMockDb>;
  beforeEach(async () => {
    db = createMockDb();
    db.collection("elections");
    db.collection("gameState");
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
    const { requireAdmin } = await import("@/lib/api/requireAdmin");
    vi.mocked(requireAdmin).mockResolvedValue({ ok: true, admin: { username: "test" } } as never);
    db.collectionMocks.elections!.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: new ObjectId(),
          electionType: "house",
          countryId: "US",
          cycle: 2,
          status: "active",
          startTime: now,
          startTurn: 100,
          durationHours: 96,
          primaryDurationHours: 72,
        },
      ]),
    });
    db.collectionMocks.gameState!.findOne.mockResolvedValue({
      _id: "current",
      currentTurn: 100,
      lastTurnProcessed: now,
    });
  });

  it.each([
    ["set", { primaryHours: 80 }, 80, 24],
    ["set", { generalHours: 12 }, 72, 12],
    ["add", { primaryHours: 2 }, 74, 24],
    ["subtract", { generalHours: 4 }, 72, 20],
  ] as const)(
    "keeps stored phases and both clocks consistent for %s %o",
    async (action, edit, primary, general) => {
      const { PATCH } = await import("./route");
      const response = await PATCH(
        new Request("http://localhost/api/admin/country/us/elections", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, electionType: "house", ...edit }),
        }),
        { params: Promise.resolve({ code: "us" }) }
      );
      expect(response.status).toBe(200);
      expect(db.collectionMocks.elections!.updateOne).toHaveBeenCalledWith(expect.anything(), {
        $set: expect.objectContaining({
          primaryDurationHours: primary,
          durationHours: primary + general,
          startTurn: 100,
          primaryEndTurn: 100 + primary,
          endTurn: 100 + primary + general,
          primaryEndTime: new Date(now.getTime() + primary * 3600000),
          endTime: new Date(now.getTime() + (primary + general) * 3600000),
        }),
      });
    }
  );

  it("rejects malformed timer edits before writing", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/country/us/elections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", primaryHours: -1 }),
      }),
      { params: Promise.resolve({ code: "us" }) }
    );
    expect(response.status).toBe(400);
    expect(db.collectionMocks.elections!.updateOne).not.toHaveBeenCalled();
  });
});
