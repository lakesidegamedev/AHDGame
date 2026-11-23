/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ResetMetricHistoryChart } from "./ResetMetricHistoryChart";
import { MetricRow, type ResetMetricRow } from "./MetricBoardDetails";
import { primaryMetricById } from "@/lib/resetMetrics/catalog";
afterEach(cleanup);
const metric: ResetMetricRow = {
  ...primaryMetricById("35")!,
  conditionScore: 45.6,
  observation: {
    metricId: "35",
    path: primaryMetricById("35")!.path,
    owner: "environment",
    note: "Modeled air index",
    value: 21.3,
    status: "proxy",
    source: "model",
    lastUpdatedTurn: 13,
  },
  temporaryActionEffect: null,
  legislativeEffect: null,
  standingLaws: [],
};
describe("auditable metric display", () => {
  it("spaces samples by elapsed turns and exposes all sampled values", () => {
    const { container } = render(
      <ResetMetricHistoryChart
        countryId="US"
        metric={metric}
        history={[
          { turn: 1, value: 10 },
          { turn: 13, value: 20 },
          { turn: 14, value: 30 },
        ]}
      />
    );
    expect(container.querySelector("polyline")?.getAttribute("points")).toBe(
      "64.0,196.0 610.5,110.0 656.0,24.0"
    );
    expect(screen.getByRole("table", { hidden: true }).textContent).toContain("13");
    expect(screen.getByText("View sampled turn values")).toBeTruthy();
  });
  it("shows the normalized condition score separately from the raw metric", () => {
    render(<MetricRow countryId="US" metric={metric} onOpen={() => {}} />);
    expect(screen.getByText("Condition score: 45.6 / 100")).toBeTruthy();
    expect(screen.getByText(/21.3/)).toBeTruthy();
  });
});
