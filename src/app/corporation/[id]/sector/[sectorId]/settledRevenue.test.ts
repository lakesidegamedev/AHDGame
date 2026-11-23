import { describe, it, expect } from "vitest";
import { settledSectorRevenuePerTurn } from "./settledRevenue";

describe("settledSectorRevenuePerTurn", () => {
  it("prefers the settled statement over the nameplate", () => {
    expect(
      settledSectorRevenuePerTurn({
        siteStatement: { revenue: 129_600 } as never,
        realizedRevenue: 200_000,
        revenue: 288_000,
      })
    ).toBe(5400);
  });
  it("falls back to realized revenue, then nameplate", () => {
    expect(settledSectorRevenuePerTurn({ realizedRevenue: 48_000, revenue: 288_000 })).toBe(2000);
    expect(settledSectorRevenuePerTurn({ revenue: 288_000 })).toBe(12_000);
  });
});
