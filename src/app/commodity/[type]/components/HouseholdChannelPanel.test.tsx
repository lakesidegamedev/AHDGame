/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { householdChannelTotals } from "@/lib/stores/rules/storeRules";
import HouseholdChannelPanel from "./HouseholdChannelPanel";

describe("HouseholdChannelPanel", () => {
  it("shows the through-store and direct split, markup included", () => {
    const totals = householdChannelTotals(
      [
        { commodity: "food", storeUnits: 300, storeValue: 600, directUnits: 200, directValue: 400 },
        { commodity: "food", storeUnits: 0, storeValue: 0, directUnits: 50, directValue: 100 },
        { commodity: "electronics", storeUnits: 9, storeValue: 9, directUnits: 9, directValue: 9 },
      ],
      "food",
      0.15
    )!;
    expect(totals.storeUnits).toBe(300);
    expect(totals.directUnits).toBe(250);
    render(<HouseholdChannelPanel channel={{ ...totals, turn: 4 }} unit="units" />);
    expect(screen.getByText("Through stores")).toBeTruthy();
    expect(screen.getByText("Direct from producers")).toBeTruthy();
    expect(screen.getByText(/55% of the units households bought went through stores/)).toBeTruthy();
    expect(screen.getByText(/15% markup/)).toBeTruthy();
  });

  it("renders nothing for a good stores do not sell", () => {
    const { container } = render(<HouseholdChannelPanel channel={undefined} unit="units" />);
    expect(container.textContent).toBe("");
    expect(householdChannelTotals([], "vehicles", 0.15)).toBeNull();
  });
});
