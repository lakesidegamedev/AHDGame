import { describe, expect, it } from "vitest";
import { compareHoldersByShares } from "./holderOrder";

describe("compareHoldersByShares", () => {
  it("ranks equal holdings the same way whatever the input order", () => {
    const a = { shares: 359245, name: "Alpha", characterId: "1" };
    const b = { shares: 359245, name: "Beta", characterId: "2" };
    const big = { shares: 900000, name: "Zed", characterId: "3" };
    expect([a, b, big].sort(compareHoldersByShares).map((h) => h.name)).toEqual([
      "Zed",
      "Alpha",
      "Beta",
    ]);
    expect([b, big, a].sort(compareHoldersByShares).map((h) => h.name)).toEqual([
      "Zed",
      "Alpha",
      "Beta",
    ]);
  });
  it("breaks a name tie on id", () => {
    const x = { shares: 5, name: "Same", characterId: "b" };
    const y = { shares: 5, name: "Same", characterId: "a" };
    expect([x, y].sort(compareHoldersByShares)[0]).toBe(y);
  });
});
