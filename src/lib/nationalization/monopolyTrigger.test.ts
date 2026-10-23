import { describe, expect, it } from "vitest";
import { topGroupCellSharePercent } from "./monopolyTrigger";

const row = (root: string, stateId: string, sharePercent: number, sectorType = "mining") => ({
  root,
  stateId,
  sectorType,
  sharePercent,
});

describe("topGroupCellSharePercent", () => {
  it("adds members' shares in the same cell", () => {
    const top = topGroupCellSharePercent([row("g", "s1", 40), row("g", "s1", 40)]);
    expect(top.get("g")).toBe(80);
  });

  it("does not add shares across different cells", () => {
    const top = topGroupCellSharePercent([
      row("g", "s1", 40),
      row("g", "s2", 40),
      row("g", "s1", 10, "retail"),
    ]);
    expect(top.get("g")).toBe(40);
  });

  it("keeps groups apart", () => {
    const top = topGroupCellSharePercent([row("a", "s1", 30), row("b", "s1", 50)]);
    expect(top.get("a")).toBe(30);
    expect(top.get("b")).toBe(50);
  });
});
