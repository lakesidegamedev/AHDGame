import { describe, expect, it } from "vitest";
import { anchorRuleText } from "./anchorRuleText";

describe("anchorRuleText", () => {
  it("states the limit in anchor currency with the converted amount beside it", () => {
    expect(anchorRuleText(500_000_000, "$449M")).toBe("₳500M, about $449M at today's rate");
    expect(anchorRuleText(100_000, "$89.9K")).toBe("₳100K, about $89.9K at today's rate");
  });
});
