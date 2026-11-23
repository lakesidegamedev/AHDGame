import { describe, expect, it } from "vitest";
import { wholeNumberInput } from "./wholeNumberInput";

describe("wholeNumberInput", () => {
  it.each([
    "-5",
    "+5",
    "1.5",
    "1e6",
    "0x10",
    "12x",
    "1,00",
    "1,,000",
    "Infinity",
    "9007199254740992",
    "",
    "0",
  ])("rejects %s without rewriting its intent", (raw) => {
    expect(wholeNumberInput(raw)).toBeNull();
  });
  it("accepts complete whole quantities and intentional grouping", () => {
    expect(wholeNumberInput(" 1,000 ")).toBe(1000);
    expect(wholeNumberInput("5000000000000")).toBe(5_000_000_000_000);
    expect(wholeNumberInput("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("rejects an oversized request instead of changing it to the available amount", () => {
    expect(wholeNumberInput("101", 1, 100)).toBeNull();
    expect(wholeNumberInput("100", 1, 100)).toBe(100);
  });
});
