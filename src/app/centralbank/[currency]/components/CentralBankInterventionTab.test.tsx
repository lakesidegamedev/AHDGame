// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CentralBankInterventionTab, type InterventionData } from "./CentralBankInterventionTab";
vi.mock("@/components/forex/ForexSpreadStrengthControl", () => ({
  ForexSpreadStrengthControl: () => null,
}));
afterEach(cleanup);
const pegData = {
  currencyCode: "USD",
  baseRate: 1,
  currentRate: 1,
  fxRegime: "peg",
  policy: {
    floor: 0.5,
    ceiling: 0.5,
    setByCharacterName: null,
    setAtTurn: null,
    lastAdjustedAtTurn: null,
    recentInterventions: [],
  },
  forexRevenue: 0,
  reserveBalance: 0,
} satisfies InterventionData;
it("identifies peg defence and withholds independent band controls even from admin", () => {
  render(
    <CentralBankInterventionTab
      countryId="US"
      data={pegData}
      isChair
      isAdmin
      chairControlsLocked={false}
      currentTurn={50}
      onChanged={vi.fn()}
    />
  );
  expect(screen.getByText("Peg target:")).toBeTruthy();
  expect(screen.getByText(/Currency regime/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /band/i })).toBeNull();
  expect(screen.queryByLabelText("Floor")).toBeNull();
  expect(screen.getByText(/Unknown/)).toBeTruthy();
});
it("retains independent band controls for an ordinary band", () => {
  render(
    <CentralBankInterventionTab
      countryId="US"
      data={{
        ...pegData,
        fxRegime: "band",
        policy: { ...pegData.policy, floor: 0.9, ceiling: 1.1 },
      }}
      isChair
      isAdmin={false}
      chairControlsLocked={false}
      currentTurn={50}
      onChanged={vi.fn()}
    />
  );
  expect(screen.getByRole("button", { name: "Cancel band" })).toBeTruthy();
  expect(screen.getByLabelText("Floor")).toBeTruthy();
});
const data: InterventionData = {
  currencyCode: "GBP",
  currentRate: 1.03,
  baseRate: 1,
  policy: null,
  forexRevenue: 100000,
  reserveBalance: 100000,
  previewContext: {
    rawRate: 1.03,
    organicPressure: 0,
    hardFloor: 0.5,
    hardCeiling: 1.5,
    homeRate: 1,
    marketDepthAnchor: 20000000,
    adherence: 1,
    buyReservesAnchor: 10000000,
    sellReservesAnchor: 200000,
    macroTarget: 1,
    driftAlpha: 0.075,
  },
};
describe("live intervention form", () => {
  it("updates costs while typing, offers presets, and distinguishes usable reserves", () => {
    render(
      <CentralBankInterventionTab
        countryId="UK"
        data={data}
        isChair
        isAdmin={false}
        chairControlsLocked={false}
        currentTurn={100}
        onChanged={() => {}}
      />
    );
    fireEvent.change(screen.getByLabelText("Floor"), { target: { value: "0.99" } });
    fireEvent.change(screen.getByLabelText("Ceiling"), { target: { value: "1" } });
    expect(screen.getByText("GBP 200,000")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Maximum reserve draw/), { target: { value: "1000" } });
    expect(screen.getByText("GBP 1,000")).toBeTruthy();
    expect(screen.getByText(/rate cap or available reserves/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Near fundamentals" }));
    expect((screen.getByLabelText("Floor") as HTMLInputElement).value).toBe("0.98");
    expect(screen.getByText("Usable to support the currency")).toBeTruthy();
    expect(screen.queryByText("Total available")).toBeNull();
  });
  it("does not render private quotes for a public viewer", () => {
    render(
      <CentralBankInterventionTab
        countryId="UK"
        data={{ ...data, previewContext: null, forexRevenue: null, reserveBalance: null }}
        isChair={false}
        isAdmin={false}
        chairControlsLocked={false}
        currentTurn={100}
        onChanged={() => {}}
      />
    );
    expect(screen.queryByLabelText("Intervention estimate")).toBeNull();
  });
});
