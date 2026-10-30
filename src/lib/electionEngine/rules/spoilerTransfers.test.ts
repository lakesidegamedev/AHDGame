import { describe, expect, it } from "vitest";
import { applyFptpSpoilerTransfers, shouldApplyFptpSpoiler } from "./spoilerTransfers";

const candidates = [
  { candidateId: "dem", party: "democrat", charEP: -2, charSP: -2 },
  { candidateId: "rep", party: "republican", charEP: 3, charSP: 3 },
  { candidateId: "green", party: "green", charEP: -3, charSP: -3 },
];

describe("applyFptpSpoilerTransfers", () => {
  it("moves a third party's configured share from the nearest major party", () => {
    const votes = { dem: 500, rep: 500, green: 100 };
    applyFptpSpoilerTransfers(candidates, votes, new Map(), {
      countryId: "US",
      spoilerRate: 0.2,
    });
    expect(votes).toEqual({ dem: 480, rep: 500, green: 120 });
  });

  it("applies the shared organization factor and conserves votes", () => {
    const votes = { dem: 10, rep: 500, green: 100 };
    applyFptpSpoilerTransfers(
      candidates,
      votes,
      new Map([
        ["green", 100],
        ["democrat", 0],
      ]),
      { countryId: "US", spoilerRate: 1, useOrgAwareSpoiler: true }
    );
    expect(votes).toEqual({ dem: 0, rep: 500, green: 110 });
  });
});

describe("shouldApplyFptpSpoiler", () => {
  it("runs for FPTP in a competitive country", () => {
    expect(shouldApplyFptpSpoiler({ votingSystem: "fptp", countryId: "US" })).toBe(true);
  });

  it("skips ranked-choice voting", () => {
    expect(shouldApplyFptpSpoiler({ votingSystem: "rcv", countryId: "US" })).toBe(false);
  });

  it("skips a one-party state from the compile-time config", () => {
    expect(shouldApplyFptpSpoiler({ votingSystem: "fptp", countryId: "CN" })).toBe(false);
  });

  it("prefers the runtime flag over the compile-time config", () => {
    expect(
      shouldApplyFptpSpoiler({ votingSystem: "fptp", countryId: "HU", isOnePartyState: false })
    ).toBe(true);
    expect(
      shouldApplyFptpSpoiler({ votingSystem: "fptp", countryId: "US", isOnePartyState: true })
    ).toBe(false);
  });
});
