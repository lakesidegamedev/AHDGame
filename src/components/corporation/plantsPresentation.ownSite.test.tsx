// @vitest-environment happy-dom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RunningSoldReading } from "./plantsPresentation";

const base = { produced: 360, capacity: 400, fill: 0, band: "low" as const, plantCount: 2 };

describe("RunningSoldReading own-site line", () => {
  it("keeps Sold honest and adds the own-site share beside it", () => {
    const { container } = render(<RunningSoldReading {...base} ownSiteShare={1} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Sold 0%");
    expect(text).toContain("100% of all output to your sites");
  });

  it("says the base is all products and that own-truck hauls are not in it (ticket 1790)", () => {
    const { container } = render(<RunningSoldReading {...base} ownSiteShare={0.65} />);
    const line = Array.from(container.querySelectorAll("[title]")).find((el) =>
      el.textContent?.includes("to your sites")
    );
    expect(line?.textContent).toContain("65% of all output to your sites");
    const tip = line?.getAttribute("title") ?? "";
    expect(tip).toContain("all products together");
    expect(tip).toContain("own trucks");
  });

  it("adds nothing when no output went to own sites", () => {
    const { container } = render(<RunningSoldReading {...base} ownSiteShare={null} />);
    expect(container.textContent).not.toContain("to your sites");
  });
});
