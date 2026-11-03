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
    expect(text).toContain("100% to your sites");
  });

  it("adds nothing when no output went to own sites", () => {
    const { container } = render(<RunningSoldReading {...base} ownSiteShare={null} />);
    expect(container.textContent).not.toContain("to your sites");
  });
});
