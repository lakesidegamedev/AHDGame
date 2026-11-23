import { describe, expect, it } from "vitest";
import { incomeTone } from "./PortfolioShell";

describe("incomeTone", () => {
  it("keeps zero and unusable income neutral", () => {
    expect(incomeTone(0)).toBe("neutral");
    expect(incomeTone(Number.NaN)).toBe("neutral");
    expect(incomeTone(undefined)).toBe("neutral");
  });
  it("marks positive income as a gain", () => {
    expect(incomeTone(12)).toBe("gain");
  });
});
