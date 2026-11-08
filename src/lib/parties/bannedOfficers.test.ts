import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { countSeatedOfficersExcludingBanned, vacateBannedOfficerSeats } from "./bannedOfficers";

function world(bannedUser: boolean) {
  const db = createMockDb();
  const chair = new ObjectId();
  const treasurer = new ObjectId();
  const bannedUserId = new ObjectId();
  const okUserId = new ObjectId();
  const cursor = (docs: unknown[]) => ({
    toArray: async () => docs,
    project: () => cursor(docs),
  });
  db.collection("characters").find.mockReturnValue(
    cursor([
      { _id: chair, userId: okUserId },
      { _id: treasurer, userId: bannedUserId },
    ])
  );
  db.collection("users").find.mockReturnValue(cursor(bannedUser ? [{ _id: bannedUserId }] : []));
  return { db: db as unknown as Db, chair, treasurer };
}

describe("banned officer seats", () => {
  it("vacates a banned treasurer on the request's copy of the party", async () => {
    const w = world(true);
    const party = { chairId: w.chair, viceChairId: null, treasurerId: w.treasurer };
    await vacateBannedOfficerSeats(w.db, party);
    expect(party.chairId).toBe(w.chair);
    expect(party.treasurerId).toBeNull();
  });

  it("leaves seats alone when nobody is banned", async () => {
    const w = world(false);
    const party = { chairId: w.chair, viceChairId: null, treasurerId: w.treasurer };
    await vacateBannedOfficerSeats(w.db, party);
    expect(party.treasurerId).toBe(w.treasurer);
  });

  it("counts only unbanned officers toward the two-officer allowance", async () => {
    const banned = world(true);
    expect(
      await countSeatedOfficersExcludingBanned(banned.db, {
        chairId: banned.chair,
        treasurerId: banned.treasurer,
      })
    ).toBe(1);
    const clean = world(false);
    expect(
      await countSeatedOfficersExcludingBanned(clean.db, {
        chairId: clean.chair,
        treasurerId: clean.treasurer,
      })
    ).toBe(2);
  });
});
