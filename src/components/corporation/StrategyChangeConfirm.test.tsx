/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import StrategyChangeConfirm from "./StrategyChangeConfirm";

const world = vi.hoisted(() => ({ preset: "1991-default" }));
vi.mock("@/hooks/useWorldFlags", () => ({ useWorldFlags: () => ({ preset: world.preset }) }));
vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (n: number) => `M${Math.round(n)}`,
    toInternalFrom: (n: number) => n,
  }),
}));
const requests = vi.hoisted(() => ({ quote: null as unknown }));
vi.mock("@/lib/observability/fetchJson", () => ({
  fetchJson: (url: string) =>
    Promise.resolve(
      url === "/api/commodities"
        ? { commodities: [] }
        : {
            strategy: {
              availableStrategies: requests.quote
                ? [{ id: "vehicle_assembly", ...(requests.quote as object) }]
                : [],
            },
          }
    ),
}));

afterEach(cleanup);

function renderConfirm(props: { targetStrategyId: string; retoolCostMultiplier?: number }) {
  return render(
    <StrategyChangeConfirm
      sectorType="manufacturing"
      currentStrategyId="standard"
      targetStrategyId={props.targetStrategyId}
      quote={{
        retoolCost:
          props.targetStrategyId === "humanoid_robotics"
            ? 550
            : 250 * (props.retoolCostMultiplier ?? 1),
        baseRetoolCost: 250 * (props.retoolCostMultiplier ?? 1),
        downsideCharge: props.targetStrategyId === "humanoid_robotics" ? 300 : 0,
        foreignSpread: 0,
        retoolCostMultiplier: props.retoolCostMultiplier ?? 1,
        freeConversion: false,
        shortageDiscount: false,
        transitionTurns: 36,
      }}
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  );
}

describe("StrategyChangeConfirm sunset discount", () => {
  it("shows the discounted retool fee", () => {
    renderConfirm({ targetStrategyId: "vehicle_assembly", retoolCostMultiplier: 0.4 });
    expect(screen.getByText(/Retooling cost/).textContent).toContain("60% off");
  });

  it("shows no discount by default", () => {
    renderConfirm({ targetStrategyId: "vehicle_assembly" });
    expect(screen.getByText(/Retooling cost/).textContent).not.toContain("off");
  });
});

describe("StrategyChangeConfirm build time and downside", () => {
  afterEach(() => {
    world.preset = "1991-default";
  });

  it("adds the downside charge to the fee and says how long the build takes", () => {
    world.preset = "2027-default";
    renderConfirm({ targetStrategyId: "humanoid_robotics" });
    // 25% retool fee plus the 30% downside charge on 1000 of daily revenue.
    expect(screen.getByText(/Retooling cost/).textContent).toContain("M550");
    expect(screen.getByText(/Downside charge/).textContent).toContain("M300");
    expect(screen.getByText(/Phases in/).textContent).toContain("for 108 turns while it is built");
  });

  it("shows neither for a method without a build time", () => {
    renderConfirm({ targetStrategyId: "vehicle_assembly" });
    expect(screen.queryByText(/Downside charge/)).toBeNull();
    expect(screen.getByText(/Phases in/).textContent).not.toContain("while it is built");
  });
});

describe("authoritative retool quote", () => {
  it("shows the quoted total and charges rather than rebuilding them from sector revenue", () => {
    render(
      <StrategyChangeConfirm
        sectorType="manufacturing"
        currentStrategyId="standard"
        targetStrategyId="vehicle_assembly"
        quote={{
          retoolCost: 123,
          baseRetoolCost: 100,
          downsideCharge: 20,
          foreignSpread: 3,
          retoolCostMultiplier: 1,
          freeConversion: false,
          shortageDiscount: false,
          transitionTurns: 36,
        }}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText(/Retooling cost/).textContent).toContain("M123");
    expect(screen.getByText(/Downside charge/).textContent).toContain("M20");
    expect(screen.getByText(/Currency conversion charge/).textContent).toContain("M3");
  });
  it("does not permit switching while the current quote is unavailable", () => {
    render(
      <StrategyChangeConfirm
        sectorType="manufacturing"
        currentStrategyId="standard"
        targetStrategyId="vehicle_assembly"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(
      (screen.getByRole("button", { name: "Switch strategy" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.queryByText(/Retooling cost/)).toBeNull();
  });
});

it("loads the method's server quote before enabling the paid confirmation", async () => {
  requests.quote = {
    retoolCost: 12,
    baseRetoolCost: 0,
    downsideCharge: 10,
    foreignSpread: 2,
    retoolCostMultiplier: 1,
    freeConversion: false,
    shortageDiscount: true,
    transitionTurns: 18,
  };
  render(
    <StrategyChangeConfirm
      sectorType="manufacturing"
      currentStrategyId="standard"
      targetStrategyId="vehicle_assembly"
      quoteUrl="/api/corporations/synthetic/sectors/synthetic"
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  );
  expect(
    (screen.getByRole("button", { name: "Switch strategy" }) as HTMLButtonElement).disabled
  ).toBe(true);
  await waitFor(() => expect(screen.getByText(/Retooling cost/).textContent).toContain("M12"));
  expect(
    (screen.getByRole("button", { name: "Switch strategy" }) as HTMLButtonElement).disabled
  ).toBe(false);
  expect(screen.getByText(/Phases in/).textContent).toContain("over 18 turns");
  requests.quote = null;
});
