import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { bulkOps, createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/notifications", () => ({ createNotifications: vi.fn() }));
vi.mock("@/lib/centralBank/helpers", () => ({ vacateFomcChairSeat: vi.fn() }));

const nomineeId = new ObjectId();
const presidentId = new ObjectId();
const nomineeUser = new ObjectId();
const presidentUser = new ObjectId();

function offer(overrides: Record<string, unknown> = {}) {
  return {
    _id: new ObjectId(),
    status: "awaiting_choice",
    countryId: "US",
    positionId: "secretary_of_defense",
    nomineeCharacterId: nomineeId,
    nomineeCharacterName: "Nominee",
    proposedByPresidentId: presidentId,
    choiceExpiresOnTurn: 508,
    ...overrides,
  };
}

function characterFindOne(db: MockDb) {
  db.collectionMocks.characters!.findOne.mockImplementation(async (q: { _id: ObjectId }) =>
    q._id.equals(nomineeId)
      ? { _id: nomineeId, userId: nomineeUser }
      : { _id: presidentId, userId: presidentUser }
  );
}

describe("resolveCabinetNominationChoice", () => {
  let db: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("cabinetNominations");
    db.collection("characters");
    db.collection("centralBanks");
    characterFindOne(db);
  });

  it("accepting stands down the bank chair and queues the seat for the next turn", async () => {
    const nom = offer();
    const bankId = new ObjectId();
    db.collectionMocks.cabinetNominations!.findOne.mockResolvedValue(nom);
    db.collectionMocks.centralBanks!.findOne.mockResolvedValue({
      _id: bankId,
      chairCharacterId: nomineeId,
    });
    const { vacateFomcChairSeat } = await import("@/lib/centralBank/helpers");
    const { resolveCabinetNominationChoice } = await import("./cabinetNominationChoice");

    const result = await resolveCabinetNominationChoice(db as unknown as Db, {
      nominationId: nom._id,
      characterId: nomineeId,
      decision: "accept",
      now: new Date(0),
      currentTurn: 506,
    });

    expect(result.ok).toBe(true);
    expect(vacateFomcChairSeat).toHaveBeenCalledWith(db, bankId);
    expect(db.collectionMocks.centralBanks!.updateOne).toHaveBeenCalledWith(
      { _id: bankId },
      expect.objectContaining({
        $set: expect.objectContaining({
          chairCharacterId: null,
          vacancyAwaitingAutomaticSelection: true,
        }),
      })
    );
    expect(db.collectionMocks.cabinetNominations!.updateOne).toHaveBeenCalledWith(
      { _id: nom._id, status: "awaiting_choice" },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "active", votingEndsOnTurn: 506 }),
      })
    );
    const { createNotifications } = await import("@/lib/notifications");
    const sent = vi.mocked(createNotifications).mock.calls[0]![0];
    expect(sent.map((n) => n.title)).toEqual(["Cabinet Seat Accepted", "Cabinet Seat Accepted"]);
  });

  it("choosing to remain rejects the nomination and keeps the bank office", async () => {
    const nom = offer();
    db.collectionMocks.cabinetNominations!.findOne.mockResolvedValue(nom);
    const { vacateFomcChairSeat } = await import("@/lib/centralBank/helpers");
    const { resolveCabinetNominationChoice } = await import("./cabinetNominationChoice");

    const result = await resolveCabinetNominationChoice(db as unknown as Db, {
      nominationId: nom._id,
      characterId: nomineeId,
      decision: "remain",
      now: new Date(0),
      currentTurn: 506,
    });

    expect(result.ok).toBe(true);
    expect(vacateFomcChairSeat).not.toHaveBeenCalled();
    expect(db.collectionMocks.centralBanks!.updateOne).not.toHaveBeenCalled();
    expect(db.collectionMocks.centralBanks!.updateMany).not.toHaveBeenCalled();
    expect(db.collectionMocks.cabinetNominations!.updateOne).toHaveBeenCalledWith(
      { _id: nom._id, status: "awaiting_choice" },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "rejected",
          rejectionReason: "incompatible_bank_office",
        }),
      })
    );
  });

  it("refuses someone else's offer and an expired one", async () => {
    const { resolveCabinetNominationChoice } = await import("./cabinetNominationChoice");
    db.collectionMocks.cabinetNominations!.findOne.mockResolvedValue(offer());
    const notMine = await resolveCabinetNominationChoice(db as unknown as Db, {
      nominationId: new ObjectId(),
      characterId: new ObjectId(),
      decision: "accept",
      now: new Date(0),
      currentTurn: 506,
    });
    expect(notMine.ok).toBe(false);

    const expired = await resolveCabinetNominationChoice(db as unknown as Db, {
      nominationId: new ObjectId(),
      characterId: nomineeId,
      decision: "accept",
      now: new Date(0),
      currentTurn: 508,
    });
    expect(expired.ok).toBe(false);
    expect(db.collectionMocks.cabinetNominations!.updateOne).not.toHaveBeenCalled();
    expect(db.collectionMocks.centralBanks!.updateMany).not.toHaveBeenCalled();
  });
});

describe("expireUnansweredCabinetNominationChoices", () => {
  let db: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("cabinetNominations");
    db.collection("characters");
  });

  it("rejects lapsed offers in one bulk write and tells both sides", async () => {
    const lapsed = offer({ choiceExpiresOnTurn: 508 });
    db.collectionMocks.cabinetNominations!.find.mockReturnValue({
      toArray: async () => [lapsed],
    } as never);
    db.collectionMocks.characters!.find.mockReturnValue({
      toArray: async () => [
        { _id: nomineeId, userId: nomineeUser },
        { _id: presidentId, userId: presidentUser },
      ],
    } as never);
    const { expireUnansweredCabinetNominationChoices } = await import("./cabinetNominationChoice");

    await expireUnansweredCabinetNominationChoices(db as unknown as Db, new Date(0), 508);

    expect(db.collectionMocks.cabinetNominations!.find).toHaveBeenCalledWith({
      status: "awaiting_choice",
      choiceExpiresOnTurn: { $lte: 508 },
    });
    const ops = bulkOps(db.collectionMocks.cabinetNominations!.bulkWrite);
    expect(ops).toHaveLength(1);
    expect(ops[0]![1].$set).toEqual(
      expect.objectContaining({ status: "rejected", rejectionReason: "incompatible_bank_office" })
    );
    const { createNotifications } = await import("@/lib/notifications");
    const sent = vi.mocked(createNotifications).mock.calls[0]![0];
    expect(sent).toHaveLength(2);
    expect(sent.every((n) => n.title === "Cabinet Nomination Lapsed")).toBe(true);
  });

  it("does nothing when no offer has lapsed", async () => {
    const { expireUnansweredCabinetNominationChoices } = await import("./cabinetNominationChoice");
    await expireUnansweredCabinetNominationChoices(db as unknown as Db, new Date(0), 508);
    expect(db.collectionMocks.cabinetNominations!.bulkWrite).not.toHaveBeenCalled();
    const { createNotifications } = await import("@/lib/notifications");
    expect(createNotifications).not.toHaveBeenCalled();
  });
});
