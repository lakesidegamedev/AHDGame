import { describe, expect, it } from "vitest";
import { canDirectRegionalPartyNpp, hasPartyNppSeats } from "./partyNppProposal";
describe("Party chair regional proposal authority", () => {
  const input = {
    characterId: "chair",
    characterPartyId: "1",
    partyId: "1",
    sameCountry: true,
    nationalChairId: "other",
    regionalChairId: "other",
  };
  it.each([
    ["national chair", { nationalChairId: "chair" }, true],
    ["regional chair", { regionalChairId: "chair" }, true],
    ["ordinary member", {}, false],
    ["different party", { nationalChairId: "chair", characterPartyId: "2" }, false],
    ["no party", { nationalChairId: "chair", characterPartyId: null }, false],
    ["foreign chair", { nationalChairId: "chair", sameCountry: false }, false],
  ] as const)("%s", (_label, overrides, allowed) => {
    expect(canDirectRegionalPartyNpp({ ...input, ...overrides })).toBe(allowed);
  });
});

describe("Regional NPP seat coverage", () => {
  it.each([
    [undefined, true],
    [1, true],
    [5, true],
    [0, false],
    [-1, false],
  ] as const)("validates seat count %s", (seats, expected) => {
    expect(hasPartyNppSeats(seats)).toBe(expected);
  });
});
