import { describe, expect, it } from "vitest";
import {
  actingChairNotice,
  removalVoteOpenedNotice,
  removedByCommitteeNotice,
} from "./officeRemovalNotice";

const DASHES = /[–—]/;

describe("removalVoteOpenedNotice", () => {
  it("names the seat, the threshold and the closing turn", () => {
    const notice = removalVoteOpenedNotice({
      partyName: "Democratic Party",
      roleLabel: "National Chair",
      committeeLabel: "National Committee",
      yesNeeded: 5,
      eligibleVoters: 8,
      expiresAtTurn: 195,
    });
    expect(notice.title).toBe("Vote to remove you as National Chair");
    expect(notice.message).toContain("Democratic Party National Committee");
    expect(notice.message).toContain("5 yes votes from 8 eligible voters");
    expect(notice.message).toContain("turn 195");
    expect(notice.message).not.toMatch(DASHES);
  });

  it("uses singular wording for a one-voter committee", () => {
    const notice = removalVoteOpenedNotice({
      partyName: "P",
      roleLabel: "National Treasurer",
      committeeLabel: "National Committee",
      yesNeeded: 1,
      eligibleVoters: 1,
      expiresAtTurn: 10,
    });
    expect(notice.message).toContain("1 yes vote from 1 eligible voter ");
  });
});

describe("removedByCommitteeNotice", () => {
  it("tells a removed chair the seat stays empty until the next leadership election", () => {
    const notice = removedByCommitteeNotice({
      partyName: "Democratic Party",
      role: "chair",
      roleLabel: "National Chair",
      committeeLabel: "National Committee",
    });
    expect(notice.title).toBe("Removed as National Chair by committee vote");
    expect(notice.message).toBe(
      "The Democratic Party National Committee voted to remove you as National Chair. " +
        "The seat stays empty until the next leadership election, where you can stand again."
    );
  });

  it("words a committee seat as removal from the committee", () => {
    const notice = removedByCommitteeNotice({
      partyName: "P",
      role: "committeeMember",
      roleLabel: "National Committee",
      committeeLabel: "National Committee",
    });
    expect(notice.title).toBe("Removed from the National Committee by committee vote");
    expect(notice.message).toContain("next National Committee election");
  });

  it("tells a removed campaigner the chair can nominate them again", () => {
    const notice = removedByCommitteeNotice({
      partyName: "P",
      role: "campaigner",
      roleLabel: "Campaigner",
      committeeLabel: "National Committee",
    });
    expect(notice.message).toContain("The chair can nominate you again.");
    expect(notice.message).not.toMatch(DASHES);
  });
});

describe("actingChairNotice", () => {
  it("tells the vice chair they hold the chair's powers", () => {
    const notice = actingChairNotice({
      partyName: "Democratic Party",
      chairLabel: "National Chair",
      viceChairLabel: "National Vice Chair",
      committeeLabel: "National Committee",
    });
    expect(notice.title).toBe("You are now acting National Chair");
    expect(notice.message).toContain("hold the chair's powers until a new National Chair");
    expect(notice.message).not.toMatch(DASHES);
  });
});
