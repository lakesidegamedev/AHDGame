import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ObjectId, type Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { makeCharacter } from "@/lib/test-utils/factories";
import type { Character } from "@/lib/db/types";
import { getDb } from "@/lib/mongodb";
import { requireHumanSession } from "@/lib/api/requireAuth";
import { getElectionOpponents } from "@/lib/actions/electionOpponents";
import { projectCampaignPoll } from "@/lib/campaignTargeting/poll";
import { buildGranularPollPayloadForState } from "@/lib/actions/granularPollPayload";
import { getGameState } from "@/lib/gameState";
import { resolvePresidentApproval } from "@/lib/elections/engine/presidentialCoattail";
import { POST } from "./route";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireHumanSession: vi.fn(),
  requireBasicAuth: vi.fn(),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: () => ({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
vi.mock("@/lib/gameState", () => ({ getGameState: vi.fn(async () => ({ currentTurn: 10 })) }));
vi.mock("@/lib/elections/engine/presidentialCoattail", () => ({
  isHeadOfGovernmentRace: (type: string, countryId: string) =>
    type === "president" && countryId === "US",
  resolvePresidentApproval: vi.fn(async () => null),
}));
vi.mock("@/lib/actions/granularPollPayload", () => ({
  buildGranularPollPayloadForState: vi.fn(() => ({
    dims: [],
    dimLabels: {},
    cells: [],
    candidateShares: {},
  })),
}));
vi.mock("@/lib/achievements/triggers", () => ({ checkActionAchievements: vi.fn() }));
vi.mock("@/lib/actions/electionOpponents", () => ({ getElectionOpponents: vi.fn() }));
vi.mock("@/lib/campaignTargeting/poll", () => ({ projectCampaignPoll: vi.fn() }));

const request = () =>
  new NextRequest("http://localhost/api/actions/poll", {
    method: "POST",
    body: JSON.stringify({ type: "small" }),
  });

describe("commissioning a campaign-aware poll", () => {
  let db: ReturnType<typeof createMockDb>;
  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
    const character = makeCharacter({
      funds: 100_000,
      actions: 10,
      stats: { intellect: 5.5 } as Character["stats"],
    });
    vi.mocked(requireHumanSession).mockResolvedValue({
      ok: true,
      user: { userId: character.userId.toString() },
    } as never);
    db.collection("characters").findOne.mockResolvedValue(character);
    db.collection("states").findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      population: 1_000_000,
    });
    db.collection("stateDemographics").findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      categoryWeights: {},
      groups: {},
    });
    vi.mocked(getElectionOpponents).mockResolvedValue({
      electionId: new ObjectId().toString(),
      electionType: "senate",
      state: "CA",
      candidateId: "mine-candidate",
      campaignRulesVersion: 1,
      inPrimary: false,
      opponents: [],
    });
    vi.mocked(projectCampaignPoll).mockResolvedValue({
      myCandidateId: "mine",
      totalPool: 1000,
      votes: { mine: 550, rival: 450 },
      cells: [],
      bonusesByCandidate: {},
    });
  });

  it("persists the shared campaign projection when charging for a poll", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pollSnapshot.totalEstimatedVoters).toBe(1000);
    expect(body.pollSnapshot.inRaceVoteShare).toEqual({
      myVotes: 550,
      opponentVotes: { rival: 450 },
    });
    const write = db.collection("characters").updateOne.mock.calls[0];
    expect(write[1].$set.lastPoll).toEqual(expect.objectContaining({ totalEstimatedVoters: 1000 }));
    expect(write[1].$inc).toEqual({ actions: -2, funds: -25000 });
  });

  it("passes effective-favorability inputs through to the granular poll builder", async () => {
    const character = makeCharacter({
      funds: 100_000,
      actions: 10,
      stats: { intellect: 5.5 } as Character["stats"],
      bucketApprovals: { retirees: 24, "age:senior": -4 },
    });
    db.collection("characters").findOne.mockResolvedValue(character);
    vi.mocked(getElectionOpponents).mockResolvedValue({
      electionId: new ObjectId().toString(),
      electionType: "senate",
      state: "CA",
      candidateId: "mine-candidate",
      incumbency: {
        legislativePartyId: "9",
        legislativeTenureTermsSought: 6,
      },
      campaignRulesVersion: 1,
      inPrimary: false,
      opponents: [
        {
          candidateId: "npp-1",
          name: "NPP candidate",
          party: "9",
          isNPP: true,
          economicPosition: 2,
          socialPosition: -1,
          favorability: 34,
          politicalInfluence: 47,
          bucketApprovals: { retirees: -16, "age:senior": 6 },
          overallAppeal: 0,
          totalPotentialVoters: 0,
          totalEstimatedVoters: 0,
        },
      ],
    } as never);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(buildGranularPollPayloadForState).toHaveBeenCalledWith(
      expect.objectContaining({
        character: expect.objectContaining({
          candidateId: "mine-candidate",
          favorability: character.favorability,
          party: character.party,
          bucketApprovals: character.bucketApprovals,
        }),
        opponents: [
          expect.objectContaining({
            candidateId: "npp-1",
            party: "9",
            favorability: 34,
            bucketApprovals: { retirees: -16, "age:senior": 6 },
            isNPP: true,
          }),
        ],
        incumbency: {
          legislativePartyId: "9",
          legislativeTenureTermsSought: 6,
        },
      })
    );
  });

  it("forwards the authoritative presidential tenure ledger to granular polls", async () => {
    const character = makeCharacter({
      funds: 100_000,
      actions: 10,
      party: "1",
      nationalInfluence: 72,
      stats: { intellect: 5.5 } as Character["stats"],
    });
    db.collection("characters").findOne.mockResolvedValue(character);
    vi.mocked(getGameState).mockResolvedValue({
      currentTurn: 10,
      presidentialTenureByCountry: { US: { party: "1", consecutiveTerms: 6 } },
    } as never);
    vi.mocked(resolvePresidentApproval).mockResolvedValue({ partyId: "1", approval: 50 });
    vi.mocked(getElectionOpponents).mockResolvedValue({
      electionId: new ObjectId().toString(),
      electionType: "president",
      state: "US",
      candidateId: "presidential-candidate",
      inPrimary: false,
      opponents: [],
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(buildGranularPollPayloadForState).toHaveBeenCalledWith(
      expect.objectContaining({
        character: expect.objectContaining({
          candidateId: "presidential-candidate",
          party: "1",
          nationalInfluence: 72,
        }),
        incumbency: {
          executivePartyId: "1",
          executiveConsecutiveTerms: 6,
        },
        useNationalInfluenceForReach: true,
      })
    );
  });

  it("derives a poll without campaign rules from the granular electorate", async () => {
    vi.mocked(getElectionOpponents).mockResolvedValue(null);
    vi.mocked(buildGranularPollPayloadForState).mockReturnValueOnce({
      dims: ["age"],
      dimLabels: { age: "Age" },
      cells: [
        {
          id: "age:young",
          buckets: { age: "young" },
          share: 0.5,
          economicLean: 0,
          socialLean: 0,
          turnout: 50,
        },
      ],
      candidateShares: {},
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).pollSnapshot.totalEstimatedVoters).toBe(250_000);
    expect(projectCampaignPoll).not.toHaveBeenCalled();
  });

  it("does not record a successful poll when the resource debit loses a race", async () => {
    db.collection("characters").updateOne.mockResolvedValue({ modifiedCount: 0 });
    expect((await POST(request())).status).toBe(409);
    expect(db.collection("actionLogs").insertOne).not.toHaveBeenCalled();
  });

  it("debits the intellect-scaled quote, not the unscaled base", async () => {
    // Intellect 10 → 1.18x divisor → round(25,000 / 1.18) = 21,186 anchor.
    const character = makeCharacter({
      funds: 100_000,
      actions: 10,
      stats: { intellect: 10 } as Character["stats"],
    });
    db.collection("characters").findOne.mockResolvedValue(character);
    const response = await POST(request());
    expect(response.status).toBe(200);
    const write = db.collection("characters").updateOne.mock.calls[0];
    expect(write[1].$inc).toEqual({ actions: -2, funds: -21186 });
  });

  it("charges the 1991 poll quote when era pricing is enabled", async () => {
    db.collection("gameConfig").findOne.mockResolvedValue({ campaignEraPriceLevelEnabled: true });
    db.collection("gameState").findOne.mockResolvedValue({ preset: "1991-default" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(db.collection("characters").updateOne.mock.calls[0][1].$inc.funds).toBe(-8952);
  });

  it("rejects a character with no allocated intellect before charging", async () => {
    const character = makeCharacter({ funds: 100_000, actions: 10, stats: undefined });
    db.collection("characters").findOne.mockResolvedValue(character);
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("intellect");
    expect(db.collection("characters").updateOne).not.toHaveBeenCalled();
    expect(db.collection("actionLogs").insertOne).not.toHaveBeenCalled();
  });
});
