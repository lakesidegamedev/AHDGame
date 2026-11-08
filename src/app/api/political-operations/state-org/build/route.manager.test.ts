import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { stateOrgLevelCost, STATE_ORG_COST_ACTIONS } from "@/lib/electionEngine/constants";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireAuthWithCharacter: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ ok: true }),
  rateLimitResponse: vi.fn(),
  ELECTION_LIMITS: { maxRequests: 10, windowMs: 60000 },
}));
vi.mock("@/lib/currency/characterFunds", async () => {
  const actual = await vi.importActual("@/lib/currency/characterFunds");
  return {
    ...actual,
    loadCharacterFxRate: vi.fn().mockResolvedValue({ rate: 1 }),
    getHomeCurrency: vi.fn().mockReturnValue("USD"),
  };
});
vi.mock("@/lib/currency/campaignFxRate", () => ({
  loadCampaignFxRate: vi.fn().mockResolvedValue(1),
}));

vi.mock("@/lib/currency/featureFlag", () => ({
  isForexEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/db/runWithOptionalTransaction", () => ({
  runWithOptionalTransaction: vi.fn().mockImplementation(async (tx) => {
    await tx({} as never);
  }),
}));
vi.mock("@/lib/time/gameTime", () => ({
  getGameTime: vi.fn(),
  invalidateGameTimeCache: vi.fn(),
}));

/**
 * The manager path of POST /api/political-operations/state-org/build: an
 * appointed campaign manager builds Campaign Presence for the candidate's ticket
 * from the campaign's own pools. Prices, caps and throttles are the candidate
 * path's, so these tests pin who may act and that the shared guards still hold.
 */
describe("POST /api/political-operations/state-org/build with a campaignId", () => {
  const managerUserId = new ObjectId();
  const managerCharacterId = new ObjectId();
  const candidateId = new ObjectId();
  const runningMateId = new ObjectId();
  const campaignId = new ObjectId();
  const electionId = new ObjectId();
  const turnStart = new Date("2026-06-30T12:00:00.000Z");

  const campaignDoc = (over: Record<string, unknown> = {}) => ({
    _id: campaignId,
    electionId,
    candidateId,
    candidateIsNPP: false,
    managerId: managerUserId,
    managerCharacterId,
    managers: [{ userId: managerUserId, characterId: managerCharacterId, appointedAt: new Date() }],
    actions: 50,
    funds: 100_000_000,
    ...over,
  });

  const actor = (userId: ObjectId, characterId: ObjectId, name: string) => ({
    ok: true,
    user: {
      userId: userId.toString(),
      username: name.toLowerCase(),
      email: "a@b.c",
      role: "user",
      isAdmin: false,
      hasCharacter: true,
      character: {
        _id: characterId,
        userId,
        name,
        countryId: "US",
        homeState: "OH",
        party: "democrat",
      },
    },
  });

  async function actAs(auth: ReturnType<typeof actor>) {
    const { requireAuthWithCharacter } = await import("@/lib/api/requireAuth");
    vi.mocked(requireAuthWithCharacter).mockResolvedValue(auth as never);
  }

  interface Fixture {
    campaign?: ReturnType<typeof campaignDoc> | null;
    candidate?: Record<string, unknown> | null;
    candidateRow?: Record<string, unknown> | null;
    /** The user id that owns the candidate character (the candidate's own account). */
    candidateUserId?: ObjectId;
    orgLevel?: number;
    orgUpdate?: Record<string, unknown> | null;
    debit?: { modifiedCount: number };
  }

  async function setupDb(f: Fixture = {}) {
    const campaignsUpdateOne = vi.fn().mockResolvedValue(f.debit ?? { modifiedCount: 1 });
    const orgFindOneAndUpdate = vi.fn().mockResolvedValue(
      f.orgUpdate === undefined
        ? { characterId: candidateId, stateId: "PA", level: (f.orgLevel ?? 0) + 1 }
        : f.orgUpdate
    );
    const activityInsert = vi.fn().mockResolvedValue({ insertedId: new ObjectId() });
    const candidate =
      f.candidate === undefined ? { _id: candidateId, countryId: "US", party: "1" } : f.candidate;
    const collections: Record<string, Record<string, unknown>> = {
      campaigns: {
        findOne: vi.fn().mockResolvedValue(f.campaign === undefined ? campaignDoc() : f.campaign),
        updateOne: campaignsUpdateOne,
      },
      electionCandidates: {
        findOne: vi.fn().mockResolvedValue(f.candidateRow ?? { campaignSuspended: false }),
      },
      characters: {
        // Ownership lookups carry a userId; the plain lookup is the candidate's character.
        findOne: vi.fn().mockImplementation(async (q: { _id: ObjectId; userId?: ObjectId }) => {
          if (q.userId) {
            return f.candidateUserId && q.userId.equals(f.candidateUserId) && q._id.equals(candidateId)
              ? { _id: candidateId }
              : null;
          }
          return q._id.equals(candidateId) ? candidate : null;
        }),
      },
      characterStateOrg: {
        findOne: vi
          .fn()
          .mockResolvedValue(
            f.orgLevel === undefined
              ? null
              : { level: f.orgLevel, totalInvested: f.orgLevel * STATE_ORG_COST_ACTIONS }
          ),
        findOneAndUpdate: orgFindOneAndUpdate,
      },
      activityLog: { insertOne: activityInsert },
    };
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue({
      collection: vi.fn().mockImplementation((name: string) => {
        return (
          collections[name] ?? {
            findOne: vi.fn().mockResolvedValue(null),
            updateOne: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue([]),
              project: vi.fn().mockReturnThis(),
              sort: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
            }),
          }
        );
      }),
    } as never);
    return { campaignsUpdateOne, orgFindOneAndUpdate, activityInsert, collections };
  }

  async function post(body: Record<string, unknown> = { stateId: "PA", campaignId: campaignId.toString() }) {
    const { POST } = await import("./route");
    return POST(
      new Request("http://localhost/api/political-operations/state-org/build", {
        method: "POST",
        body: JSON.stringify(body),
      })
    );
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    await actAs(actor(managerUserId, managerCharacterId, "Manager"));
    const { isForexEnabled } = await import("@/lib/currency/featureFlag");
    vi.mocked(isForexEnabled).mockResolvedValue(false);
    const { getGameTime } = await import("@/lib/time/gameTime");
    vi.mocked(getGameTime).mockResolvedValue({
      currentTurn: 100,
      lastTurnProcessed: turnStart,
      isActive: true,
      pausedAt: null,
      effectiveNow: turnStart,
      startingYear: 2019,
    });
  });

  it("lets an appointed manager build for the candidate, paid from the campaign", async () => {
    const { campaignsUpdateOne, orgFindOneAndUpdate } = await setupDb();
    const response = await post();
    expect(response.status).toBe(200);

    // Written under the candidate, not the manager.
    expect(orgFindOneAndUpdate.mock.calls[0][0]).toMatchObject({
      characterId: candidateId,
      stateId: "PA",
    });
    expect(orgFindOneAndUpdate.mock.calls[0][1].$setOnInsert).toEqual({
      characterId: candidateId,
      stateId: "PA",
    });
    // Debited from the named campaign's pools at the usual first-level price.
    expect(campaignsUpdateOne.mock.calls[0][0]).toMatchObject({ _id: campaignId });
    expect(campaignsUpdateOne.mock.calls[0][1].$inc).toEqual({
      actions: -STATE_ORG_COST_ACTIONS,
      funds: -stateOrgLevelCost(0),
    });
  });

  it("converts the cost at the candidate's campaign rate", async () => {
    const fx = await import("@/lib/currency/campaignFxRate");
    vi.mocked(fx.loadCampaignFxRate).mockResolvedValueOnce(2);
    const { campaignsUpdateOne } = await setupDb({
      candidate: { _id: candidateId, countryId: "US", party: "1" },
    });

    const response = await post();
    expect(response.status).toBe(200);
    expect(vi.mocked(fx.loadCampaignFxRate)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ countryId: "US", _id: candidateId })
    );
    expect(campaignsUpdateOne.mock.calls[0][1].$inc.funds).toBe(-stateOrgLevelCost(0) * 2);
  });

  it("records the manager as the actor in the audit log", async () => {
    const { activityInsert } = await setupDb();
    expect((await post()).status).toBe(200);
    expect(activityInsert).toHaveBeenCalledTimes(1);
    expect(activityInsert.mock.calls[0][0]).toMatchObject({
      type: "game_action",
      actionType: "state_org_build",
      characterId: managerCharacterId,
      targetId: campaignId,
      details: expect.objectContaining({
        campaignId: campaignId.toString(),
        candidateId: candidateId.toString(),
        stateId: "PA",
        builtByManager: true,
      }),
    });
  });

  it("still builds when the audit row cannot be written", async () => {
    const { activityInsert } = await setupDb();
    activityInsert.mockRejectedValue(new Error("log down"));
    expect((await post()).status).toBe(200);
  });

  it("lets the candidate's own account name the campaign, with no manager row", async () => {
    const candidateUserId = new ObjectId();
    await actAs(actor(candidateUserId, candidateId, "Candidate"));
    const { orgFindOneAndUpdate, activityInsert } = await setupDb({
      campaign: campaignDoc({ managerId: null, managers: [] }),
      candidateUserId,
    });
    expect((await post()).status).toBe(200);
    expect(orgFindOneAndUpdate.mock.calls[0][0]).toMatchObject({ characterId: candidateId });
    // The candidate spending their own campaign's money is not a manager action to flag.
    expect(activityInsert).not.toHaveBeenCalled();
  });

  it("refuses the running mate", async () => {
    const mateUserId = new ObjectId();
    await actAs(actor(mateUserId, runningMateId, "Mate"));
    const { campaignsUpdateOne, orgFindOneAndUpdate } = await setupDb({
      campaign: campaignDoc({ managerId: null, managers: [] }),
      candidateUserId: new ObjectId(),
    });
    const response = await post();
    expect(response.status).toBe(403);
    expect(campaignsUpdateOne).not.toHaveBeenCalled();
    expect(orgFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("refuses a user who is neither the candidate nor a manager", async () => {
    await actAs(actor(new ObjectId(), new ObjectId(), "Stranger"));
    const { campaignsUpdateOne, orgFindOneAndUpdate } = await setupDb({
      candidateUserId: new ObjectId(),
    });
    const response = await post();
    expect(response.status).toBe(403);
    expect(campaignsUpdateOne).not.toHaveBeenCalled();
    expect(orgFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("refuses an archived campaign", async () => {
    const { campaignsUpdateOne } = await setupDb({ campaign: campaignDoc({ status: "archived" }) });
    const response = await post();
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/eliminated|no longer/i);
    expect(campaignsUpdateOne).not.toHaveBeenCalled();
  });

  it("refuses a suspended campaign", async () => {
    const { campaignsUpdateOne } = await setupDb({ candidateRow: { campaignSuspended: true } });
    const response = await post();
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/suspended/i);
    expect(campaignsUpdateOne).not.toHaveBeenCalled();
  });

  it("refuses an NPP ticket rather than inventing storage for it", async () => {
    const { orgFindOneAndUpdate } = await setupDb({ campaign: campaignDoc({ candidateIsNPP: true }) });
    const response = await post();
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/not available for this ticket/i);
    expect(orgFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("applies the US-only gate to the candidate's race", async () => {
    await setupDb({ candidate: { _id: candidateId, countryId: "UK" } });
    expect((await post()).status).toBe(403);
  });

  it("lets a manager from another country build for a US ticket", async () => {
    await actAs({
      ...actor(managerUserId, managerCharacterId, "Manager"),
      user: {
        ...actor(managerUserId, managerCharacterId, "Manager").user,
        character: {
          ...actor(managerUserId, managerCharacterId, "Manager").user.character,
          countryId: "UK",
        },
      },
    });
    await setupDb();
    expect((await post()).status).toBe(200);
  });

  it("applies the admitted-state gate", async () => {
    const { campaignsUpdateOne } = await setupDb();
    const response = await post({ stateId: "ZZ", campaignId: campaignId.toString() });
    expect(response.status).toBe(400);
    expect(campaignsUpdateOne).not.toHaveBeenCalled();
  });

  it("answers 404 for a campaign that does not exist and 400 for a malformed id", async () => {
    await setupDb({ campaign: null });
    expect((await post()).status).toBe(404);
    expect((await post({ stateId: "PA", campaignId: "not-an-id" })).status).toBe(400);
  });

  describe("shared guards", () => {
    it("prices the next level off the candidate's current one and re-asserts it in the update", async () => {
      const { campaignsUpdateOne, orgFindOneAndUpdate } = await setupDb({ orgLevel: 7 });
      expect((await post()).status).toBe(200);
      expect(campaignsUpdateOne.mock.calls[0][1].$inc.funds).toBe(-stateOrgLevelCost(7));
      expect(orgFindOneAndUpdate.mock.calls[0][0].$and).toEqual([
        { $or: [{ level: { $exists: false } }, { level: 7 }] },
      ]);
    });

    it("throttles to one build per state per turn", async () => {
      const { orgFindOneAndUpdate } = await setupDb({ orgLevel: 1, orgUpdate: null });
      const response = await post();
      expect(response.status).toBe(409);
      const filter = orgFindOneAndUpdate.mock.calls[0][0];
      const cutoff = filter.$or.find(
        (c: { updatedAt?: { $lt?: Date } }) => c.updatedAt && c.updatedAt.$lt
      );
      expect(cutoff.updatedAt.$lt.getTime()).toBe(turnStart.getTime());
    });

    it("does not log a build that was throttled", async () => {
      const { activityInsert } = await setupDb({ orgLevel: 1, orgUpdate: null });
      expect((await post()).status).toBe(409);
      expect(activityInsert).not.toHaveBeenCalled();
    });

    it("answers 409 when the campaign's pools changed under the guarded debit", async () => {
      const { orgFindOneAndUpdate } = await setupDb({ debit: { modifiedCount: 0 } });
      expect((await post()).status).toBe(409);
      expect(orgFindOneAndUpdate).not.toHaveBeenCalled();
    });

    it("answers 400 when the campaign lacks the actions or the funds", async () => {
      await setupDb({ campaign: campaignDoc({ actions: 0 }) });
      expect((await post()).status).toBe(400);
      await setupDb({ campaign: campaignDoc({ funds: 1 }) });
      expect((await post()).status).toBe(400);
    });
  });

  it("leaves the candidate's own call without a campaignId as it was", async () => {
    const candidateUserId = new ObjectId();
    await actAs(actor(candidateUserId, candidateId, "Candidate"));
    const { campaignsUpdateOne, orgFindOneAndUpdate } = await setupDb({ candidateUserId });
    const response = await post({ stateId: "PA" });
    expect(response.status).toBe(200);
    expect(orgFindOneAndUpdate.mock.calls[0][0]).toMatchObject({ characterId: candidateId });
    expect(campaignsUpdateOne.mock.calls[0][0]).toMatchObject({ _id: campaignId });
  });
});
