import { describe, expect, it } from "vitest";
import { incumbentCandidacy } from "./incumbentCandidacy";

const base = { incumbentId: "a", candidateIds: [], termLimited: false, filingOpen: true };

describe("incumbentCandidacy", () => {
  it("is running when the incumbent filed under a character or NPP id", () => {
    expect(incumbentCandidacy({ ...base, candidateIds: [{ characterId: "a" }] }).running).toBe(
      true
    );
    expect(incumbentCandidacy({ ...base, candidateIds: [{ nppId: "a" }] }).running).toBe(true);
  });
  it("names term limits first", () => {
    expect(incumbentCandidacy({ ...base, termLimited: true }).reason).toBe("Term limited");
  });
  it("tells an open filing window from a closed one", () => {
    expect(incumbentCandidacy(base).reason).toBe("Has not filed yet");
    expect(incumbentCandidacy({ ...base, filingOpen: false }).reason).toBe("Did not file");
  });
  it("says nothing without an incumbent", () => {
    expect(incumbentCandidacy({ ...base, incumbentId: null })).toEqual({
      running: false,
      reason: null,
    });
  });
});
