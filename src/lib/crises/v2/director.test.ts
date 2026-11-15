import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIRECTOR_BUDGET,
  crisisLoad,
  decideOpenings,
  type DirectorActiveCrisis,
  type DirectorCandidate,
} from "./director";

function candidate(overrides: Partial<DirectorCandidate> = {}): DirectorCandidate {
  return {
    key: "c1",
    definitionId: "flood",
    scope: "local",
    countryIds: ["US"],
    priority: 1,
    ...overrides,
  };
}

function active(overrides: Partial<DirectorActiveCrisis> = {}): DirectorActiveCrisis {
  return {
    definitionId: "other",
    scope: "local",
    stage: "onset",
    countryIds: ["US"],
    startTurn: 0,
    ...overrides,
  };
}

describe("crisisLoad", () => {
  it("weights by scope, halves aftermath and ignores resolved", () => {
    const budget = DEFAULT_DIRECTOR_BUDGET;
    expect(crisisLoad({ scope: "national", stage: "peak" }, budget)).toBe(5);
    expect(crisisLoad({ scope: "national", stage: "aftermath" }, budget)).toBe(2.5);
    expect(crisisLoad({ scope: "national", stage: "resolved" }, budget)).toBe(0);
  });
});

describe("decideOpenings", () => {
  it("approves everything that fits an empty world", () => {
    const result = decideOpenings(
      [candidate({ key: "a", countryIds: ["US"] }), candidate({ key: "b", countryIds: ["DE"] })],
      [],
      10
    );
    expect(result.approved.map((c) => c.key)).toEqual(["a", "b"]);
    expect(result.refused).toEqual([]);
  });

  it("opens higher priority first and breaks ties by key", () => {
    const result = decideOpenings(
      [
        candidate({ key: "b", priority: 1, countryIds: ["DE"] }),
        candidate({ key: "a", priority: 1, countryIds: ["FR"] }),
        candidate({ key: "z", priority: 9, countryIds: ["JP"] }),
      ],
      [],
      10,
      { ...DEFAULT_DIRECTOR_BUDGET, maxOpensPerTurn: 2 }
    );
    expect(result.approved.map((c) => c.key)).toEqual(["z", "a"]);
    expect(result.refused).toEqual([
      { candidate: expect.objectContaining({ key: "b" }), reason: "turnLimit" },
    ]);
  });

  it("refuses a duplicate of a live crisis in the same countries", () => {
    const result = decideOpenings(
      [candidate({ definitionId: "flood" })],
      [active({ definitionId: "flood" })],
      10
    );
    expect(result.refused[0]?.reason).toBe("duplicate");
  });

  it("allows an ended duplicate to open again", () => {
    const result = decideOpenings(
      [candidate({ definitionId: "flood" })],
      [active({ definitionId: "flood", stage: "resolved" })],
      10
    );
    expect(result.approved).toHaveLength(1);
  });

  it("caps concurrent crises per scope", () => {
    const budget = {
      ...DEFAULT_DIRECTOR_BUDGET,
      maxConcurrent: { ...DEFAULT_DIRECTOR_BUDGET.maxConcurrent, national: 1 },
      minGapTurns: { ...DEFAULT_DIRECTOR_BUDGET.minGapTurns, national: 0 },
    };
    const result = decideOpenings(
      [candidate({ scope: "national", definitionId: "recession", countryIds: ["DE"] })],
      [active({ scope: "national", countryIds: ["US"] })],
      10,
      budget
    );
    expect(result.refused[0]?.reason).toBe("scopeFull");
  });

  it("holds a national crisis until the scope gap has passed", () => {
    const national = candidate({ scope: "national", definitionId: "recession" });
    const early = decideOpenings(
      [national],
      [active({ scope: "national", countryIds: ["DE"], startTurn: 8 })],
      10
    );
    expect(early.refused[0]?.reason).toBe("scopeGap");
    const later = decideOpenings(
      [national],
      [active({ scope: "national", countryIds: ["DE"], startTurn: 2 })],
      10
    );
    expect(later.approved).toHaveLength(1);
  });

  it("allows only one national opening per turn through the scope gap", () => {
    const result = decideOpenings(
      [
        candidate({
          key: "a",
          scope: "national",
          definitionId: "x",
          countryIds: ["US"],
          priority: 2,
        }),
        candidate({
          key: "b",
          scope: "national",
          definitionId: "y",
          countryIds: ["DE"],
          priority: 1,
        }),
      ],
      [],
      10
    );
    expect(result.approved.map((c) => c.key)).toEqual(["a"]);
    expect(result.refused[0]?.reason).toBe("scopeGap");
  });

  it("refuses when the world is at its total load ceiling", () => {
    const budget = { ...DEFAULT_DIRECTOR_BUDGET, maxTotalLoad: 3 };
    const result = decideOpenings(
      [candidate({ scope: "state", countryIds: ["DE"] })],
      [active({ scope: "state", countryIds: ["US"] })],
      10,
      budget
    );
    expect(result.refused[0]?.reason).toBe("totalLoad");
  });

  it("stops one country being buried under crises", () => {
    const budget = { ...DEFAULT_DIRECTOR_BUDGET, maxCountryLoad: 2 };
    const result = decideOpenings(
      [candidate({ scope: "state", definitionId: "storm" })],
      [active({ scope: "local", countryIds: ["US"] })],
      10,
      budget
    );
    expect(result.refused[0]?.reason).toBe("countryLoad");
  });

  it("keeps global crises rare", () => {
    const global = candidate({ scope: "global", definitionId: "pandemic", countryIds: [] });
    const result = decideOpenings(
      [global],
      [active({ scope: "global", countryIds: [], startTurn: 0 })],
      10
    );
    expect(result.refused[0]?.reason).toBe("scopeFull");
  });

  it("treats a frequent local mix as fitting by default", () => {
    const many = Array.from({ length: 4 }, (_, i) =>
      candidate({ key: `k${i}`, definitionId: `d${i}`, countryIds: [`C${i}`] })
    );
    const result = decideOpenings(many, [], 10);
    expect(result.approved).toHaveLength(4);
  });
});
