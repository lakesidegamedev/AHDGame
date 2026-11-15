import { describe, expect, it } from "vitest";
import { leverActionCost } from "./leverActions";

describe("leverActionCost", () => {
  it("maps political weight to one to three actions", () => {
    expect(leverActionCost(3)).toBe(1);
    expect(leverActionCost(4)).toBe(2);
    expect(leverActionCost(5)).toBe(2);
    expect(leverActionCost(6)).toBe(3);
    expect(leverActionCost(40)).toBe(3);
  });

  it("charges nothing for a lever with no political weight", () => {
    expect(leverActionCost(undefined)).toBe(0);
    expect(leverActionCost(0)).toBe(0);
  });

  it("scales by intensity but never below one action for a real pull", () => {
    expect(leverActionCost(6, 0.5)).toBe(1);
    expect(leverActionCost(6, 0.8)).toBe(2);
    expect(leverActionCost(1, 0.1)).toBe(1);
    expect(leverActionCost(6, 0)).toBe(0);
  });
});
