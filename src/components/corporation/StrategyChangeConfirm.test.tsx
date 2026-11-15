/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import StrategyChangeConfirm from "./StrategyChangeConfirm";

const world = vi.hoisted(() => ({ preset: "1991-default" }));
vi.mock("@/hooks/useWorldFlags", () => ({ useWorldFlags: () => ({ preset: world.preset }) }));
vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (n: number) => `M${Math.round(n)}`,
    toInternalFrom: (n: number) => n,
  }),
}));
vi.mock("@/lib/observability/fetchJson", () => ({
  fetchJson: () => Promise.resolve({ commodities: [] }),
}));

afterEach(cleanup);

function renderConfirm(props: {
  industryModel?: string | null;
  targetStrategyId: string;
  retoolCostMultiplier?: number;
}) {
  return render(
    <StrategyChangeConfirm
      sectorType="manufacturing"
      industryModel={props.industryModel}
      currentStrategyId="standard"
      targetStrategyId={props.targetStrategyId}
      dailyRevenue={1000}
      retoolCostMultiplier={props.retoolCostMultiplier}
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  );
}

describe("StrategyChangeConfirm operating model", () => {
  it("resolves vehicle plants to the vehicle strategy catalog", () => {
    renderConfirm({ industryModel: "vehicles", targetStrategyId: "ev" });
    expect(screen.getByText(/Switch to/)).toBeTruthy();
  });

  it("does not offer vehicle strategies to an ordinary manufacturing plant", () => {
    const { container } = renderConfirm({ industryModel: null, targetStrategyId: "ev" });
    expect(container.textContent).toBe("");
  });
});

describe("StrategyChangeConfirm sunset discount", () => {
  it("shows the discounted retool fee", () => {
    renderConfirm({ industryModel: "vehicles", targetStrategyId: "ev", retoolCostMultiplier: 0.4 });
    expect(screen.getByText(/Retooling cost/).textContent).toContain("60% off");
  });

  it("shows no discount by default", () => {
    renderConfirm({ industryModel: "vehicles", targetStrategyId: "ev" });
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
    renderConfirm({ industryModel: "vehicles", targetStrategyId: "ev" });
    expect(screen.queryByText(/Downside charge/)).toBeNull();
    expect(screen.getByText(/Phases in/).textContent).not.toContain("while it is built");
  });
});
