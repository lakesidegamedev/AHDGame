// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import RunReport from "./RunReport";
import type { RunReport as RunReportData } from "@/lib/corporations/queries/sectorRunReport";

afterEach(cleanup);

const losing: RunReportData = {
  plannedShare: 0.01,
  madeShare: 0.0098,
  nextShare: 0.01,
  reason: "losing",
  turnsToFull: null,
  cutBy: [],
  unitPrice: 43.49,
  unitMaterials: 72.29,
  unitWages: 17.57,
  unitSite: 7.35,
  ownSiteValued: true,
};

describe("run report card", () => {
  it("says the unit cost includes units made but not sold, and only when some went unsold", () => {
    const base = { ...losing, unitPrice: 6000, unitMaterials: 300, unitWages: 200, unitSite: 100 };
    const props = {
      capacityUnits: 1000,
      producedUnits: 900,
      idleCauses: [],
      sectorType: "healthcare" as const,
    };
    const unsold = render(<RunReport report={{ ...base, unsoldShare: 0.12 }} {...props} />);
    const text = unsold.container.textContent ?? "";
    expect(text).toContain("Each unit sold last turn");
    expect(text).toContain("includes the 12% you made but did not sell");
    cleanup();
    const sold = render(<RunReport report={{ ...base, unsoldShare: 0 }} {...props} />);
    expect(sold.container.textContent ?? "").not.toContain("did not sell");
  });

  it("names a loss-cut mine as losing, shows the unit loss, and leads with the price fix (ticket 1765)", () => {
    const { container } = render(
      <RunReport
        report={losing}
        capacityUnits={10_500}
        producedUnits={103}
        idleCauses={[
          { cause: "losing", units: 10_360 },
          { cause: "staffing", units: 35 },
        ]}
        sectorType="extraction"
      />
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Cut back: losing money");
    expect(text).not.toContain("Stepping back up");
    expect(text).toMatch(/Loses ₳54 a unit/);
    expect(text).toContain("valued at your asking price");
    const fixes = Array.from(container.querySelectorAll("ol li")).map((li) => li.textContent);
    expect(fixes[0]).toContain("The price is below your cost");
    // 35 of 10,500 units is under 1% of capacity: not worth a fix row.
    expect(fixes).toHaveLength(1);
  });

  it("separates this turn's cash stop from a plan kept low by an earlier cash cut (ticket 1767)", () => {
    const { container } = render(
      <RunReport
        report={{
          ...losing,
          reason: "kept-low-after-cut",
          cutBy: ["cash"],
          plannedShare: 0.5,
          nextShare: 0.5,
        }}
        capacityUnits={1000}
        producedUnits={300}
        idleCauses={[
          { cause: "held", units: 500 },
          { cause: "cash", units: 200 },
        ]}
        sectorType="healthcare"
      />
    );
    const fixes = Array.from(container.querySelectorAll("ol li")).map((li) => li.textContent ?? "");
    expect(fixes[0]).toContain("Keep the run funded and it recovers");
    expect(fixes[1]).toContain("Add cash to the company");
  });

  it("forecasts the climb back to a full run when stepping up", () => {
    const { container } = render(
      <RunReport
        report={{
          ...losing,
          reason: "stepping-up",
          plannedShare: 0.4,
          nextShare: 0.46,
          turnsToFull: 7,
          unitPrice: 200,
          unitMaterials: 50,
        }}
        capacityUnits={1000}
        producedUnits={400}
        idleCauses={[{ cause: "ramping", units: 600 }]}
        sectorType="manufacturing"
      />
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Stepping back up");
    expect(text).toContain("full run in about 7 turns");
    expect(text).toMatch(/Earns/);
    expect(container.querySelector("ol")).toBeNull();
  });

  it("uses no dashes in player copy", () => {
    const { container } = render(
      <RunReport
        report={losing}
        capacityUnits={10_500}
        producedUnits={103}
        idleCauses={[
          { cause: "losing", units: 10_360 },
          { cause: "demand", units: 5 },
          { cause: "cash", units: 5 },
          { cause: "inputs", units: 5 },
        ]}
        sectorType="extraction"
      />
    );
    expect(container.textContent).not.toMatch(/[–—]/);
  });
});
