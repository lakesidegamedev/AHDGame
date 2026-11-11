import { describe, expect, it } from "vitest";
import {
  organizationFromVoteShare,
  VOTE_SHARE_ORG_CEILING,
  VOTE_SHARE_ORG_FLOOR,
} from "./voteShareOrganization";

describe("organizationFromVoteShare", () => {
  it("maps no vote to the floor and half the vote to the ceiling", () => {
    expect(organizationFromVoteShare(0)).toBe(VOTE_SHARE_ORG_FLOOR);
    expect(organizationFromVoteShare(50)).toBe(VOTE_SHARE_ORG_CEILING);
  });

  it("scales linearly and rounds in between", () => {
    expect(organizationFromVoteShare(25)).toBe(38);
    expect(organizationFromVoteShare(10)).toBe(18);
  });

  it("clamps shares outside the 0 to 50 band", () => {
    expect(organizationFromVoteShare(80)).toBe(VOTE_SHARE_ORG_CEILING);
    expect(organizationFromVoteShare(-3)).toBe(VOTE_SHARE_ORG_FLOOR);
  });
});
