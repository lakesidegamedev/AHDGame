import { describe, expect, it } from "vitest";
import type { CorporateSector } from "@/lib/db/types";
import { analyzeSectorProfitability } from "./sectorProfitability";

const sector = (plantsPnl: Record<string, number>) =>
  ({ revenue: 0, profitMargin: 10, plantsPnl }) as unknown as CorporateSector;

describe("analyzeSectorProfitability with own-site deliveries at market value", () => {
  const mine = sector({ revenue: 0, profit: -300, internalSupplyIncome: 500 });
  const mill = sector({ revenue: 1000, profit: 200, internalSupplyCharge: 500 });

  it("reads a captive-only seller as profitable and the receiver as carrying the charge", () => {
    const [m, s] = analyzeSectorProfitability([mine, mill], true, true);
    expect(m.income).toBe(200);
    expect(m.isProfitable).toBe(true);
    expect(m.margin).toBeCloseTo(40);
    expect(s.income).toBe(-300);
    expect(s.marginCategory).toBe("loss");
  });

  it("is unchanged below stage 3", () => {
    const [m, s] = analyzeSectorProfitability([mine, mill], true);
    expect(m.income).toBe(-300);
    expect(m.isProfitable).toBe(false);
    expect(s.income).toBe(200);
  });
});
