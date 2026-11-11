// @vitest-environment happy-dom
import { cleanup, render as renderView, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/corporations.json";
import { afterEach, expect, it } from "vitest";
import FundedBuildDemand from "./FundedBuildDemand";
afterEach(cleanup);
function render(view: ReactElement) {
  return renderView(
    <NextIntlClientProvider locale="en" messages={messages}>
      {view}
    </NextIntlClientProvider>
  );
}
it("shows mixed-output demand separately with its source turn and unknown values", () => {
  render(
    <FundedBuildDemand
      turn={778}
      rows={[
        { commodity: "network_services", scope: "national", funded: 100, delivered: 0, unmet: 100 },
        { commodity: "software", scope: "regional", funded: null, delivered: null, unmet: null },
      ]}
    />
  );
  expect(screen.getByText("Funded buyer demand, turn 778")).toBeTruthy();
  expect(screen.getByText(/Network Services \/ National/)).toBeTruthy();
  expect(screen.getAllByText("Not measured")).toHaveLength(3);
  expect(screen.getByText(/International orders are not included/)).toBeTruthy();
});
it("does not show national demand for a regional-only output", () => {
  render(
    <FundedBuildDemand
      rows={[
        { commodity: "healthcare_services", scope: "regional", funded: 10, delivered: 3, unmet: 7 },
      ]}
    />
  );
  expect(screen.queryByText(/\/ National/)).toBeNull();
});

it("shows rounded per-output buildings and the conservative full-mix count without operating history", () => {
  render(
    <FundedBuildDemand
      unitsPerFacility={10}
      rows={[
        {
          commodity: "software",
          scope: "national",
          funded: 100,
          delivered: 100,
          unmet: 0,
          capacityUnits: 0,
        },
        {
          commodity: "network_services",
          scope: "national",
          funded: 100,
          delivered: 0,
          unmet: 100,
          capacityUnits: 25,
        },
      ]}
    />
  );
  expect(screen.getByText("Buildings to fill gap")).toBeTruthy();
  expect(screen.getByText("3")).toBeTruthy();
  expect(screen.getByText("Room with buyers for every output: 0 buildings")).toBeTruthy();
  expect(screen.getByText(/staffing, inputs or profit recommendation/)).toBeTruthy();
  expect(
    screen.getByText(/A zero all-output count does not mean no buildings are useful/)
  ).toBeTruthy();
  expect(
    screen.getByText(/may be profitable if those sales cover the full running costs/)
  ).toBeTruthy();
  expect(
    screen.getByText(/Delivered means completed purchases by buyers in this market/)
  ).toBeTruthy();
});
