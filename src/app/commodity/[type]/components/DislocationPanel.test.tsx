import { describe, expect, it } from "vitest";
import { premiumLabel } from "./DislocationPanel";

describe("premiumLabel", () => {
  it("states the multiplier next to the two prices it was computed from", () => {
    const fmt = (n: number) => `$${n}`;
    expect(premiumLabel(8775, 2500, fmt)).toBe("3.51x base price ($8775 vs $2500)");
  });
});
