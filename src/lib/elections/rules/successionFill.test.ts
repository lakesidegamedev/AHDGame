import { describe, expect, it } from "vitest";
import { getSuccessionRule, openExecutiveVacancy } from "./executiveSuccession";
import {
  describeSuccession,
  executiveStatusPayload,
  largestBlocParty,
  ownsPresidentialBallot,
  pickSuccessor,
  seededRng,
  successionFillAction,
} from "./successionFill";

const vacancy = (country: string, type: string, turn = 100) => {
  const v = openExecutiveVacancy(getSuccessionRule(country, type), turn);
  return {
    fill: v.rule.fill,
    office: v.rule.office,
    actingLabel: v.rule.actingLabel,
    vacatedTurn: v.vacatedTurn,
    actingUntilTurn: v.actingUntilTurn,
    fillByTurn: v.fillByTurn,
    overdue: false,
  };
};

describe("successionFillAction", () => {
  it("waits while the acting holder is still in charge", () => {
    const s = vacancy("FR", "presidential");
    expect(successionFillAction(s, s.actingUntilTurn)).toBe("none");
  });

  it("spawns a special election for a direct election once acting ends", () => {
    const s = vacancy("FR", "presidential");
    expect(successionFillAction(s, s.actingUntilTurn + 1)).toBe("spawn_election");
    expect(successionFillAction(s, s.fillByTurn + 50)).toBe("spawn_election");
  });

  it("holds a vote for legislature and party succession", () => {
    const party = vacancy("CN", "onePartyState");
    const legislature = vacancy("YU", "presidential");
    expect(successionFillAction(party, party.actingUntilTurn + 1)).toBe("hold_vote");
    expect(successionFillAction(legislature, legislature.actingUntilTurn + 1)).toBe("hold_vote");
  });

  it("leaves deputy and formation successions to their own engines", () => {
    const deputy = vacancy("BR", "presidential");
    const formation = vacancy("UK", "parliamentaryMonarchy");
    expect(successionFillAction(deputy, 10_000)).toBe("none");
    expect(successionFillAction(formation, 10_000)).toBe("none");
  });
});

describe("successor vote", () => {
  const members = [
    { id: "a", party: "2" },
    { id: "b", party: "1" },
    { id: "c", party: "1" },
  ];

  it("takes the largest bloc, breaking ties on the lowest party id", () => {
    expect(largestBlocParty(members)).toBe("1");
    expect(
      largestBlocParty([
        { id: "x", party: "9" },
        { id: "y", party: "3" },
      ])
    ).toBe("3");
    expect(largestBlocParty([])).toBeNull();
  });

  it("picks a member of the largest bloc and is repeatable for one seed", () => {
    const first = pickSuccessor(members, seededRng("CN:premier:10:50"));
    const again = pickSuccessor(members, seededRng("CN:premier:10:50"));
    expect(first).toEqual(again);
    expect(["b", "c"]).toContain(first?.id);
  });

  it("returns null with nobody to elect", () => {
    expect(pickSuccessor([], seededRng("x"))).toBeNull();
  });
});

describe("executive status payload", () => {
  it("describes an open succession by stage", () => {
    const s = vacancy("FR", "presidential");
    expect(describeSuccession(s, 101).stage).toBe("acting");
    expect(describeSuccession(s, 101).summary).toContain("Prime Minister is acting");
    expect(describeSuccession(s, s.actingUntilTurn + 1).stage).toBe("awaiting_fill");
    expect(describeSuccession(s, s.fillByTurn + 1).stage).toBe("overdue");
  });

  it("reports caretaker only while no government is formed", () => {
    const caretaker = { sinceTurn: 5, reason: "dissolution" as const, outgoingLeaderName: null };
    expect(executiveStatusPayload({ status: "pending", caretaker }, 10).caretaker).toEqual(
      caretaker
    );
    expect(executiveStatusPayload({ status: "formed", caretaker }, 10).caretaker).toBeNull();
  });

  it("flags a presidency that runs on its own constitutional ballot", () => {
    const gov = { succession: vacancy("RU", "presidential") };
    expect(executiveStatusPayload(gov, 101, true).succession?.note).toContain("own constitutional");
    expect(executiveStatusPayload(gov, 101).succession?.note).toBeNull();
    expect(ownsPresidentialBallot("RU", "1991-default")).toBe(true);
    expect(ownsPresidentialBallot("RU", "2027-default")).toBe(false);
    expect(ownsPresidentialBallot("FR", "1991-default")).toBe(false);
    expect(ownsPresidentialBallot("RU", undefined)).toBe(false);
  });

  it("is empty when the office is held", () => {
    expect(executiveStatusPayload(null, 10)).toEqual({ succession: null, caretaker: null });
  });
});

describe("succession fallbacks", () => {
  const cnVote = () => vacancy("CN", "onePartyState");
  const frElection = () => vacancy("FR", "presidential");

  it("only generates a successor once the fill is overdue", async () => {
    const { mayGenerateSuccessor } = await import("./successionFill");
    const s = cnVote();
    expect(mayGenerateSuccessor(s, s.fillByTurn)).toBe(false);
    expect(mayGenerateSuccessor(s, s.fillByTurn + 1)).toBe(true);
  });

  it("forces a fill only for an overdue election office with no special election running", async () => {
    const { needsForcedFill } = await import("./successionFill");
    const s = frElection();
    expect(needsForcedFill(s, s.fillByTurn + 1, false)).toBe(true);
    expect(needsForcedFill(s, s.fillByTurn + 1, true)).toBe(false);
    expect(needsForcedFill(s, s.fillByTurn, false)).toBe(false);
    const vote = cnVote();
    expect(needsForcedFill(vote, vote.fillByTurn + 1, false)).toBe(false);
  });

  it("picks a fallback party from the largest bloc, then the last holder, then a default", async () => {
    const { pickFallbackParty } = await import("./successionFill");
    expect(pickFallbackParty(["2", "3", "3"], "9", ["1"])).toBe("3");
    expect(pickFallbackParty([], "9", ["1"])).toBe("9");
    expect(pickFallbackParty([], undefined, ["1", "2"])).toBe("1");
    expect(pickFallbackParty([], undefined, [])).toBeNull();
  });
});
