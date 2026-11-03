import { describe, expect, it } from "vitest";
import { canDirectNationalPartyNpp, pickNationalPartySponsor } from "./nationalPartyNpp";
describe("National chair NPP proposal rules", () => {
  const input = {
    characterId: "chair",
    characterPartyId: "1",
    partyId: "1",
    sameCountry: true,
    nationalChairId: "chair",
  };
  it.each([
    [{}, true],
    [{ nationalChairId: "other" }, false],
    [{ characterPartyId: "2" }, false],
    [{ characterPartyId: null }, false],
    [{ sameCountry: false }, false],
  ] as const)("validates national authority and membership", (changes, allowed) =>
    expect(canDirectNationalPartyNpp({ ...input, ...changes })).toBe(allowed)
  );
  it("uses the injected random draw and handles an empty candidate list", () => {
    expect(pickNationalPartySponsor(["house", "senate"], () => 0)).toBe("house");
    expect(pickNationalPartySponsor(["house", "senate"], () => 0.99)).toBe("senate");
    expect(pickNationalPartySponsor([], () => 0)).toBeNull();
  });
});
