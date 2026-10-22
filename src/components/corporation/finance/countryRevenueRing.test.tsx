/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CountryRevenueRing } from "./CountryRevenueRing";

const row = (countryId: string, revenue: number) => ({
  countryId,
  sectorCount: 1,
  revenue,
  freightIncome: 0,
  maintenanceCosts: 0,
  laborCosts: 0,
  freightCosts: 0,
  growthCosts: 0,
  regulatoryBurden: 0,
  federalTax: 0,
  stateTax: 0,
  result: revenue,
});

function swatches(rows: ReturnType<typeof row>[]) {
  const view = render(
    <CountryRevenueRing
      rows={rows}
      countryName={(id) => id}
      money={(n) => `$${n}`}
      signed={(n) => `+$${n}`}
      onSelect={vi.fn()}
    />
  );
  const out = Object.fromEntries(
    rows.map((r) => [
      r.countryId,
      (screen.getByRole("button", { name: r.countryId }).querySelector("span") as HTMLElement).style
        .background,
    ])
  );
  view.unmount();
  return out;
}

describe("CountryRevenueRing colours", () => {
  it("gives every country its own hue from the chart palette", () => {
    const colours = swatches([row("US", 600), row("UK", 200), row("JP", 100), row("DE", 50)]);
    expect(new Set(Object.values(colours)).size).toBe(4);
    for (const c of Object.values(colours)) expect(c).toMatch(/^var\(--corp-cat-[1-6]\)$/);
  });

  it("keeps a country's colour when the revenue ranking changes", () => {
    const before = swatches([row("US", 600), row("UK", 200), row("JP", 100)]);
    const after = swatches([row("JP", 900), row("US", 600), row("UK", 200)]);
    expect(after).toEqual(before);
  });
});

describe("CountryRevenueRing centre", () => {
  it("labels the total as gross revenue, matching the statement line", () => {
    render(
      <CountryRevenueRing
        rows={[row("US", 600), row("UK", 200)]}
        countryName={(id) => id}
        money={(n) => `$${n}`}
        signed={(n) => `+$${n}`}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText("Gross revenue")).toBeTruthy();
    expect(screen.getByText("$800")).toBeTruthy();
  });
});
