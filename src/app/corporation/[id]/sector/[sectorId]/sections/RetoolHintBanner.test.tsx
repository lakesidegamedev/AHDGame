// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { RetoolHint } from "@/lib/corporations/retoolHint";
import RetoolHintBanner from "./RetoolHintBanner";

const HINT: RetoolHint = {
  currentStrategyId: "software",
  salesSource: "settlement",
  currentMain: { commodity: "software", valueShare: 0.57, fill: 0.29, marketSurplusShare: 0.34 },
  currentValueFill: 0.6,
  runShare: 0.45,
  suggestedStrategyId: "hardware",
  suggestedStrategyName: "Hardware",
  suggestedMain: { commodity: "electronics", valueShare: 0.92, unmetShare: 0.31 },
  suggestedValueFill: 0.93,
};

const statusText = () =>
  screen.getByRole("status", { name: "Strategy suggestion" }).textContent ?? "";
const regionText = (name: string) => screen.getByRole("region", { name }).textContent ?? "";

describe("RetoolHintBanner", () => {
  it("keeps the plant's figures apart from the market's", () => {
    render(<RetoolHintBanner hint={HINT} isCeo={false} onOpenStrategy={() => {}} />);
    const plant = regionText("This plant last turn");
    expect(plant).toContain("Buyers took 29% of the Software & IT Services it offered.");
    expect(plant).toContain("Software & IT Services is 57% of its output by value");
    expect(plant).toContain("across all its products it sold 60% by value");
    expect(plant).toContain("It ran at 45% of its capacity.");
    expect(plant).not.toContain("34%");
    const market = regionText("This market");
    expect(market).toContain("34% of the Software & IT Services on offer here had no buyer");
    expect(market).not.toContain("29%");
    const text = statusText();
    expect(text).toContain("This plant's main product is oversupplied here");
    expect(text).toContain("The Hardware strategy makes mostly Electronics");
    expect(text).toContain("31% short");
    expect(text).toContain("about 93%");
    expect(text).not.toMatch(/[\u2013\u2014]/);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("reports a single product plant selling half into a glut without a value split", () => {
    render(
      <RetoolHintBanner
        hint={{
          ...HINT,
          currentMain: {
            commodity: "healthcare_services",
            valueShare: 1,
            fill: 0.5,
            marketSurplusShare: 2 / 12,
          },
          currentValueFill: 0.5,
          runShare: 0.6,
        }}
        isCeo={false}
        onOpenStrategy={() => {}}
      />
    );
    const plant = regionText("This plant last turn");
    expect(plant).toBe(
      "This plant, last turnBuyers took 50% of the Healthcare Services it offered.It ran at 60% of its capacity."
    );
    expect(regionText("This market")).toContain(
      "17% of the Healthcare Services on offer here had no buyer"
    );
  });

  it("leaves out the capacity line when the run was not recorded", () => {
    render(
      <RetoolHintBanner
        hint={{ ...HINT, runShare: null }}
        isCeo={false}
        onOpenStrategy={() => {}}
      />
    );
    expect(regionText("This plant last turn")).not.toContain("capacity");
  });

  it("gives the CEO a way to the strategy picker", () => {
    const open = vi.fn();
    render(<RetoolHintBanner hint={HINT} isCeo onOpenStrategy={open} />);
    fireEvent.click(screen.getByRole("button", { name: "Review Hardware retool" }));
    expect(open).toHaveBeenCalledExactlyOnceWith("hardware");
  });
});
