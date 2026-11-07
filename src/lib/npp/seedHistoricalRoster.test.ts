/**
 * Roster application: `seedFromSeats` with a rostered `presetId` seats the
 * authored fictional identity (name, birth year) for that seat, and leaves
 * every other seat on the generated path. No preset seats a real politician,
 * and no authored seat pins a specific portrait.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { seedFromSeats } from "@/lib/npp/seedHistorical";
import { seatGroupsFor, type HistoricalSeat } from "@/lib/constants/historicalSeats";
import { REAL_POLITICIAN_NAME_SAMPLE } from "@/lib/test-utils/realPoliticianNames";
import { buildSeatId } from "@/lib/seats";
import { collectSeatIntegrity } from "@/lib/turn/gameHealthSnapshot";
import type { Db } from "mongodb";

vi.mock("@/lib/db/sequentialId", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/sequentialId")>();
  let n = 1000;
  return {
    ...actual,
    reserveSequentialIds: vi.fn(async (_db: unknown, _type: unknown, count: number) =>
      Array.from({ length: count }, () => ++n)
    ),
  };
});

const STATES = [{ _id: "CA", countryId: "US" }];

// Fixed 1991 CA delegation rows. The 1991 preset used to overlay real
// officeholders here; every one must now be generated.
const SEATS: HistoricalSeat[] = [
  { state: "CA", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "CA", officeType: "senate", party: "democrat", senateClass: 3 },
  { state: "CA", officeType: "house", party: "republican", seatsHeld: 5 },
  { state: "CA", officeType: "house", party: "green", seatsHeld: 1 },
];

function statefulDb(): {
  db: MockDb;
  officials: Array<Record<string, unknown>>;
  npps: Array<Record<string, unknown>>;
} {
  const db = createMockDb();
  const officials: Array<Record<string, unknown>> = [];
  const npps: Array<Record<string, unknown>> = [];

  db.collection("states");
  db.collectionMocks["states"].find = vi.fn().mockReturnValue({
    project: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue(STATES),
  });

  const nppsCol = db.collection("npps");
  nppsCol.find = vi.fn().mockImplementation(() => ({
    project: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue(npps.filter((n) => n.retiredAt == null)),
  }));
  nppsCol.insertMany = vi.fn().mockImplementation(async (docs: Array<Record<string, unknown>>) => {
    npps.push(...docs);
    return { insertedIds: {} };
  });
  nppsCol.aggregate = vi.fn().mockReturnValue({
    toArray: vi.fn().mockResolvedValue([]),
  });

  const officialsCol = db.collection("electedOfficials");
  officialsCol.insertMany = vi
    .fn()
    .mockImplementation(async (docs: Array<Record<string, unknown>>) => {
      officials.push(...docs);
      return { insertedIds: {} };
    });
  officialsCol.aggregate = vi.fn().mockReturnValue({
    toArray: vi.fn().mockResolvedValue([]),
  });

  const partiesCol = db.collection("politicalParties");
  partiesCol.findOne = vi.fn().mockResolvedValue(null);

  return { db, officials, npps };
}

describe("seedFromSeats historical roster", () => {
  let ctx: ReturnType<typeof statefulDb>;

  beforeEach(() => {
    ctx = statefulDb();
  });

  it("seats the fictional 2027 president and vice president with generic portraits", async () => {
    const executive = seatGroupsFor("2027-default").US!.filter(
      (seat) => seat.officeType === "president" || seat.officeType === "vicePresident"
    );
    const result = await seedFromSeats(ctx.db as unknown as Db, executive, "winners", {
      presetId: "2027-default",
    });

    expect(result).toMatchObject({ nppsCreated: 2, officialsCreated: 2 });
    const byName = new Map(ctx.npps.map((n) => [n.name, n]));
    expect(byName.get("Warren Hollister")).toMatchObject({
      birthYear: 1951,
      gender: "male",
      currentOffice: { type: "president" },
    });
    expect(byName.get("Colin Ashby")).toMatchObject({
      birthYear: 1982,
      currentOffice: { type: "vicePresident" },
    });
    for (const npp of ctx.npps) {
      // A portrait, when present, is an opaque generic pick.
      if (npp.avatarUrl) expect(npp.avatarUrl).toMatch(/^\/api\/images\/npp-politicians\/p-/);
    }
  });

  it.each(["1991-default", "2019-default"])(
    "generates every seated identity on %s",
    async (preset) => {
      const result = await seedFromSeats(ctx.db as unknown as Db, SEATS, "winners", {
        presetId: preset,
      });

      expect(result.nppsCreated).toBe(4);
      expect(ctx.npps.every((n) => !("birthYear" in n))).toBe(true);
      const names = ctx.npps.map((n) => String(n.name));
      for (const real of REAL_POLITICIAN_NAME_SAMPLE) expect(names).not.toContain(real);
    }
  );

  it.each(["1991-default", "2019-default"])(
    "seats a generated Irish Uachtar\u00e1n at %s opening",
    async (preset) => {
      const presidentialSeats = seatGroupsFor(preset).IE!.filter(
        (seat) => seat.officeType === "uachtaran"
      );
      expect(presidentialSeats).toEqual([
        { state: "IE", officeType: "uachtaran", party: "ie_ind" },
      ]);

      const result = await seedFromSeats(ctx.db as unknown as Db, presidentialSeats, "winners", {
        presetId: preset,
      });
      expect(result).toMatchObject({ nppsCreated: 1, officialsCreated: 1 });
      expect(ctx.npps).toHaveLength(1);
      expect(ctx.npps[0]).toMatchObject({ countryId: "IE", currentOffice: { type: "uachtaran" } });
      expect(ctx.npps[0]).not.toHaveProperty("birthYear");
      expect(["Mary Robinson", "Michael D. Higgins"]).not.toContain(ctx.npps[0]!.name);
      expect(ctx.officials).toHaveLength(1);
      expect(ctx.officials[0]).toMatchObject({
        countryId: "IE",
        officeType: "uachtaran",
        state: "IE",
        characterName: ctx.npps[0]!.name,
      });

      const seatId = buildSeatId("IE", "uachtaran", "IE");
      ctx.db.collection("seats");
      ctx.db.collectionMocks.seats!.find.mockReturnValue({
        toArray: vi
          .fn()
          .mockResolvedValue([
            { _id: seatId, countryId: "IE", electionType: "uachtaran", state: "IE" },
          ]),
      });
      ctx.db.collectionMocks.electedOfficials!.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue(ctx.officials),
      });
      expect(await collectSeatIntegrity(ctx.db as unknown as Db)).toEqual({
        orphanedOfficialCount: 0,
        seatBackedSeatsWithoutOfficials: 0,
      });
    }
  );

  it.each(["1999-default", "2007-default"])(
    "does not back-project the 2019 presidential seat into %s",
    (preset) => {
      expect(seatGroupsFor(preset).IE!.some((seat) => seat.officeType === "uachtaran")).toBe(false);
    }
  );
});
