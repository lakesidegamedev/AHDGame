// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SupplyAdvice } from "./SupplyAdvice";
import { planSupply } from "@/lib/navair/rules/supply";
import type { NavairUnit } from "@/lib/navair/types";
afterEach(cleanup);
describe("supply advice", () => {
  it("shows the next-turn estimate, shared and national berth limits, and inaccessible stations clearly", () => {
    const advice = planSupply(
      [
        {
          countryId: "US",
          domain: "naval",
          type: "Guided-Missile Destroyer",
          station: "nat",
          integrity: 100,
        } as NavairUnit,
      ],
      { blocs: {}, enemies: {}, agreements: [] }
    )[0];
    render(
      <SupplyAdvice
        naval
        advice={advice}
        options={[
          { name: "North America", allowed: false, advice },
          { name: "North Atlantic", allowed: true, advice },
        ]}
      />
    );
    expect(screen.getByText(/Next-turn supply estimate: 77%/)).toBeDefined();
    expect(screen.getByText(/Your berth demand/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Compare resupply locations" }));
    expect(screen.getByText("Inland: no naval station")).toBeDefined();
    expect(screen.getByText("North Atlantic")).toBeDefined();
  });
  it("does not imply aircraft need naval berths", () => {
    const advice = planSupply(
      [{ countryId: "US", domain: "air", station: "noa", type: "Fighter Wing" } as NavairUnit],
      { blocs: {}, enemies: {}, agreements: [] }
    )[0];
    render(
      <SupplyAdvice
        naval={false}
        advice={advice}
        options={[{ name: "North America", allowed: true, advice }]}
      />
    );
    expect(screen.queryByText(/Your berth demand/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Compare resupply locations" }));
    expect(screen.getByText("Not required")).toBeDefined();
  });
});
