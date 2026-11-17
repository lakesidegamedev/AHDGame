import { describe, expect, it } from "vitest";
import { providerLinkSessionStatus } from "./providerLinkSession";
describe("provider link session", () => {
  it.each([
    ["a", "a", "same"],
    ["a", "b", "changed"],
    [null, "a", "unknown"],
    ["a", undefined, "unknown"],
    ["a", "", "unknown"],
    ["a", 42, "unknown"],
  ])("compares %s with %s", (expected, current, status) => {
    expect(providerLinkSessionStatus(expected as string | null, current)).toBe(status);
  });
});
