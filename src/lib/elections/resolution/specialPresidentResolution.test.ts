import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  seat: vi.fn(),
  initTally: vi.fn(),
  snapshot: vi.fn(),
  candidateFind: vi.fn(),
  candidateBulk: vi.fn(),
  candidateUpdateMany: vi.fn(),
  tallyFindOne: vi.fn(),
  tallyUpdate: vi.fn(),
  electionUpdate: vi.fn(),
  campaignDelete: vi.fn(),
}));

vi.mock("@/lib/elections/resolution/presidentExecutiveSeating", () => ({
  seatPresidentialExecutive: m.seat,
}));
vi.mock("@/lib/electionEngine/tallyManagement", () => ({ initElectionVoteTally: m.initTally }));
vi.mock("@/lib/elections/liveResults/captureResultSnapshot", () => ({
  captureElectionResultSnapshot: m.snapshot,
}));

import { resolveSpecialPresidentElection } from "./specialPresidentResolution";

const db = {
  collection: (name: string) => {
    switch (name) {
      case "electionCandidates":
        return {
          find: () => ({ toArray: m.candidateFind }),
          bulkWrite: m.candidateBulk,
          updateMany: m.candidateUpdateMany,
        };
      case "electionVoteTallies":
        return { findOne: m.tallyFindOne, updateOne: m.tallyUpdate };
      case "elections":
        return { updateOne: m.electionUpdate };
      default:
        return { deleteMany: m.campaignDelete };
    }
  },
} as never;

const now = new Date("2027-04-01T00:00:00Z");
const ids = [new ObjectId(), new ObjectId(), new ObjectId()];
const candidate = (i: number) => ({
  _id: ids[i]!,
  electionId: new ObjectId(),
  characterName: `Candidate ${i}`,
  party: String(i),
  isNPP: true,
  nppId: new ObjectId(),
  status: "active",
});
const election = (over: Record<string, unknown> = {}) =>
  ({
    _id: new ObjectId(),
    electionType: "special_president",
    countryId: "FR",
    state: "FR",
    cycle: 300,
    ...over,
  }) as never;
const tally = (votes: number[], over: Record<string, unknown> = {}) =>
  ({
    finalized: false,
    totalVotes: Object.fromEntries(votes.map((v, i) => [String(ids[i]), v])),
    ...over,
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  m.candidateFind.mockResolvedValue([candidate(0), candidate(1), candidate(2)]);
  m.tallyFindOne.mockResolvedValue(null);
});

describe("two-round special presidential election", () => {
  it("seats a first round majority winner and finalizes the tally", async () => {
    const result = await resolveSpecialPresidentElection(
      db,
      election(),
      tally([60, 25, 15]),
      now,
      348
    );
    expect(result).toBe(true);
    expect(m.seat).toHaveBeenCalledTimes(1);
    expect(m.seat.mock.calls[0]![1].winnerCandidate._id).toBe(ids[0]);
    expect(m.candidateBulk).not.toHaveBeenCalled();
    expect(m.tallyUpdate.mock.calls[0]![1].$set).toMatchObject({ finalized: true });
    expect(m.electionUpdate.mock.calls.at(-1)![1].$set).toMatchObject({ status: "resolved" });
  });

  it("opens a runoff between the top two when nobody passes half", async () => {
    const first = election();
    const result = await resolveSpecialPresidentElection(db, first, tally([40, 35, 25]), now, 348);
    expect(result).toBe(true);
    expect(m.seat).not.toHaveBeenCalled();
    const upserts = m.candidateBulk.mock.calls[0]![0];
    expect(upserts).toHaveLength(2);
    const runoff = m.electionUpdate.mock.calls[0]![1].$setOnInsert;
    expect(runoff).toMatchObject({
      electionType: "special_president",
      specialPresidentRound: 2,
      specialPresidentPredecessorId: (first as { _id: ObjectId })._id,
      status: "active",
      primaryEndTurn: 348,
      endTurn: 372,
    });
    expect(m.initTally).toHaveBeenCalledTimes(1);
    expect(m.electionUpdate.mock.calls.at(-1)![1].$set).toMatchObject({ status: "resolved" });
  });

  it("seats the runoff plurality winner", async () => {
    await resolveSpecialPresidentElection(
      db,
      election({ specialPresidentRound: 2 }),
      tally([48, 52]),
      now,
      372
    );
    expect(m.seat.mock.calls[0]![1].winnerCandidate._id).toBe(ids[1]);
    expect(m.candidateBulk).not.toHaveBeenCalled();
  });

  it("leaves an election with no votes to the generic handling", async () => {
    expect(
      await resolveSpecialPresidentElection(db, election(), tally([0, 0, 0]), now, 348)
    ).toBeNull();
    expect(await resolveSpecialPresidentElection(db, election(), null, now, 348)).toBeNull();
    expect(m.seat).not.toHaveBeenCalled();
  });

  it("does not seat again when the tally is already finalized", async () => {
    const result = await resolveSpecialPresidentElection(
      db,
      election(),
      tally([60, 25, 15], { finalized: true }),
      now,
      348
    );
    expect(result).toBe(true);
    expect(m.seat).not.toHaveBeenCalled();
  });
});
