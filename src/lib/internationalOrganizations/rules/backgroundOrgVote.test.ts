import { describe, expect, it } from "vitest";
import {
  alignmentAffinity,
  backgroundVotesOn,
  scriptBackgroundOrgVote,
  type AlignmentShares,
  type BackgroundBallot,
  type BackgroundVoterProfile,
} from "./backgroundOrgVote";

const ALIGN: Record<string, AlignmentShares> = {
  US: { shares: { WASHINGTON: 90, BEIJING: 0, MOSCOW: 0 }, nonAligned: 10 },
  FR: { shares: { WASHINGTON: 75, BEIJING: 5, MOSCOW: 0 }, nonAligned: 20 },
  HU: { shares: { WASHINGTON: 45, BEIJING: 10, MOSCOW: 15 }, nonAligned: 30 },
  RU: { shares: { WASHINGTON: 0, BEIJING: 20, MOSCOW: 75 }, nonAligned: 5 },
  PL: { shares: { WASHINGTON: 85, BEIJING: 0, MOSCOW: 0 }, nonAligned: 15 },
};
const alignmentOf = (id: string) => ALIGN[id] ?? null;

const voter = (countryId: string, extra: Partial<BackgroundVoterProfile> = {}) => ({
  countryId,
  tradeExposure: 0.3,
  fiscalCapacity: 0.4,
  rulingEconomic: null,
  ...extra,
});

const ballot = (extra: Partial<BackgroundBallot>): BackgroundBallot => ({
  id: "ballot-1",
  kind: "sanctions",
  proposerId: "US",
  votes: [],
  ...extra,
});

describe("background organisation votes", () => {
  it("sits out the ballots that stay player-only", () => {
    expect(backgroundVotesOn("membership_proposal")).toBe(false);
    expect(backgroundVotesOn("declare_war")).toBe(false);
    expect(backgroundVotesOn("join_conflict")).toBe(false);
    expect(backgroundVotesOn("sanctions")).toBe(true);
    expect(backgroundVotesOn("leadership_election")).toBe(true);
    expect(
      scriptBackgroundOrgVote(voter("FR"), ballot({ kind: "declare_war" }), alignmentOf)
    ).toBeNull();
  });

  it("measures alignment as bloc overlap", () => {
    expect(alignmentAffinity(ALIGN.US, ALIGN.US)).toBe(1);
    expect(alignmentAffinity(ALIGN.US, ALIGN.RU)).toBeCloseTo(0.05);
    expect(alignmentAffinity(null, ALIGN.RU)).toBe(0.5);
  });

  it("sanctions a rival bloc, refuses to sanction itself", () => {
    const onRussia = ballot({ subjectId: "RU", sanctionsAll: true });
    expect(scriptBackgroundOrgVote(voter("PL"), onRussia, alignmentOf)?.vote).toBe("yes");
    expect(scriptBackgroundOrgVote(voter("RU"), onRussia, alignmentOf)?.vote).toBe("no");
  });

  it("weighs the trade a sanction gives up", () => {
    const onRussia = ballot({ subjectId: "RU", sanctionsAll: true, proposerId: "PL" });
    const open = scriptBackgroundOrgVote(
      voter("HU", { tradeExposure: 0.9 }),
      onRussia,
      alignmentOf
    );
    const closed = scriptBackgroundOrgVote(
      voter("HU", { tradeExposure: 0.1 }),
      onRussia,
      alignmentOf
    );
    expect(open!.score).toBeLessThan(closed!.score);
  });

  it("will not sanction an ally", () => {
    const onPoland = ballot({ subjectId: "PL", proposerId: "RU" });
    expect(scriptBackgroundOrgVote(voter("FR"), onPoland, alignmentOf)?.vote).toBe("no");
  });

  it("follows the bloc once it has made up its mind", () => {
    const neutral = ballot({ kind: "set_posture", proposerId: "HU" });
    const alone = scriptBackgroundOrgVote(voter("FR"), neutral, alignmentOf)!;
    const landslide = scriptBackgroundOrgVote(
      voter("FR"),
      {
        ...neutral,
        votes: [
          { countryId: "US", vote: "no" },
          { countryId: "PL", vote: "no" },
        ],
      },
      alignmentOf
    )!;
    expect(landslide.score).toBeLessThan(alone.score);
    expect(landslide.vote).toBe("no");
  });

  it("takes aid aimed at itself and pays for others only with room in the budget", () => {
    const aid = ballot({ kind: "aid_package", aidDonorId: "FR", aidRecipientId: "GR" });
    expect(scriptBackgroundOrgVote(voter("GR"), aid, alignmentOf)?.vote).toBe("yes");
    const rich = scriptBackgroundOrgVote(voter("FR", { fiscalCapacity: 0.6 }), aid, alignmentOf)!;
    const poor = scriptBackgroundOrgVote(voter("FR", { fiscalCapacity: 0.2 }), aid, alignmentOf)!;
    expect(rich.score).toBeGreaterThan(poor.score);
    expect(poor.vote).not.toBe("yes");
  });

  it("backs free trade by exposure and a pro-market government", () => {
    const fta = ballot({ kind: "free_trade_agreement", proposerId: "FR" });
    const open = scriptBackgroundOrgVote(
      voter("PL", { tradeExposure: 0.7, rulingEconomic: 3 }),
      fta,
      alignmentOf
    )!;
    const closed = scriptBackgroundOrgVote(
      voter("PL", { tradeExposure: 0.1, rulingEconomic: -4 }),
      fta,
      alignmentOf
    )!;
    expect(open.vote).toBe("yes");
    expect(closed.score).toBeLessThan(open.score);
    expect(open.breakdown.ideology).toBeGreaterThan(0);
  });

  it("is deterministic for the same ballot and voter", () => {
    const b = ballot({ id: "abc", kind: "directive", proposerId: "HU" });
    const first = scriptBackgroundOrgVote(voter("FR"), b, alignmentOf);
    const second = scriptBackgroundOrgVote(voter("FR"), b, alignmentOf);
    expect(second).toEqual(first);
    const other = scriptBackgroundOrgVote(voter("FR"), { ...b, id: "abd" }, alignmentOf);
    expect(other?.breakdown.jitter).not.toBe(first?.breakdown.jitter);
  });
});
