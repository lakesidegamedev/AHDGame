import { describe, expect, it } from "vitest";
import { costLines, ledgerView } from "./ledgerView";
import { makeDefinition } from "./testFixtures";
import type { AccountabilityEntry } from "./types";

const row = (overrides: Partial<AccountabilityEntry>): AccountabilityEntry => ({
  turn: 1,
  stage: "onset",
  role: "headOfState",
  holderId: "a",
  leverId: null,
  cost: {},
  mitigation: 0,
  severity: 41.6,
  ...overrides,
});

describe("ledgerView", () => {
  it("lists newest turns first with lever labels and no-action rows", () => {
    const rows = ledgerView(
      [
        row({ turn: 3, leverId: "stimulus" }),
        row({ turn: 5, role: "stateGovernor", holderId: "b" }),
      ],
      makeDefinition(),
      new Map([["a", "Jane Roe"]])
    );
    expect(rows.map((r) => r.turn)).toEqual([5, 3]);
    expect(rows[0]).toMatchObject({ action: null, holderName: "Governor", severity: 42 });
    expect(rows[1]).toMatchObject({ action: "Stimulus", holderName: "Jane Roe" });
  });

  it("caps the number of rows", () => {
    const many = Array.from({ length: 10 }, (_, i) => row({ turn: i }));
    expect(ledgerView(many, makeDefinition(), new Map(), 4)).toHaveLength(4);
  });
});

describe("costLines", () => {
  const money = (n: number) => `$${n}`;
  it("names only the resources a lever spends", () => {
    expect(
      costLines(
        {
          treasuryCash: 1000,
          corpCash: 50,
          approval: { group: "x", points: 2 },
          politicalCapital: 1,
        },
        money
      )
    ).toEqual([
      "$1000 from the treasury",
      "$50 from company cash",
      "2 points of approval",
      "1 action",
    ]);
    expect(costLines({}, money)).toEqual([]);
  });
});
