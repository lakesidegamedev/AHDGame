import { describe, expect, it } from "vitest";
import { baseMarginRow, baseMarginTable } from "./baseMargins";

/** Variants still under the floor after phase 1, with their known shortfall. */
const KNOWN_BELOW_FLOOR = new Set([
  "healthcare/biotech",
  "construction/infrastructure",
  "defense/munitions",
]);

describe("base-price margins (market recovery phase 1)", () => {
  const rows = baseMarginTable();

  it("covers every operating sector", () => {
    expect(new Set(rows.map((r) => r.sectorType)).size).toBeGreaterThanOrEqual(17);
  });

  it("every standard strategy earns at least 15% at base prices", () => {
    for (const r of rows.filter((x) => x.strategyId === "standard")) {
      expect(r.bareMarginPct, `${r.sectorType}/standard`).toBeGreaterThanOrEqual(15);
    }
  });

  it("no strategy loses money at base prices, and only the listed ones sit under 15%", () => {
    for (const r of rows) {
      const key = `${r.sectorType}/${r.strategyId}`;
      expect(r.bareMarginPct, key).toBeGreaterThan(0);
      if (!KNOWN_BELOW_FLOOR.has(key)) expect(r.bareMarginPct, key).toBeGreaterThanOrEqual(15);
    }
  });

  it("dearer inputs lower the margin and dearer outputs raise it", () => {
    const base = baseMarginRow("manufacturing", "standard")!;
    const dearSteel = baseMarginRow("manufacturing", "standard", {
      priceRatios: { iron: 2, coal: 2, energy: 2 },
    })!;
    expect(dearSteel.bareMarginPct).toBeLessThan(base.bareMarginPct);
    const dearOutput = baseMarginRow("manufacturing", "standard", {
      priceRatios: { steel: 2 },
    })!;
    expect(dearOutput.bareMarginPct).toBeGreaterThan(base.bareMarginPct);
  });

  it("a lower labour share raises the margin by the same points", () => {
    const base = baseMarginRow("healthcare", "standard")!;
    const cheaper = baseMarginRow("healthcare", "standard", { laborShare: { healthcare: 0.2 } })!;
    expect(cheaper.bareMarginPct - base.bareMarginPct).toBeCloseTo(base.labourPct - 20, 5);
  });
});
