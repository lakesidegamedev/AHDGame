// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CommodityChart from "./CommodityChart";

vi.mock("./PriceChart", () => ({ default: () => <div>Converted price series</div> }));
vi.mock("./SupplyDemandChart", () => ({ default: () => <div>Physical market series</div> }));
afterEach(cleanup);

it("does not draw an unconverted price series with a local currency label when FX is missing", () => {
  render(
    <CommodityChart
      history={[
        { turn: 1, price: 100, supply: 50, demand: 60 },
        { turn: 2, price: 101, supply: 55, demand: 60 },
      ]}
      basePrice={100}
      unit="units"
      priceScale={null}
    />
  );
  expect(
    screen.getByText("Price history is unavailable until the currency rate is known.")
  ).toBeTruthy();
  expect(screen.queryByText("Converted price series")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Supply / Demand" }));
  expect(screen.getByText("Physical market series")).toBeTruthy();
});
