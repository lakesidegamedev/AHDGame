import { describe, expect, it } from "vitest";
import { approvalText, approvalTone } from "./tone";

describe("approval tone", () => {
  it("never uses red: low ratings are a warning", () => {
    expect(approvalTone(31)).toBe("warning");
    expect(approvalText(31)).toBe("text-warning");
    expect(approvalText(0)).toBe("text-warning");
  });

  it("is neutral in the middle and green when healthy", () => {
    expect(approvalTone(45)).toBe("neutral");
    expect(approvalTone(50)).toBe("gain");
  });

  it("honours a custom low line", () => {
    expect(approvalTone(35, 30)).toBe("neutral");
    expect(approvalTone(25, 30)).toBe("warning");
  });

  it("treats missing values as neutral", () => {
    expect(approvalTone(Number.NaN)).toBe("neutral");
  });
});
