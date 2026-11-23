import { describe, expect, it } from "vitest";
import { liveChangeVsPreviousClose } from "./quoteChange";

describe("liveChangeVsPreviousClose", () => {
  it("compares the live price to the second newest close", () => {
    const history = [{ sharePrice: 5 }, { sharePrice: 5.1 }, { sharePrice: 5.89 }];
    expect(liveChangeVsPreviousClose(6.06, history)).toBeCloseTo(((6.06 - 5.1) / 5.1) * 100, 6);
  });
  it("is zero without two closes or a usable previous close", () => {
    expect(liveChangeVsPreviousClose(6, [{ sharePrice: 5 }])).toBe(0);
    expect(liveChangeVsPreviousClose(6, [{ sharePrice: 0 }, { sharePrice: 5 }])).toBe(0);
    expect(liveChangeVsPreviousClose(Number.NaN, [{ sharePrice: 4 }, { sharePrice: 5 }])).toBe(0);
  });
});
