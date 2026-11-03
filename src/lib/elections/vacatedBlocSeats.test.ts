import { ObjectId, type Db } from "mongodb";
import { describe, expect, it } from "vitest";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { heldBlocRowIds, releaseVacatedBlocSeats } from "./vacatedBlocSeats";

type Doc = Record<string, unknown>;

function world(officials: Doc[], vacancies: Doc[] = []): InMemoryDb & Db {
  const memory = createInMemoryDb();
  memory.seed("electedOfficials", officials);
  memory.seed("ukCommonsVacancies", vacancies);
  return memory as unknown as InMemoryDb & Db;
}

const now = new Date("2026-11-03T12:00:00Z");

describe("releaseVacatedBlocSeats", () => {
  it("drops the seat count from a cleared bloc but keeps a by-election anchor and held rows", async () => {
    const holder = new ObjectId();
    const cleared = {
      _id: new ObjectId(),
      officeType: "bundestag",
      state: "BY",
      characterId: holder,
      party: "CDU",
      seatsHeld: 12,
    };
    const anchor = {
      _id: new ObjectId(),
      officeType: "commons",
      state: "LON",
      characterId: holder,
      party: "Labour",
      seatsHeld: 26,
    };
    const otherHolder = {
      _id: new ObjectId(),
      officeType: "seanad",
      state: "IE",
      characterId: new ObjectId(),
      party: "FF",
      seatsHeld: 3,
    };
    const db = world([cleared, anchor, otherHolder]);

    const ids = await heldBlocRowIds(db, { characterId: holder });
    expect(ids.map(String).sort()).toEqual([String(cleared._id), String(anchor._id)].sort());

    // The holder-clearing write, then the by-election for the Commons seat.
    await db
      .collection("electedOfficials")
      .updateMany(
        { characterId: holder },
        { $set: { characterId: null }, $unset: { party: "", characterName: "" } }
      );
    await db.collection("ukCommonsVacancies").insertOne({ officialId: anchor._id, seats: 26 });

    const released = await releaseVacatedBlocSeats(db, [...ids, otherHolder._id], now);

    expect(released).toBe(1);
    const rows = await db.collection<Doc>("electedOfficials").find({}).toArray();
    const byId = new Map(rows.map((row) => [String(row._id), row]));
    expect(byId.get(String(cleared._id))?.seatsHeld).toBeUndefined();
    expect(byId.get(String(anchor._id))?.seatsHeld).toBe(26);
    expect(byId.get(String(otherHolder._id))?.seatsHeld).toBe(3);
  });

  it("does nothing without rows", async () => {
    expect(await releaseVacatedBlocSeats(world([]), [], now)).toBe(0);
  });
});
