/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrendChip, trendPercent } from "./TrendChip";

describe("trendPercent", () => {
  it("turns an absolute last-turn change into percent of the prior value", () => {
    expect(trendPercent(1144.94, 4761762.79)).toBeCloseTo(0.024, 3);
    expect(trendPercent(0.2, 4.2)).toBeCloseTo(5, 5);
  });
  it("passes through when no value is given and rejects bad input", () => {
    expect(trendPercent(3)).toBe(3);
    expect(trendPercent(null, 5)).toBeNull();
    expect(trendPercent(5, 5)).toBeNull();
  });
});

describe("TrendChip", () => {
  it("does not read a yen-sized change as hundreds of percent", () => {
    render(<TrendChip trend={1144.94} value={4761762.79} isHigherBetter />);
    expect(screen.getByText("flat")).toBeTruthy();
  });
});
