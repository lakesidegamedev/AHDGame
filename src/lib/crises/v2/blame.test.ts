import { describe, expect, it } from "vitest";
import {
  MAX_APPROVAL_POINTS,
  MAX_PARTY_ELECTION_PCT,
  boundPartyShift,
  judgeHolders,
  partyElectionPct,
} from "./blame";
import type { AccountabilityEntry } from "./types";

const row = (over: Partial<AccountabilityEntry>): AccountabilityEntry => ({
  turn: 1,
  stage: "peak",
  role: "headOfState",
  holderId: "h",
  leverId: null,
  cost: {},
  mitigation: 0,
  severity: 80,
  ...over,
});

describe("judgeHolders", () => {
  it("blames idle turns at high severity", () => {
    const [verdict] = judgeHolders(Array.from({ length: 6 }, (_, i) => row({ turn: i })));
    expect(verdict.blame).toBeGreaterThan(0);
    expect(verdict.approvalDelta).toBeLessThan(-2);
    expect(verdict.approvalDelta).toBeGreaterThanOrEqual(-MAX_APPROVAL_POINTS);
  });

  it("does not blame sitting on a lever while the crisis is mild", () => {
    expect(judgeHolders([row({ severity: 30 }), row({ severity: 35, turn: 2 })])).toEqual([]);
  });

  it("credits effective mitigation more the worse the crisis was", () => {
    const worse = judgeHolders(
      Array.from({ length: 4 }, (_, i) =>
        row({ turn: i, leverId: "l", mitigation: 3, severity: 90 })
      )
    )[0];
    const milder = judgeHolders(
      Array.from({ length: 4 }, (_, i) =>
        row({ turn: i, leverId: "l", mitigation: 3, severity: 45 })
      )
    )[0];
    expect(worse.approvalDelta).toBeGreaterThan(milder.approvalDelta);
    expect(milder.approvalDelta).toBeGreaterThan(0);
  });

  it("weighs the peak above the aftermath", () => {
    const peak = judgeHolders([row({ stage: "peak" })])[0];
    const after = judgeHolders([row({ stage: "aftermath" })])[0];
    expect(Math.abs(peak.approvalDelta)).toBeGreaterThan(Math.abs(after.approvalDelta));
  });

  it("never exceeds the bound however long the ledger", () => {
    const [verdict] = judgeHolders(
      Array.from({ length: 300 }, (_, i) => row({ turn: i, severity: 100 }))
    );
    expect(verdict.approvalDelta).toBeGreaterThanOrEqual(-MAX_APPROVAL_POINTS);
  });
});

describe("election shifts", () => {
  it("converts approval to vote share and bounds a party's total", () => {
    expect(partyElectionPct(4)).toBe(2);
    expect(boundPartyShift(10)).toBe(MAX_PARTY_ELECTION_PCT);
    expect(boundPartyShift(-10)).toBe(-MAX_PARTY_ELECTION_PCT);
    expect(boundPartyShift(1)).toBe(1);
  });
});
