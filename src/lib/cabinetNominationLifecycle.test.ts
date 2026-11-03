import { beforeEach, describe, it, expect, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { bulkOps, createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { didPass } from "./billLifecycleHelpers";

/**
 * Cabinet nominations use the same didPass logic as bills (simple majority).
 * This test verifies the shared helper used by cabinetNominationLifecycle.
 */
describe("cabinetNominationLifecycle (didPass)", () => {
  it("uses didPass for simple majority: votesFor > votesAgainst confirms", () => {
    expect(didPass(52, 48)).toBe(true);
    expect(didPass(51, 49)).toBe(true);
  });

  it("votesFor <= votesAgainst rejects", () => {
    expect(didPass(48, 52)).toBe(false);
    expect(didPass(50, 50)).toBe(false);
  });
});

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/gameState", () => ({ getGameState: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotifications: vi.fn() }));
vi.mock("@/lib/congress/governmentVoteBreakdown", () => ({
  computeCabinetNominationTally: vi.fn(),
}));
vi.mock("@/lib/analytics/officeTransitionAnalytics", () => ({
  captureOfficeTransition: vi.fn().mockResolvedValue(undefined),
}));

describe("processCabinetNominationLifecycle — holder seating", () => {
  let db: MockDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createMockDb();
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
    const { getGameState } = await import("@/lib/gameState");
    vi.mocked(getGameState).mockResolvedValue({ currentTurn: 100 } as never);
    db.collection("cabinetNominations");
    db.collection("cabinetMembers");
    db.collection("cabinetSettings");
    db.collection("characters");
    db.collection("electedOfficials");
  });

  it("closes nominations due on the incoming turn but leaves later deadlines open", async () => {
    const due = {
      _id: new ObjectId(),
      status: "active",
      countryId: "US",
      positionId: "secretary_of_treasury",
      nomineeCharacterId: new ObjectId(),
      nomineeCharacterName: "Due Nominee",
      nomineeParty: "democrat",
      proposedByPresidentId: new ObjectId(),
      votingEndsOnTurn: 101,
      votes: {},
    };
    const future = { ...due, _id: new ObjectId(), votingEndsOnTurn: 102 };
    const nominations = [due, future];

    db.collectionMocks.cabinetNominations.find.mockImplementation(
      (query: Record<string, unknown>) => {
        // The unanswered-offer sweep queries awaiting_choice without a $or clause.
        if (!query.$or) return { toArray: vi.fn().mockResolvedValue([]) } as never;
        const turnClause = (query.$or as Array<{ votingEndsOnTurn: Record<string, number> }>)[0]
          .votingEndsOnTurn;
        const found =
          "$lte" in turnClause
            ? nominations.filter((nom) => nom.votingEndsOnTurn <= turnClause.$lte)
            : nominations.filter((nom) => nom.votingEndsOnTurn > turnClause.$gt);
        return { toArray: vi.fn().mockResolvedValue(found) } as never;
      }
    );
    const { computeCabinetNominationTally } =
      await import("@/lib/congress/governmentVoteBreakdown");
    vi.mocked(computeCabinetNominationTally).mockResolvedValue({
      votesFor: 40,
      votesAgainst: 60,
      votesAbstain: 0,
    } as never);

    const { processCabinetNominationLifecycle } = await import("./cabinetNominationLifecycle");
    await processCabinetNominationLifecycle(new Date(0));

    const rejectedOps = bulkOps(db.collectionMocks.cabinetNominations.bulkWrite);
    expect(rejectedOps).toHaveLength(1);
    expect(rejectedOps[0]![0]).toEqual({ _id: due._id });
    expect(rejectedOps[0]![1].$set).toEqual(expect.objectContaining({ status: "rejected" }));
  });

  it("rejects a nominee who joined the Fed Board while the cabinet vote was pending", async () => {
    const id = new ObjectId();
    const nom = {
      _id: new ObjectId(),
      countryId: "US",
      positionId: "secretary_of_state",
      nomineeCharacterId: id,
      votes: {},
      proposedByPresidentId: new ObjectId(),
    };
    db.collectionMocks.cabinetNominations.find.mockReturnValue({
      toArray: async () => [nom],
    } as never);
    db.collection("centralBanks");
    db.collectionMocks.centralBanks.find.mockReturnValue({
      toArray: async () => [
        {
          countryId: "US",
          chairCharacterId: null,
          fomcBoard: [{ occupantType: "player", characterId: id }],
        },
      ],
    } as never);
    const { computeCabinetNominationTally } =
      await import("@/lib/congress/governmentVoteBreakdown");
    vi.mocked(computeCabinetNominationTally).mockResolvedValue({
      votesFor: 60,
      votesAgainst: 40,
      votesAbstain: 0,
    } as never);
    const { processCabinetNominationLifecycle } = await import("./cabinetNominationLifecycle");
    await processCabinetNominationLifecycle(new Date(0));
    expect(db.collectionMocks.cabinetMembers.insertOne).not.toHaveBeenCalled();
    const rejectedOps = bulkOps(db.collectionMocks.cabinetNominations.bulkWrite);
    expect(rejectedOps).toHaveLength(1);
    expect(rejectedOps[0]![0]).toEqual({ _id: nom._id });
    expect(rejectedOps[0]![1].$set).toEqual(expect.objectContaining({ status: "rejected" }));
  });

  it("resets the position's setting cooldowns when a nominee is confirmed", async () => {
    const nomination = {
      _id: new ObjectId(),
      status: "active",
      countryId: "US",
      positionId: "secretary_of_treasury",
      nomineeCharacterId: new ObjectId(),
      nomineeCharacterName: "New Secretary",
      nomineeParty: "democrat",
      proposedByPresidentId: new ObjectId(),
      votes: {},
    };

    // The lifecycle runs two finds against cabinetNominations: active (votingEndsOnTurn $gt)
    // then expired (votingEndsOnTurn $lte). Only the expired query should return our doc.
    db.collectionMocks.cabinetNominations.find.mockImplementation(
      (query: Record<string, unknown>) => {
        const orClause = (query?.$or as Array<{ votingEndsOnTurn?: Record<string, unknown> }>)?.[0]
          ?.votingEndsOnTurn;
        const isExpiredQuery = !!orClause && "$lte" in orClause;
        return {
          toArray: vi.fn().mockResolvedValue(isExpiredQuery ? [nomination] : []),
        } as never;
      }
    );

    // Senate passes the nomination.
    const { computeCabinetNominationTally } =
      await import("@/lib/congress/governmentVoteBreakdown");
    vi.mocked(computeCabinetNominationTally).mockResolvedValue({
      votesFor: 60,
      votesAgainst: 40,
      votesAbstain: 0,
    } as never);

    const { processCabinetNominationLifecycle } = await import("./cabinetNominationLifecycle");
    await processCabinetNominationLifecycle(new Date(0));

    expect(db.collectionMocks.cabinetSettings.updateOne).toHaveBeenCalledWith(
      { _id: "US_secretary_of_treasury" },
      {
        $unset: {
          lastChangedTurn: "",
          lastAllocationChangedTurn: "",
          lastRegionChangedTurn: "",
          lastTargetCountryChangedTurn: "",
          lastAidPriorityChangedTurn: "",
        },
      }
    );
  });

  it("vacates the nominee's existing seat before seating them in the new one", async () => {
    // Regression: a sitting secretary confirmed to a second position tripped
    // the cabinetMembers_countryId_characterId unique index on insert, so the
    // nomination stayed active and the phase failed every turn (turns 524-536,
    // 2026-08-31). A confirmed move must vacate the old office first.
    const nomineeId = new ObjectId();
    const nomination = {
      _id: new ObjectId(),
      status: "active",
      countryId: "US",
      positionId: "attorney_general",
      nomineeCharacterId: nomineeId,
      nomineeCharacterName: "Sitting Secretary",
      nomineeParty: "republican",
      proposedByPresidentId: new ObjectId(),
      votes: {},
    };
    db.collectionMocks.cabinetNominations.find.mockImplementation(
      (query: Record<string, unknown>) => {
        const orClause = (query?.$or as Array<{ votingEndsOnTurn?: Record<string, unknown> }>)?.[0]
          ?.votingEndsOnTurn;
        const isExpiredQuery = !!orClause && "$lte" in orClause;
        return {
          toArray: vi.fn().mockResolvedValue(isExpiredQuery ? [nomination] : []),
        } as never;
      }
    );

    const { computeCabinetNominationTally } =
      await import("@/lib/congress/governmentVoteBreakdown");
    vi.mocked(computeCabinetNominationTally).mockResolvedValue({
      votesFor: 60,
      votesAgainst: 40,
      votesAbstain: 0,
    } as never);

    const { processCabinetNominationLifecycle } = await import("./cabinetNominationLifecycle");
    await processCabinetNominationLifecycle(new Date(0));

    expect(db.collectionMocks.cabinetMembers.deleteMany).toHaveBeenCalledWith({
      countryId: "US",
      characterId: nomineeId,
    });
    // The vacate must land before the insert, or the unique index still throws.
    const vacateOrder = db.collectionMocks.cabinetMembers.deleteMany.mock.invocationCallOrder[0];
    const insertOrder = db.collectionMocks.cabinetMembers.insertOne.mock.invocationCallOrder[0];
    expect(vacateOrder).toBeLessThan(insertOrder);
    const inserted = db.collectionMocks.cabinetMembers.insertOne.mock.calls[0][0];
    expect(inserted.positionId).toBe("attorney_general");
    expect(inserted.characterId).toBe(nomineeId);
  });

  it.each(["US", "NG"])(
    "seats a confirmed %s NPP nominee with matching telemetry nation",
    async (countryId) => {
      const nppId = new ObjectId();
      const nomination = {
        _id: new ObjectId(),
        status: "active",
        countryId,
        positionId: "secretary_of_state",
        nomineeCharacterId: null,
        nomineeNppId: nppId,
        nomineeMode: "npp",
        nomineeCharacterName: "NPP Secretary",
        nomineeParty: "1",
        proposedByPresidentId: new ObjectId(),
        votes: {},
      };
      db.collectionMocks.cabinetNominations.find.mockImplementation(
        (query: Record<string, unknown>) => {
          const orClause = (
            query?.$or as Array<{ votingEndsOnTurn?: Record<string, unknown> }>
          )?.[0]?.votingEndsOnTurn;
          const isExpiredQuery = !!orClause && "$lte" in orClause;
          return {
            toArray: vi.fn().mockResolvedValue(isExpiredQuery ? [nomination] : []),
          } as never;
        }
      );

      const { computeCabinetNominationTally } =
        await import("@/lib/congress/governmentVoteBreakdown");
      vi.mocked(computeCabinetNominationTally).mockResolvedValue({
        votesFor: 60,
        votesAgainst: 40,
        votesAbstain: 0,
      } as never);

      const { processCabinetNominationLifecycle } = await import("./cabinetNominationLifecycle");
      await processCabinetNominationLifecycle(new Date(0));

      const inserted = db.collectionMocks.cabinetMembers.insertOne.mock.calls[0][0];
      expect(inserted.positionId).toBe("secretary_of_state");
      expect(inserted.characterId).toBeNull();
      expect(inserted.isNPP).toBe(true);
      expect(inserted.nppId).toBe(nppId);
      // No character-doc writes for an NPP nominee: no vacate-by-character, no career push.
      expect(db.collectionMocks.cabinetMembers.deleteMany).not.toHaveBeenCalled();
      expect(db.collectionMocks.characters.updateOne).not.toHaveBeenCalled();
      const { captureOfficeTransition } = await import("@/lib/analytics/officeTransitionAnalytics");
      expect(captureOfficeTransition).toHaveBeenCalledWith(
        expect.objectContaining({
          transitionType: "gained",
          nationId: countryId,
          officeType: countryId === "US" ? "usCabinet" : "parliamentaryCabinet",
        })
      );
    }
  );

  it("does not emit an office transition when the same NPP is reconfirmed", async () => {
    const nppId = new ObjectId();
    const nomination = {
      _id: new ObjectId(),
      status: "active",
      positionId: "secretary_of_state",
      nomineeCharacterId: null,
      nomineeNppId: nppId,
      nomineeMode: "npp",
      nomineeParty: "1",
      votes: {},
    };
    db.collectionMocks.cabinetNominations.find.mockImplementation(
      (query: Record<string, unknown>) =>
        ({
          toArray: vi
            .fn()
            .mockResolvedValue(
              query.$or &&
                "$lte" in (query.$or as Array<{ votingEndsOnTurn: object }>)[0].votingEndsOnTurn
                ? [nomination]
                : []
            ),
        }) as never
    );
    db.collectionMocks.cabinetMembers.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: new ObjectId(),
          countryId: "US",
          positionId: nomination.positionId,
          nppId: new ObjectId(nppId.toString()),
          party: "1",
        },
      ]),
    } as never);
    const { computeCabinetNominationTally } =
      await import("@/lib/congress/governmentVoteBreakdown");
    vi.mocked(computeCabinetNominationTally).mockResolvedValue({
      votesFor: 60,
      votesAgainst: 40,
      votesAbstain: 0,
    } as never);
    const { processCabinetNominationLifecycle } = await import("./cabinetNominationLifecycle");
    await processCabinetNominationLifecycle(new Date(0));
    const { captureOfficeTransition } = await import("@/lib/analytics/officeTransitionAnalytics");
    expect(captureOfficeTransition).not.toHaveBeenCalled();
    expect(db.collectionMocks.cabinetMembers.find).toHaveBeenCalledWith(expect.anything(), {
      projection: { countryId: 1, positionId: 1, characterId: 1, nppId: 1, party: 1 },
    });
  });

  it("does not reset cooldowns when a nominee is rejected", async () => {
    const nomination = {
      _id: new ObjectId(),
      status: "active",
      countryId: "US",
      positionId: "secretary_of_treasury",
      nomineeCharacterId: new ObjectId(),
      nomineeCharacterName: "Rejected Pick",
      nomineeParty: "democrat",
      proposedByPresidentId: new ObjectId(),
      votes: {},
    };
    db.collectionMocks.cabinetNominations.find.mockImplementation(
      (query: Record<string, unknown>) => {
        const orClause = (query?.$or as Array<{ votingEndsOnTurn?: Record<string, unknown> }>)?.[0]
          ?.votingEndsOnTurn;
        const isExpiredQuery = !!orClause && "$lte" in orClause;
        return {
          toArray: vi.fn().mockResolvedValue(isExpiredQuery ? [nomination] : []),
        } as never;
      }
    );

    const { computeCabinetNominationTally } =
      await import("@/lib/congress/governmentVoteBreakdown");
    vi.mocked(computeCabinetNominationTally).mockResolvedValue({
      votesFor: 40,
      votesAgainst: 60,
      votesAbstain: 0,
    } as never);

    const { processCabinetNominationLifecycle } = await import("./cabinetNominationLifecycle");
    await processCabinetNominationLifecycle(new Date(0));

    expect(db.collectionMocks.cabinetSettings.updateOne).not.toHaveBeenCalled();
  });

  it("seats a Chief of Staff with no Senate votes cast", async () => {
    const nomination = {
      _id: new ObjectId(),
      status: "active",
      countryId: "US",
      positionId: "chief_of_staff",
      nomineeCharacterId: new ObjectId(),
      nomineeCharacterName: "Chief Pick",
      nomineeParty: "democrat",
      proposedByPresidentId: new ObjectId(),
      votes: {},
    };
    db.collectionMocks.cabinetNominations.find.mockImplementation(
      (query: Record<string, unknown>) => {
        const orClause = (query?.$or as Array<{ votingEndsOnTurn?: Record<string, unknown> }>)?.[0]
          ?.votingEndsOnTurn;
        const isExpiredQuery = !!orClause && "$lte" in orClause;
        return {
          toArray: vi.fn().mockResolvedValue(isExpiredQuery ? [nomination] : []),
        } as never;
      }
    );
    // An empty Senate tally would reject an ordinary seat.
    const { computeCabinetNominationTally } =
      await import("@/lib/congress/governmentVoteBreakdown");
    vi.mocked(computeCabinetNominationTally).mockResolvedValue({
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
    } as never);

    const { processCabinetNominationLifecycle } = await import("./cabinetNominationLifecycle");
    await processCabinetNominationLifecycle(new Date(0));

    expect(db.collectionMocks.cabinetMembers.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ positionId: "chief_of_staff", characterName: "Chief Pick" })
    );
    expect(db.collectionMocks.cabinetNominations.updateOne).toHaveBeenCalledWith(
      { _id: nomination._id },
      { $set: expect.objectContaining({ status: "confirmed" }) }
    );
  });

  it("scopes NPP catch-up votes to the nomination's own country, not the US preload (#2889)", async () => {
    // A non-US (NG) active nomination must resolve its own country-scoped NPP
    // officials inside castNPPCabinetVotes, rather than reusing the US preload —
    // otherwise US NPP senators' votes leak into the foreign nomination (ticket #923).
    const ngNomination = {
      _id: new ObjectId(),
      status: "active",
      countryId: "NG",
      positionId: "minister_of_finance",
      nomineeCharacterId: new ObjectId(),
      nomineeCharacterName: "NG Finance Nominee",
      nomineeParty: "apc",
      proposedByPresidentId: new ObjectId(),
      votes: {},
    };

    // Return the NG nomination only for the ACTIVE query ($gt current turn);
    // the expired query ($lte) is empty.
    db.collectionMocks.cabinetNominations.find.mockImplementation(
      (query: Record<string, unknown>) => {
        const orClause = (query?.$or as Array<{ votingEndsOnTurn?: Record<string, unknown> }>)?.[0]
          ?.votingEndsOnTurn;
        const isActiveQuery = !!orClause && "$gt" in orClause;
        return {
          toArray: vi.fn().mockResolvedValue(isActiveQuery ? [ngNomination] : []),
        } as never;
      }
    );

    // No NPP officials anywhere — castNPPCabinetVotes early-returns after its
    // country-scoped find, which is all we need to assert the scoping.
    db.collectionMocks.electedOfficials.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    } as never);
    db.collectionMocks.electedOfficials.findOne.mockResolvedValue(null as never);

    const { processCabinetNominationLifecycle } = await import("./cabinetNominationLifecycle");
    await processCabinetNominationLifecycle(new Date(0));

    // The catch-up path queried NG NPP officials directly — which only happens
    // because the US preload was correctly withheld for the non-US nomination.
    // (If the preload leaked in, castNPPCabinetVotes would reuse it and never
    // issue this NG-scoped find.)
    expect(db.collectionMocks.electedOfficials.find).toHaveBeenCalledWith(
      expect.objectContaining({ countryId: "NG", isNPP: true })
    );
  });

  it("replaces an acting holder on confirmation, carrying no acting fields, and never refunds the charge", async () => {
    db.collection("actingAppointmentCharges");
    const nomination = {
      _id: new ObjectId(),
      status: "active",
      countryId: "US",
      positionId: "secretary_of_treasury",
      nomineeCharacterId: new ObjectId(),
      nomineeCharacterName: "Confirmed Secretary",
      nomineeParty: "democrat",
      proposedByPresidentId: new ObjectId(),
      votes: {},
    };
    db.collectionMocks.cabinetNominations.find.mockImplementation(
      (query: Record<string, unknown>) => {
        const orClause = (query?.$or as Array<{ votingEndsOnTurn?: Record<string, unknown> }>)?.[0]
          ?.votingEndsOnTurn;
        const isExpiredQuery = !!orClause && "$lte" in orClause;
        return {
          toArray: vi.fn().mockResolvedValue(isExpiredQuery ? [nomination] : []),
        } as never;
      }
    );

    const { computeCabinetNominationTally } =
      await import("@/lib/congress/governmentVoteBreakdown");
    vi.mocked(computeCabinetNominationTally).mockResolvedValue({
      votesFor: 60,
      votesAgainst: 40,
      votesAbstain: 0,
    } as never);

    const { processCabinetNominationLifecycle } = await import("./cabinetNominationLifecycle");
    await processCabinetNominationLifecycle(new Date(0));

    // Confirmation ends any acting term for the seat: the seat is cleared
    // country-scoped (position ids repeat across countries) and the incoming
    // holder carries none of the acting tenure stamps.
    expect(db.collectionMocks.cabinetMembers.deleteOne).toHaveBeenCalledWith({
      countryId: "US",
      positionId: "secretary_of_treasury",
    });
    const inserted = db.collectionMocks.cabinetMembers.insertOne.mock.calls[0][0];
    expect(inserted.acting).toBeUndefined();
    expect(inserted.actingSinceTurn).toBeUndefined();
    expect(inserted.actingExpiresOnTurn).toBeUndefined();

    // The charge stays spent, so the seat cannot be acting-filled again this
    // presidency even though confirmation has now happened.
    expect(db.collectionMocks.actingAppointmentCharges.deleteOne).not.toHaveBeenCalled();
    expect(db.collectionMocks.actingAppointmentCharges.deleteMany).not.toHaveBeenCalled();
  });
});

describe("Fed confirmation cabinet conflict", () => {
  it.each([
    { countryId: "US", makeChair: false, isChair: false },
    { countryId: "US", makeChair: true, isChair: false },
    { countryId: "UK", makeChair: false, isChair: true },
    { countryId: "JP", makeChair: true, isChair: false },
  ])(
    "rejects a cabinet member at confirmation: $countryId makeChair=$makeChair isChair=$isChair",
    async ({ countryId, makeChair, isChair }) => {
      vi.clearAllMocks();
      const db = createMockDb();
      const id = new ObjectId();
      const nom = {
        _id: new ObjectId(),
        bankId: countryId,
        countryId,
        seatId: "seat-1",
        nomineeCharacterId: id,
        makeChair,
        occupantType: "player",
        proposedByPresidentId: new ObjectId(),
        votes: {},
      };
      const { getDb } = await import("@/lib/mongodb");
      vi.mocked(getDb).mockResolvedValue(db as never);
      const { getGameState } = await import("@/lib/gameState");
      vi.mocked(getGameState).mockResolvedValue({ currentTurn: 100 } as never);
      db.collection("fomcNominations");
      db.collectionMocks.fomcNominations.find.mockImplementation(
        (query: Record<string, unknown>) =>
          ({
            toArray: async () => ("$lte" in (query.votingEndsOnTurn as object) ? [nom] : []),
          }) as never
      );
      db.collection("cabinetMembers");
      db.collectionMocks.cabinetMembers.find.mockReturnValue({
        toArray: async () => [{ characterId: id }],
      } as never);
      db.collection("centralBanks");
      db.collectionMocks.centralBanks.findOne.mockResolvedValue({
        countryId,
        fomcBoard: [{ seatId: "seat-1", isChair }],
      });
      const { computeCabinetNominationTally } =
        await import("@/lib/congress/governmentVoteBreakdown");
      vi.mocked(computeCabinetNominationTally).mockResolvedValue({
        votesFor: 60,
        votesAgainst: 40,
        votesAbstain: 0,
      } as never);
      const { processFomcNominationLifecycle } = await import("./fomcNominationLifecycle");
      const result = await processFomcNominationLifecycle(new Date(0));
      expect(result).toEqual({ nominationsProcessed: 1, confirmed: 0, rejected: 1 });
      expect(db.collectionMocks.centralBanks.updateOne).not.toHaveBeenCalled();
    }
  );
});

describe("processCabinetNominationLifecycle — rejection notices", () => {
  let db: MockDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createMockDb();
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
    const { getGameState } = await import("@/lib/gameState");
    vi.mocked(getGameState).mockResolvedValue({ currentTurn: 505 } as never);
    db.collection("cabinetNominations");
    db.collection("cabinetMembers");
    db.collection("characters");
    db.collection("centralBanks");
    db.collection("electedOfficials");
  });

  async function runWith(nom: Record<string, unknown>, banks: unknown[], tally: unknown) {
    db.collectionMocks.cabinetNominations.find.mockImplementation(
      () => ({ toArray: async () => [nom] }) as never
    );
    db.collectionMocks.centralBanks.find.mockImplementation(
      () => ({ toArray: async () => banks }) as never
    );
    const { computeCabinetNominationTally } =
      await import("@/lib/congress/governmentVoteBreakdown");
    vi.mocked(computeCabinetNominationTally).mockResolvedValue(tally as never);
    const { processCabinetNominationLifecycle } = await import("./cabinetNominationLifecycle");
    await processCabinetNominationLifecycle(new Date(0));
  }

  function findMockFor(nomineeId: ObjectId, presidentId: ObjectId) {
    const nomineeUser = new ObjectId();
    const presidentUser = new ObjectId();
    db.collectionMocks.characters.findOne.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (query: any) => {
        const id = String(query?._id);
        if (id === nomineeId.toString())
          return Promise.resolve({ _id: nomineeId, userId: nomineeUser });
        if (id === presidentId.toString())
          return Promise.resolve({ _id: presidentId, userId: presidentUser });
        return Promise.resolve(null);
      }
    );
    return { nomineeUser, presidentUser };
  }

  it("offers the seat to a Senate-winning nominee blocked by a bank office", async () => {
    // A 57-17 confirmation used to be voided by the dual-office guard; the
    // nominee is now offered the seat instead of losing it in silence.
    const nomineeId = new ObjectId();
    const presidentId = new ObjectId();
    const { nomineeUser, presidentUser } = findMockFor(nomineeId, presidentId);
    const nom = {
      _id: new ObjectId(),
      countryId: "US",
      positionId: "secretary_of_defense",
      nomineeCharacterId: nomineeId,
      nomineeCharacterName: "Nominee",
      nomineeParty: "democrat",
      proposedByPresidentId: presidentId,
      votes: {},
    };

    await runWith(nom, [{ countryId: "US", chairCharacterId: nomineeId, fomcBoard: [] }], {
      votesFor: 57,
      votesAgainst: 17,
      votesAbstain: 8,
    });

    const offerOps = bulkOps(db.collectionMocks.cabinetNominations.bulkWrite);
    expect(offerOps).toHaveLength(1);
    expect(offerOps[0]![0]).toEqual({ _id: nom._id });
    expect(offerOps[0]![1].$set).toEqual(
      expect.objectContaining({
        status: "awaiting_choice",
        choiceOfferedAt: new Date(0),
        choiceExpiresOnTurn: 508,
      })
    );

    const { createNotifications } = await import("@/lib/notifications");
    const sent = vi.mocked(createNotifications).mock.calls[0][0] as unknown as Array<{
      userId: unknown;
      title: string;
      message: string;
    }>;
    const toNominee = sent.find((n) => String(n.userId) === nomineeUser.toString());
    expect(toNominee?.title).toBe("Cabinet Seat Offered");
    expect(toNominee?.message).toContain("central bank");
    const toPresident = sent.find((n) => String(n.userId) === presidentUser.toString());
    expect(toPresident?.message).toContain("won the Senate vote");
  });

  it("records a plain ballot defeat as a vote rejection and still tells the nominee", async () => {
    const nomineeId = new ObjectId();
    const presidentId = new ObjectId();
    const { nomineeUser } = findMockFor(nomineeId, presidentId);
    const nom = {
      _id: new ObjectId(),
      countryId: "US",
      positionId: "secretary_of_state",
      nomineeCharacterId: nomineeId,
      nomineeCharacterName: "Nominee",
      nomineeParty: "democrat",
      proposedByPresidentId: presidentId,
      votes: {},
    };

    await runWith(nom, [], { votesFor: 20, votesAgainst: 70, votesAbstain: 10 });

    const rejectedOps = bulkOps(db.collectionMocks.cabinetNominations.bulkWrite);
    expect(rejectedOps).toHaveLength(1);
    expect(rejectedOps[0]![0]).toEqual({ _id: nom._id });
    expect(rejectedOps[0]![1].$set).toEqual(
      expect.objectContaining({ status: "rejected", rejectionReason: "senate_vote" })
    );

    const { createNotifications } = await import("@/lib/notifications");
    const sent = vi.mocked(createNotifications).mock.calls[0][0] as unknown as Array<{
      userId: unknown;
      message: string;
    }>;
    const toNominee = sent.find((n) => String(n.userId) === nomineeUser.toString());
    expect(toNominee?.message).toBe("You were not confirmed for Secretary of State.");
  });
});
