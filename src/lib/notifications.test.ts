import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMany = vi.fn();
const insertOne = vi.fn();
vi.mock("@/lib/mongodb", () => ({
  getDb: async () => ({ collection: () => ({ insertMany, insertOne }) }),
}));

const { createNotification, createNotifications, plainDashes } = await import("./notifications");

const SYSTEM = new ObjectId("000000000000000000000000");
const input = (userId: ObjectId, title = "Title", message = "Message") => ({
  userId,
  type: "system" as const,
  title,
  message,
});

describe("notifications", () => {
  beforeEach(() => {
    insertMany.mockReset();
    insertOne.mockReset();
  });

  it("writes nothing for the NPP placeholder owner", async () => {
    await createNotification(input(SYSTEM));
    await createNotifications([input(SYSTEM), input(SYSTEM)]);
    expect(insertOne).not.toHaveBeenCalled();
    expect(insertMany).not.toHaveBeenCalled();
  });

  it("keeps real players in a mixed batch", async () => {
    const player = new ObjectId();
    await createNotifications([input(SYSTEM), input(player)]);
    const docs = insertMany.mock.calls[0]![0] as Array<{ userId: ObjectId }>;
    expect(docs.map((d) => d.userId)).toEqual([player]);
  });

  it("stores player copy without em or en dashes", async () => {
    await createNotification(
      input(new ObjectId(), "Hostile takeover — Acme", "Prices rose — sharply, 3–5%.")
    );
    const doc = insertOne.mock.calls[0]![0] as { title: string; message: string };
    expect(doc.title).toBe("Hostile takeover: Acme");
    expect(doc.message).toBe("Prices rose, sharply, 3-5%.");
  });

  it("turns a spaced dash into a colon in titles and a comma in messages", () => {
    expect(plainDashes("Primary Won — House (NM)", "title")).toBe("Primary Won: House (NM)");
    expect(plainDashes("No sectors were sold — the debt was rolled", "message")).toBe(
      "No sectors were sold, the debt was rolled"
    );
  });
});
