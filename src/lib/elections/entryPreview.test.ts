import { describe, expect, it } from "vitest";
import {
  approximateTurnsAhead,
  closedFilingLine,
  evaluateEntryChecks,
  fieldLine,
  firstFailedCheck,
  holdsCommonsSeatInRace,
  homeStateBlocks,
  scheduleLines,
  senateClassBlock,
  type EntryChecksInput,
} from "./entryPreview";

const ok: EntryChecksInput = {
  open: true,
  primaryEnded: false,
  raceCountry: "US",
  characterCountry: "US",
  homeStateBlocked: false,
  homeState: "OH",
  raceState: "OH",
  homeStateDeferred: false,
  termLimitReached: false,
  senateClassHeld: null,
  raceSenateClass: 1,
  holdsCommonsSeat: false,
  alreadyEntered: false,
  withdrew: false,
  otherRace: null,
  deferredRules: [],
};

describe("evaluateEntryChecks", () => {
  it("passes everything for an eligible player", () => {
    const checks = evaluateEntryChecks(ok);
    expect(checks.every((c) => c.status === "pass")).toBe(true);
    expect(firstFailedCheck(checks)).toBeNull();
  });

  it("fails on a home state mismatch with the region named", () => {
    const failed = firstFailedCheck(
      evaluateEntryChecks({ ...ok, homeStateBlocked: true, homeState: "TX", raceState: "OH" })
    );
    expect(failed?.id).toBe("homeState");
    expect(failed?.reason).toContain("TX");
    expect(failed?.reason).toContain("OH");
  });

  it("defers home state to filing for rounds with their own residence rule", () => {
    const checks = evaluateEntryChecks({ ...ok, homeStateBlocked: true, homeStateDeferred: true });
    expect(checks.find((c) => c.id === "homeState")?.status).toBe("later");
    expect(firstFailedCheck(checks)).toBeNull();
  });

  it("fails closed filing, other country, term limit, withdrawn and other race", () => {
    expect(firstFailedCheck(evaluateEntryChecks({ ...ok, primaryEnded: true }))?.id).toBe(
      "filingOpen"
    );
    expect(firstFailedCheck(evaluateEntryChecks({ ...ok, characterCountry: "IE" }))?.id).toBe(
      "country"
    );
    expect(firstFailedCheck(evaluateEntryChecks({ ...ok, termLimitReached: true }))?.id).toBe(
      "termLimit"
    );
    expect(firstFailedCheck(evaluateEntryChecks({ ...ok, withdrew: true }))?.id).toBe(
      "notWithdrew"
    );
    expect(
      firstFailedCheck(evaluateEntryChecks({ ...ok, otherRace: "senate race in TX" }))?.reason
    ).toContain("senate race in TX");
  });

  it("adds senate class and commons checks only when they apply", () => {
    expect(evaluateEntryChecks(ok).some((c) => c.id === "senateClass")).toBe(false);
    const checks = evaluateEntryChecks({ ...ok, senateClassHeld: 2, raceSenateClass: 3 });
    expect(checks.find((c) => c.id === "senateClass")?.status).toBe("fail");
    expect(
      evaluateEntryChecks({ ...ok, holdsCommonsSeat: true }).find((c) => c.id === "commonsSeat")
        ?.status
    ).toBe("fail");
  });

  it("lists rules only the filing route can judge as later, never failed", () => {
    const checks = evaluateEntryChecks({ ...ok, deferredRules: ["Country-specific filing rules"] });
    const later = checks.filter((c) => c.status === "later");
    expect(later).toHaveLength(1);
    expect(firstFailedCheck(checks)).toBeNull();
  });
});

describe("shared predicates", () => {
  it("homeStateBlocks exempts nationwide executives and the Duma list", () => {
    const base = { electionState: "OH", homeState: "TX" };
    expect(homeStateBlocks({ ...base, isNationwideExecutive: false, nationalList: false })).toBe(
      true
    );
    expect(homeStateBlocks({ ...base, isNationwideExecutive: true, nationalList: false })).toBe(
      false
    );
    expect(homeStateBlocks({ ...base, isNationwideExecutive: false, nationalList: true })).toBe(
      false
    );
    expect(
      homeStateBlocks({
        electionState: "OH",
        homeState: "OH",
        isNationwideExecutive: false,
        nationalList: false,
      })
    ).toBe(false);
  });

  it("senateClassBlock only blocks a different class in a senate race", () => {
    const held = { type: "senate", senateClass: 2 };
    expect(senateClassBlock(held, { electionType: "senate", state: "OH", senateClass: 3 })).toBe(2);
    expect(
      senateClassBlock(held, { electionType: "senate", state: "OH", senateClass: 2 })
    ).toBeNull();
    expect(senateClassBlock(held, { electionType: "house", state: "OH" })).toBeNull();
    expect(
      senateClassBlock(null, { electionType: "senate", state: "OH", senateClass: 1 })
    ).toBeNull();
  });

  it("holdsCommonsSeatInRace needs a by-election in the held region", () => {
    const race = { officeKey: "commons", isSpecialCommons: true, state: "ON" };
    expect(holdsCommonsSeatInRace({ type: "commons", state: "ON" }, race)).toBe(true);
    expect(holdsCommonsSeatInRace({ type: "commons", state: "QC" }, race)).toBe(false);
    expect(
      holdsCommonsSeatInRace({ type: "commons", state: "ON" }, { ...race, isSpecialCommons: false })
    ).toBe(false);
  });
});

describe("card text helpers", () => {
  it("approximates turns as real time", () => {
    expect(approximateTurnsAhead(1)).toBe("about 1 hour");
    expect(approximateTurnsAhead(5)).toBe("about 5 hours");
    expect(approximateTurnsAhead(72)).toBe("about 3 days");
    expect(approximateTurnsAhead(0)).toBe("now");
  });

  it("builds schedule lines from turns", () => {
    expect(scheduleLines({ currentTurn: 137, primaryEndTurn: 142, endTurn: 190 })).toEqual([
      "Filing and primary close: turn 142 (about 5 hours).",
      "General election ends: turn 190 (about 2 days).",
    ]);
    expect(scheduleLines({ currentTurn: null, primaryEndTurn: null, endTurn: null })).toEqual([]);
  });

  it("describes the field and incumbent", () => {
    expect(fieldLine([], null)).toEqual(["No one has filed yet."]);
    expect(
      fieldLine(
        [
          { party: "1", partyName: "Blue" },
          { party: "1", partyName: "Blue" },
          { party: "2", partyName: "Red" },
        ],
        { name: "A. Person", party: "Blue" }
      )
    ).toEqual(["3 candidates have filed (Blue x2, Red).", "Incumbent: A. Person (Blue)."]);
    expect(fieldLine(null, null)).toEqual([]);
  });

  it("states a closed filing turn without inventing a next date", () => {
    expect(closedFilingLine(142)).toBe("Filing for this race closed on turn 142.");
    expect(closedFilingLine(null)).toBe("Filing for this race is closed.");
  });
});
