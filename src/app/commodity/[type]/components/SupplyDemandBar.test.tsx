// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SupplyDemandBar, { balanceSentence } from "./SupplyDemandBar";

vi.mock("@/components/CountryFlag", () => ({ CountryFlag: () => null }));
afterEach(cleanup);

const usElectronics = {
  supply: 164_700,
  demand: 74_700,
  spilloverRequested: 1_500,
  filled: 76_200,
  funded: 65_400,
  imports: 5_800,
  exports: 91_500,
};

describe("SupplyDemandBar", () => {
  it("counts exports with demand so an exporting country does not read as a glut", () => {
    render(
      <SupplyDemandBar
        supply={usElectronics.supply}
        demand={usElectronics.demand}
        imports={usElectronics.imports}
        market={usElectronics}
        unit="units"
        marketLabel="NYSE Market"
      />
    );
    expect(screen.getByText("170,500 units")).toBeTruthy();
    expect(screen.getByText("167,700 units")).toBeTruthy();
    expect(screen.getByText(/Exports 91,500 units/)).toBeTruthy();
    expect(screen.getByTestId("balance-sold").textContent).toContain("161.9K units");
    expect(screen.getByTestId("balance-sold").textContent).toContain("98% of their offers");
    expect(screen.queryByText(/oversupplied|surplus/i)).toBeNull();
  });

  it("shows whole-unit rows that add up exactly to the total shown", () => {
    const world = {
      supply: 11_758.43,
      demand: 11_647.58,
      spilloverRequested: 0,
      filled: 11_409.36,
      funded: null,
      imports: 0,
      exports: 0,
      supplyBy: { company: 9_352.87, backgroundEconomy: 1_925.6, wideEconomy: 479.96 },
      demandBy: { company: 9_718.1, backgroundEconomy: 1_929.48 },
    };
    render(
      <SupplyDemandBar
        supply={world.supply}
        demand={world.demand}
        market={world}
        world
        unit="campaigns"
      />
    );
    expect(screen.getByText("11,758 campaigns")).toBeTruthy();
    expect(screen.getByText(/Player and AI companies 9,353 campaigns/)).toBeTruthy();
    expect(
      screen.getByText(/Background economy \(countries without companies\) 1,925 campaigns/)
    ).toBeTruthy();
    expect(screen.getByText(/Background economy \(sellers\) 480 campaigns/)).toBeTruthy();
    // 9,353 + 1,925 + 480 = 11,758
    expect(screen.getByText("11,648 campaigns")).toBeTruthy();
  });

  it("does not call a local gap unsold goods without a traded book", () => {
    render(<SupplyDemandBar supply={300} demand={100} unit="units" />);
    expect(screen.getByTestId("balance-verdict").textContent).toBe(
      balanceSentence(300, 100, false)
    );
    expect(balanceSentence(300, 100, false)).toMatch(/does not mean goods went unsold/);
    expect(screen.queryByText(/oversupplied/i)).toBeNull();
  });

  it("leaves out the trade note for the whole world", () => {
    expect(balanceSentence(100, 200, true)).toBe(
      "Buyers ordered 100% more than producers offered."
    );
    expect(balanceSentence(0, 50, true)).toBe("Nothing was offered here.");
  });
});
