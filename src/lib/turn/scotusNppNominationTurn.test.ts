import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/scotus/nominateJustice", () => ({
  createJusticeNomination: vi.fn(),
}));
vi.mock("@/lib/notifications", () => ({ createNotifications: vi.fn() }));

const cursor = (rows: unknown[]) => ({
  toArray: vi.fn().mockResolvedValue(rows),
  sort: vi.fn().mockReturnThis(),
  project: vi.fn().mockReturnThis(),
});

describe("processScotusNppNominations", () => {
  let db: MockDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("supremeCourtSeats");
    db.collection("electedOfficials");
    db.collection("scotusNominations");
    db.collection("characters");
    db.collectionMocks.characters!.findOne.mockResolvedValue({ userId: new ObjectId() });
    db.collectionMocks.scotusNominations!.find.mockReturnValue(cursor([]));
    const { createJusticeNomination } = await import("@/lib/scotus/nominateJustice");
    vi.mocked(createJusticeNomination).mockResolvedValue({
      ok: true,
      nominationId: new ObjectId(),
      nomineeName: "Scholar",
    });
  });

  const run = async (turn = 500) => {
    const { processScotusNppNominations } = await import("./scotusNppNominationTurn");
    return processScotusNppNominations(turn, db as unknown as Db);
  };

  it("does nothing when no seat is vacant", async () => {
    db.collectionMocks.supremeCourtSeats!.find.mockReturnValue(cursor([]));
    expect((await run()).skipped).toBe("no-vacancy");
  });

  it("leaves a vacancy to a player President", async () => {
    db.collectionMocks.supremeCourtSeats!.find.mockReturnValue(cursor([{ seatNumber: 3 }]));
    db.collectionMocks.electedOfficials!.findOne.mockResolvedValue({
      officeType: "president",
      characterId: new ObjectId(),
      party: "democrat",
    });
    expect((await run()).skipped).toBe("player-president");
    const { createJusticeNomination } = await import("@/lib/scotus/nominateJustice");
    expect(createJusticeNomination).not.toHaveBeenCalled();
  });

  it("starts the vacancy clock for a player President's unstamped seat", async () => {
    db.collectionMocks.supremeCourtSeats!.find.mockReturnValue(cursor([{ seatNumber: 2 }]));
    db.collectionMocks.electedOfficials!.findOne.mockResolvedValue({
      officeType: "president",
      characterId: new ObjectId(),
      party: "democrat",
    });
    await run(500);
    expect(db.collectionMocks.supremeCourtSeats!.updateMany).toHaveBeenCalledWith(
      expect.anything(),
      { $set: { vacantSinceTurn: 500 } }
    );
  });

  it("files a nomination in a player President's party once the grace window has passed", async () => {
    db.collectionMocks.supremeCourtSeats!.find.mockReturnValue(
      cursor([{ seatNumber: 2, vacantSinceTurn: 100 }])
    );
    db.collectionMocks.electedOfficials!.findOne.mockResolvedValue({
      officeType: "president",
      characterId: new ObjectId(),
      characterName: "Player President",
      party: "democrat",
    });
    expect(await run(100 + 96)).toEqual({ nominated: 1 });
    const { createJusticeNomination } = await import("@/lib/scotus/nominateJustice");
    expect(vi.mocked(createJusticeNomination).mock.calls[0][1]).toMatchObject({
      seatNumber: 2,
      generateNppLegalScholar: { party: "democrat" },
    });
  });

  it("files a nomination in the NPP President's party", async () => {
    const nppId = new ObjectId();
    db.collectionMocks.supremeCourtSeats!.find.mockReturnValue(
      cursor([{ seatNumber: 3 }, { seatNumber: 4 }])
    );
    db.collectionMocks.electedOfficials!.findOne.mockResolvedValue({
      officeType: "president",
      characterId: null,
      nppId,
      characterName: "President Npp",
      party: "republican",
    });
    expect(await run()).toEqual({ nominated: 1 });
    const { createJusticeNomination } = await import("@/lib/scotus/nominateJustice");
    expect(createJusticeNomination).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createJusticeNomination).mock.calls[0][1]).toMatchObject({
      seatNumber: 3,
      proposedByPresidentId: nppId,
      generateNppLegalScholar: { party: "republican" },
    });
  });

  it("nominates for the Senate's largest party when the presidency is vacant", async () => {
    db.collectionMocks.supremeCourtSeats!.find.mockReturnValue(cursor([{ seatNumber: 5 }]));
    db.collectionMocks.electedOfficials!.findOne.mockResolvedValue(null);
    db.collectionMocks.electedOfficials!.find.mockReturnValue(
      cursor([
        { party: "democrat", seatsHeld: 1 },
        { party: "republican", seatsHeld: 1 },
        { party: "republican", seatsHeld: 1 },
      ])
    );
    expect(await run()).toEqual({ nominated: 1 });
    const { createJusticeNomination } = await import("@/lib/scotus/nominateJustice");
    expect(vi.mocked(createJusticeNomination).mock.calls[0][1]).toMatchObject({
      seatNumber: 5,
      generateNppLegalScholar: { party: "republican" },
    });
  });

  it("skips a seat still cooling down after a rejected nomination and takes the next", async () => {
    db.collectionMocks.supremeCourtSeats!.find.mockReturnValue(
      cursor([{ seatNumber: 3 }, { seatNumber: 4 }])
    );
    db.collectionMocks.electedOfficials!.findOne.mockResolvedValue({
      officeType: "president",
      characterId: null,
      nppId: new ObjectId(),
      party: "democrat",
    });
    db.collectionMocks.scotusNominations!.find.mockReturnValue(
      cursor([{ seatNumber: 3, votingEndsOnTurn: 490 }])
    );
    expect(await run(500)).toEqual({ nominated: 1 });
    const { createJusticeNomination } = await import("@/lib/scotus/nominateJustice");
    expect(vi.mocked(createJusticeNomination).mock.calls[0][1]).toMatchObject({ seatNumber: 4 });
  });

  it("reminds a player President when a seat opens and again halfway, once each", async () => {
    const { createNotifications } = await import("@/lib/notifications");
    db.collectionMocks.electedOfficials!.findOne.mockResolvedValue({
      officeType: "president",
      characterId: new ObjectId(),
      party: "democrat",
    });
    const seat = (stage: number | null) =>
      cursor([
        { _id: new ObjectId(), seatNumber: 2, vacantSinceTurn: 100, vacancyReminderStage: stage },
      ]);
    db.collectionMocks.supremeCourtSeats!.find.mockReturnValue(seat(null));
    await run(100);
    expect(vi.mocked(createNotifications).mock.calls.at(-1)![0][0]!.title).toBe(
      "Supreme Court seat 2 is vacant"
    );
    vi.mocked(createNotifications).mockClear();
    db.collectionMocks.supremeCourtSeats!.find.mockReturnValue(seat(1));
    await run(120);
    expect(createNotifications).not.toHaveBeenCalled();
    db.collectionMocks.supremeCourtSeats!.find.mockReturnValue(seat(1));
    await run(148);
    expect(vi.mocked(createNotifications).mock.calls.at(-1)![0][0]!.message).toContain(
      "by turn 196"
    );
  });
});
