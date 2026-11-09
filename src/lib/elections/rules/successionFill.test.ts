import { describe, expect, it } from "vitest";
import { getSuccessionRule, openExecutiveVacancy } from "./executiveSuccession";
import {
  describeSuccession,
  executiveStatusPayload,
  largestBlocParty,
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

  it("is empty when the office is held", () => {
    expect(executiveStatusPayload(null, 10)).toEqual({ succession: null, caretaker: null });
  });
});
