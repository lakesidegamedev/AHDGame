import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMany = vi.fn();
const insertOne = vi.fn();
let corporationDocs: Array<Record<string, unknown>> = [];
vi.mock("@/lib/mongodb", () => ({
  getDb: async () => ({
    collection: () => ({
      insertMany,
      insertOne,
      find: () => ({ toArray: async () => corporationDocs }),
    }),
  }),
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
    corporationDocs = [];
  });

  describe("corporation alerts", () => {
    it("tag the character who runs the corporation, not the whole account", async () => {
      const owner = new ObjectId();
      const ceo = new ObjectId();
      const corp = new ObjectId();
      corporationDocs = [{ _id: corp, userId: owner, ceoId: ceo, ceoType: "character" }];
      await createNotifications([
        {
          ...input(owner),
          metadata: { corporationId: corp.toString() },
        },
      ]);
      const docs = insertMany.mock.calls[0]![0] as Array<{ metadata: Record<string, unknown> }>;
      expect(docs[0]!.metadata.recipientCharacterId).toBe(ceo.toString());
    });

    it("keeps a character the producer already named", async () => {
      const owner = new ObjectId();
      const corp = new ObjectId();
      corporationDocs = [{ _id: corp, userId: owner, ceoId: new ObjectId(), ceoType: "character" }];
      await createNotification({
        ...input(owner),
        metadata: { corporationId: corp.toString(), recipientCharacterId: "explicit" },
      });
      const doc = insertOne.mock.calls[0]![0] as { metadata: Record<string, unknown> };
      expect(doc.metadata.recipientCharacterId).toBe("explicit");
    });

    it("leave alerts to other accounts and vacant seats untagged", async () => {
      const owner = new ObjectId();
      const corp = new ObjectId();
      corporationDocs = [{ _id: corp, userId: owner, ceoId: new ObjectId(), ceoType: "character" }];
      await createNotification({
        ...input(new ObjectId()),
        metadata: { corporationId: corp.toString() },
      });
      const doc = insertOne.mock.calls[0]![0] as { metadata: Record<string, unknown> };
      expect(doc.metadata.recipientCharacterId).toBeUndefined();
    });
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
