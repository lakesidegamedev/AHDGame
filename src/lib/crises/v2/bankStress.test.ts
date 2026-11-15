import { describe, expect, it } from "vitest";
import { settleBankStress } from "./bankStress";

describe("settleBankStress", () => {
  it("does not panic on a fractional push", () => {
    expect(settleBankStress(0, 0.3, 4)).toEqual({ panicTurns: 0, carry: 0.3 });
  });

  it("panics once accumulated stress reaches a whole turn", () => {
    const first = settleBankStress(0, 0.3, 4);
    const second = settleBankStress(first.carry, 0.3, 4);
    const third = settleBankStress(second.carry, 0.3, 4);
    const fourth = settleBankStress(third.carry, 0.3, 4);
    expect([first, second, third].map((r) => r.panicTurns)).toEqual([0, 0, 0]);
    expect(fourth).toEqual({ panicTurns: 1, carry: 0.2 });
  });

  it("keeps whole-number stress at its old size and caps it", () => {
    expect(settleBankStress(0, 3, 4)).toEqual({ panicTurns: 3, carry: 0 });
    expect(settleBankStress(0, 9, 4).panicTurns).toBe(4);
  });
});
