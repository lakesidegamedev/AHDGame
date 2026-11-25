import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireBotToken", () => ({ requireBotToken: vi.fn(() => true) }));

describe("GET /api/discord-bot/tickets/pending-resolutions", () => {
  let db: MockDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createMockDb();
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  });

  it("offers unresolved receipts with and without ticket channels to the bot", async () => {
    const tickets = db.collection("tickets");
    db.collectionMocks.tickets = tickets;
    const projection = vi.fn().mockReturnThis();
    tickets.find.mockReturnValue({
      project: projection,
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://example.com/api/discord-bot/tickets/pending-resolutions")
    );

    expect(response.status).toBe(200);
    expect(tickets.find).toHaveBeenCalledWith(
      expect.objectContaining({
        category: { $ne: "investigation" },
        status: { $in: ["resolved", "closed"] },
        "resolution.message": { $exists: true },
        "resolution.deliveredAt": null,
        "resolution.createdAt": { $gte: expect.any(Date) },
        $or: expect.arrayContaining([
          { discordChannelId: { $in: [null, ""] } },
          { $expr: expect.objectContaining({ $or: expect.any(Array) }) },
          { "statusHistory.note": "discord-ticket-close" },
          {
            publicUpdates: {
              $elemMatch: {
                kind: "resolution",
                "delivery.status": { $in: ["failed", "skipped"] },
                "delivery.attempts": { $gte: 5 },
              },
            },
          },
        ]),
      })
    );
    expect(projection).toHaveBeenCalledWith(
      expect.objectContaining({
        discordChannelId: 1,
        resolutionVersion: "$resolution.createdAt",
        channelUpdatePosted: expect.objectContaining({ $or: expect.any(Array) }),
      })
    );
  });

  it("never offers a receipt written before the cutover or older than three days", async () => {
    const { oldestDeliverableReceipt, RESOLUTION_RECEIPT_CUTOVER } = await import("./route");
    // Before the cutover plus three days, the cutover itself is the floor.
    expect(oldestDeliverableReceipt(new Date("2026-11-25T18:25:00.000Z"))).toEqual(RESOLUTION_RECEIPT_CUTOVER);
    // Later, receipts older than three days are never delivered.
    expect(oldestDeliverableReceipt(new Date("2026-12-10T00:00:00.000Z"))).toEqual(new Date("2026-12-07T00:00:00.000Z"));
    const tickets = db.collection("tickets");
    db.collectionMocks.tickets = tickets;
    tickets.find.mockReturnValue({ project: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue([]) });
    const { GET } = await import("./route");
    await GET(new Request("https://example.com/api/discord-bot/tickets/pending-resolutions"));
    const filter = tickets.find.mock.calls.at(-1)?.[0] as { "resolution.createdAt": { $gte: Date } };
    // A receipt from October (the incident) is below the floor.
    expect(new Date("2026-10-20T00:28:22.134Z") < filter["resolution.createdAt"].$gte).toBe(true);
  });
});
