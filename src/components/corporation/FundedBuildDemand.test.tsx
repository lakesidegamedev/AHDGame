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
it("shows mixed-output demand separately with unknown values", () => {
  render(
    <FundedBuildDemand
      rows={[
        { commodity: "network_services", scope: "national", funded: 100, delivered: 0, unmet: 100 },
        { commodity: "software", scope: "regional", funded: null, delivered: null, unmet: null },
      ]}
    />
  );
  expect(screen.getByText("Buyer demand")).toBeTruthy();
  expect(screen.getByText(/Network Services \/ National/)).toBeTruthy();
  expect(screen.getAllByText("n/a")).toHaveLength(3);
  expect(screen.getByText(/National rows include regional buyers/)).toBeTruthy();
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
  expect(screen.getByText("Buildings needed")).toBeTruthy();
  expect(screen.getByText("3")).toBeTruthy();
  expect(screen.getByText("Room for buyers of every product: 0 buildings")).toBeTruthy();
  expect(screen.getByText(/National rows include regional buyers/)).toBeTruthy();
});
