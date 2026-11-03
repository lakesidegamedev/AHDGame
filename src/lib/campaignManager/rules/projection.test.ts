import { describe, expect, it } from "vitest";
import { projectSubunits, type ProjectionCandidate } from "./projection";

const subs = [
  { id: "left", name: "Left County", electorate: 100, leanScalar: -20 },
  { id: "right", name: "Right County", electorate: 100, leanScalar: 20 },
];

describe("projectSubunits", () => {
  it("spreads a general's statewide shares through each county's lean", () => {
    const cands: ProjectionCandidate[] = [
      { id: "d", partyId: "1", share: 50, econ: -2 },
      { id: "r", partyId: "2", share: 50, econ: 2 },
    ];
    const out = projectSubunits(subs, cands, "general");
    expect(out.find((u) => u.id === "left")!.winner).toBe("d");
    expect(out.find((u) => u.id === "right")!.winner).toBe("r");
  });

  it("uses a party's baseline results where the region has them", () => {
    const withBaseline = [
      { id: "a", name: "A", electorate: 100, partyShares: { LAB: 0.6, CON: 0.4 } },
      { id: "b", name: "B", electorate: 100, partyShares: { LAB: 0.3, CON: 0.7 } },
    ];
    const out = projectSubunits(
      withBaseline,
      [
        { id: "l", partyId: "1", partyAbbr: "LAB", share: 50, econ: -2 },
        { id: "c", partyId: "2", partyAbbr: "CON", share: 50, econ: 2 },
      ],
      "general"
    );
    expect(out.find((u) => u.id === "a")!.winner).toBe("l");
    expect(out.find((u) => u.id === "b")!.winner).toBe("c");
  });

  it("projects a general before its first count from lean alone", () => {
    const out = projectSubunits(
      subs,
      [
        { id: "d", partyId: "1", share: 0, econ: -2 },
        { id: "r", partyId: "2", share: 0, econ: 2 },
      ],
      "general"
    );
    expect(out.map((u) => u.winner)).toEqual(["d", "r"]);
  });

  it("splits a primary by where each candidate sits against their own party", () => {
    // Same party, so the same baseline: the left-of-party candidate wins the left county.
    const out = projectSubunits(
      subs,
      [
        { id: "lefty", partyId: "1", share: 50, econ: -4 },
        { id: "centrist", partyId: "1", share: 50, econ: -1 },
      ],
      "primary"
    );
    expect(out.find((u) => u.id === "left")!.winner).toBe("lefty");
    expect(out.find((u) => u.id === "right")!.winner).toBe("centrist");
  });

  it("weighs equal-population districts evenly when they carry no electorate", () => {
    const districts = [
      { id: "D-1", name: "D-1", electorate: 0, leanScalar: -20 },
      { id: "D-2", name: "D-2", electorate: 0, leanScalar: 20 },
    ];
    const out = projectSubunits(
      districts,
      [
        { id: "d", partyId: "1", share: 50, econ: -2 },
        { id: "r", partyId: "2", share: 50, econ: 2 },
      ],
      "general"
    );
    expect(out.map((u) => u.winner)).toEqual(["d", "r"]);
  });

  it("returns nothing with no candidates", () => {
    expect(projectSubunits(subs, [], "general")).toEqual([]);
  });
});

describe("primaryCandidateColor", () => {
  it("keeps the party colour for the leader and gives the rest their own", async () => {
    const { primaryCandidateColor } = await import("./projection");
    expect(primaryCandidateColor("#2563eb", 0)).toBe("#2563eb");
    const others = [1, 2, 3].map((i) => primaryCandidateColor("#2563eb", i));
    expect(new Set(others).size).toBe(3);
    expect(others).not.toContain("#2563eb");
  });
});
