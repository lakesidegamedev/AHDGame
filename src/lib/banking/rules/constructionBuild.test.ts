import { describe, expect, it } from "vitest";
import type { BankingTransition } from "./boundary";
import { withoutRetiredProjections } from "./constructionBuild";

function transition(collections: string[]): BankingTransition {
  return {
    key: "construction:claim:build-effects",
    kind: "construction_build_effects",
    turn: 1,
    currency: "USD",
    legs: [],
    projections: collections.map((collection) => ({
      collection,
      filter: {},
      update: { $set: { a: 1 } },
      note: collection,
    })),
    event: { kind: "loan.disbursed", command: "construction.effects", subjectId: "loan" },
  } as unknown as BankingTransition;
}

describe("withoutRetiredProjections", () => {
  it("drops projections aimed at the retired market collection", () => {
    const result = withoutRetiredProjections(transition(["unownedSectors", "corporateSectors"]));
    expect(result.projections.map((p) => p.collection)).toEqual(["corporateSectors"]);
  });

  it("returns the same transition when nothing is retired", () => {
    const input = transition(["corporateSectors"]);
    expect(withoutRetiredProjections(input)).toBe(input);
  });

  it("keeps the key, legs and event so settlement stays idempotent", () => {
    const input = transition(["unownedSectors"]);
    const result = withoutRetiredProjections(input);
    expect(result.key).toBe(input.key);
    expect(result.legs).toBe(input.legs);
    expect(result.event).toBe(input.event);
    expect(result.projections).toEqual([]);
  });
});
