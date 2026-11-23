/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CabinetStatStrip } from "./CabinetStatStrip";
import type { MetricConfig } from "@/lib/constants/cabinetMechanicsTypes";

afterEach(cleanup);

const metrics: MetricConfig[] = [
  {
    category: "social",
    metricId: "corruption",
    label: "Corruption",
    format: "index",
    higherIsBetter: false,
  },
  {
    category: "social",
    metricId: "publicTrust",
    label: "Public Trust",
    format: "index",
    higherIsBetter: true,
  },
];

describe("CabinetStatStrip", () => {
  it("shows a dash, not 0.0, for a metric with no stored value", () => {
    render(<CabinetStatStrip metrics={metrics} values={{}} />);
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByText("0.0")).toBeNull();
  });

  it("shows a stored value and dashes only the missing one", () => {
    render(<CabinetStatStrip metrics={metrics} values={{ "social.publicTrust": 62.5 }} />);
    expect(screen.getByText("62.5")).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(1);
  });
});
