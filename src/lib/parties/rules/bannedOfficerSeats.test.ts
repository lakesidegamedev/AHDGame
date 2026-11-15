import { describe, expect, it } from "vitest";
import { seatedOfficerIds } from "./bannedOfficerSeats";

describe("seatedOfficerIds", () => {
  const chair = { toString: () => "chair" };
  const treasurer = { toString: () => "treasurer" };

  it("counts every filled seat once", () => {
    expect(
      seatedOfficerIds({ chairId: chair, viceChairId: null, treasurerId: treasurer }, new Set())
    ).toEqual(["chair", "treasurer"]);
    expect(seatedOfficerIds({ chairId: chair, treasurerId: chair }, new Set())).toEqual(["chair"]);
  });

  it("treats a banned holder's seat as vacant", () => {
    expect(
      seatedOfficerIds(
        { chairId: chair, viceChairId: null, treasurerId: treasurer },
        new Set(["treasurer"])
      )
    ).toEqual(["chair"]);
  });
});
