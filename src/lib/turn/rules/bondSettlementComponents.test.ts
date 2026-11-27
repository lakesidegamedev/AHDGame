import { it, expect } from "vitest";
import { bondSettlementComponents, packBondSettlementComponents } from "./bondSettlementComponents";
it("isolates unrelated issuers and preserves every cross-holder cascade dependency", () => {
  expect(
    bondSettlementComponents(
      ["a", "b", "c", "d"],
      [
        { issuer: "a", holders: ["b", "x"] },
        { issuer: "b", holders: ["c"] },
      ]
    )
  ).toEqual([["a", "b", "c", "x"], ["d"]]);
});
it("handles a cycle and deterministic issuer order", () => {
  expect(
    bondSettlementComponents(
      ["c", "a", "b"],
      [
        { issuer: "a", holders: ["b"] },
        { issuer: "b", holders: ["a"] },
      ]
    )
  ).toEqual([["a", "b"], ["c"]]);
});

it("packs independent issuers without cutting a maturity dependency", () => {
  expect(packBondSettlementComponents([["a"], ["b", "c"], ["d"], ["e", "f", "g"]], 3)).toEqual([
    ["a", "b", "c"],
    ["d"],
    ["e", "f", "g"],
  ]);
});
