// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TopProducersConsumers, {
  governmentDemandNote,
  unlistedDemand,
} from "./TopProducersConsumers";

const otherDemand = {
  name: "Other demand (including marketing)",
  type: "system" as const,
  units: 80,
  description: "Global residual, not per-company marketing attribution.",
};

afterEach(cleanup);

describe("advertising consumer display", () => {
  it("shows the residual even when there are no plant consumers", () => {
    render(
      <TopProducersConsumers
        topProducers={[]}
        topConsumers={[]}
        syntheticDemandSources={[otherDemand]}
        unit="campaigns"
        commodity="advertising"
      />
    );

    expect(screen.getByText(otherDemand.name)).toBeTruthy();
    expect(screen.getByText("80 campaigns")).toBeTruthy();
  });

  it("preserves plant-only consumer volumes without promising separate local marketing totals", () => {
    render(
      <TopProducersConsumers
        topProducers={[]}
        topConsumers={[{ corpId: "retailer", name: "Retailer", units: 20 }]}
        syntheticDemandSources={[]}
        unit="campaigns"
        commodity="advertising"
        marketLabel="UK Market"
      />
    );

    expect(screen.getByText("20 campaigns")).toBeTruthy();
    expect(screen.getByText(/plant inputs only; excludes marketing budgets/)).toBeTruthy();
    expect(screen.queryByText(/shown separately/)).toBeNull();
    expect(screen.queryByText(otherDemand.name)).toBeNull();
  });
});

describe("marketing budget list", () => {
  it("renders and paginates budgets independently of plant demand", () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      corpId: String(i),
      name: "Advertiser " + i,
      sequentialId: 100 + i,
      dailyBudgetAnchor: 1000 - i,
    }));
    const { rerender } = render(
      <TopProducersConsumers
        topProducers={[]}
        topConsumers={[]}
        syntheticDemandSources={[]}
        unit="campaigns"
        commodity="advertising"
        marketingBudgets={rows}
        marketLabel="UK Market"
      />
    );
    expect(screen.getByText("Marketing budgets by company")).toBeTruthy();
    expect(screen.getByText(/configured daily budgets/i)).toBeTruthy();
    expect(screen.getByText(/not settled spending or recorded demand/i)).toBeTruthy();
    expect(screen.getByText(/funding and delivery/i)).toBeTruthy();
    expect(screen.getByText(/headquarters/i)).toBeTruthy();
    expect(screen.getByText("Advertiser 0").closest("a")?.getAttribute("href")).toBe(
      "/corporation/100"
    );
    expect(screen.getByText("₳1,000/day")).toBeTruthy();
    expect(screen.queryByText("Advertiser 10")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByText("Advertiser 10")).toBeTruthy();
    expect(screen.queryByText("Advertiser 0")).toBeNull();
    // Scope changes reset pagination without hiding the only result.
    rerender(
      <TopProducersConsumers
        topProducers={[]}
        topConsumers={[]}
        syntheticDemandSources={[]}
        unit="campaigns"
        commodity="advertising"
        marketingBudgets={rows.slice(0, 1)}
        marketLabel="US Market"
      />
    );
    expect(screen.getByText("Advertiser 0")).toBeTruthy();
  });
  it("shows an empty message only for a loaded advertising budget list", () => {
    const { rerender } = render(
      <TopProducersConsumers
        topProducers={[]}
        topConsumers={[]}
        syntheticDemandSources={[]}
        unit="campaigns"
        commodity="advertising"
        marketingBudgets={[]}
      />
    );
    expect(screen.getByText(/No companies with positive marketing budgets/)).toBeTruthy();
    rerender(
      <TopProducersConsumers
        topProducers={[]}
        topConsumers={[]}
        syntheticDemandSources={[]}
        unit="tonnes"
        commodity="steel"
        marketingBudgets={[]}
      />
    );
    expect(screen.queryByText("Marketing budgets by company")).toBeNull();
  });
});

describe("producer list basis caption", () => {
  const producer = { corpId: "miner", name: "Miner One", units: 1200 };

  function renderProducers(commodity: string) {
    render(
      <TopProducersConsumers
        topProducers={[producer]}
        topConsumers={[]}
        syntheticDemandSources={[]}
        unit="tonnes"
        commodity={commodity}
      />
    );
  }

  it("says mining figures are capacity, not dug output", () => {
    renderProducers("iron");
    expect(screen.getByText(/production capacity, not dug output/i)).toBeTruthy();
  });

  it("keeps the output-volume caption for manufactured goods", () => {
    renderProducers("steel");
    expect(screen.getByText(/Largest corporations by output volume/i)).toBeTruthy();
  });
});

describe("buyer fill notes", () => {
  const households = { ...otherDemand, name: "Households", units: 100, receivedUnits: 67 };
  const government = {
    ...otherDemand,
    name: "Government procurement",
    units: 100,
    receivedUnits: 59,
  };

  it("reconciles received units against supply and explains a short market", () => {
    render(
      <TopProducersConsumers
        topProducers={[]}
        topConsumers={[]}
        syntheticDemandSources={[households, government]}
        unit="visits"
        commodity="healthcare_services"
        marketSupply={130}
      />
    );
    expect(screen.getByText(/ordered 200 visits and received 126 visits/)).toBeTruthy();
    expect(screen.getByText(/The rest of the 130 visits supplied/)).toBeTruthy();
    expect(screen.getByText(/When supply is short, company plant orders/)).toBeTruthy();
  });

  it("skips the note when no buyer records received units", () => {
    render(
      <TopProducersConsumers
        topProducers={[]}
        topConsumers={[]}
        syntheticDemandSources={[otherDemand]}
        unit="visits"
        commodity="healthcare_services"
      />
    );
    expect(screen.queryByText(/These buyers ordered/)).toBeNull();
  });
});

describe("unlistedDemand", () => {
  const funded = [
    { name: "Households", type: "system" as const, units: 30, receivedUnits: 20, description: "" },
  ];
  it("returns the remainder so listed buyers sum to recorded demand", () => {
    expect(unlistedDemand(100, [{ units: 50 }], funded)).toEqual({ unlisted: 20, over: 0 });
  });
  it("reports overshoot instead of hiding it", () => {
    expect(unlistedDemand(60, [{ units: 50 }], funded)).toEqual({ unlisted: 0, over: 20 });
  });
  it("stays silent without recorded buyer orders", () => {
    expect(
      unlistedDemand(100, [{ units: 50 }], [{ ...funded[0], receivedUnits: undefined }])
    ).toBeNull();
  });
});

describe("government demand note", () => {
  it("says governments do not buy a good that is not in the demand table", () => {
    expect(governmentDemandNote("steel")).toMatch(/^Governments do not buy this good\./);
    expect(governmentDemandNote("steel")).toContain("healthcare services");
    expect(governmentDemandNote("steel")).toContain("ordnance");
    expect(governmentDemandNote("steel")).toContain("advertising & media (planned economies only)");
    expect(governmentDemandNote("ordnance")).toBeNull();
    expect(governmentDemandNote("advertising")).toBeNull();
  });

  it("renders under Top consumers", () => {
    render(
      <TopProducersConsumers
        topProducers={[]}
        topConsumers={[]}
        syntheticDemandSources={[otherDemand]}
        unit="tons"
        commodity="steel"
      />
    );
    expect(screen.getByText(/Governments do not buy this good/)).toBeTruthy();
  });
});
