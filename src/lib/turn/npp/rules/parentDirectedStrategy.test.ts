import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { isParentDirectedStrategyProtected } from "./parentDirectedStrategy";

const stamp = (untilTurn: number) => ({
  parentDirectedStrategy: {
    byCorporationId: new ObjectId(),
    byUserId: new ObjectId(),
    strategyId: "standard",
    atTurn: untilTurn - 48,
    untilTurn,
  },
});

describe("isParentDirectedStrategyProtected", () => {
  it("protects strictly before untilTurn", () => {
    expect(isParentDirectedStrategyProtected(stamp(150), 149)).toBe(true);
    expect(isParentDirectedStrategyProtected(stamp(150), 150)).toBe(false);
  });

  it("is false with no stamp", () => {
    expect(isParentDirectedStrategyProtected({}, 10)).toBe(false);
    expect(isParentDirectedStrategyProtected({ parentDirectedStrategy: null }, 10)).toBe(false);
  });
});
