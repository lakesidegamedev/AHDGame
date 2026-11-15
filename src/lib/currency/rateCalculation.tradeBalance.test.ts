/**
 * A background country's funded-trade balance moves its currency's macro
 * target (#5702): a surplus strengthens it (lower local-per-unit rate), a
 * deficit weakens it, with or without a full economic baseline.
 */
import { describe, expect, it } from "vitest";
import { computeMacroTarget } from "./rateCalculation";
import { extractMacroInputs } from "@/lib/turn/forexTurn";
import { TRADE_BALANCE_SENSITIVITY } from "@/lib/constants/currencies";
import type { CentralBank } from "@/lib/db/types/centralBank";

const neutral = { primeRate: 0, inflationRate: 0, gdpGrowth: 0, tradeGrowth: 0 };

describe("trade-balance pressure on the FX macro target", () => {
  it("moves a currency with no economic baseline (SE)", () => {
    const flat = computeMacroTarget(10, neutral, "SE", 2027);
    const surplus = computeMacroTarget(10, { ...neutral, tradeBalancePressure: 0.5 }, "SE", 2027);
    const deficit = computeMacroTarget(10, { ...neutral, tradeBalancePressure: -0.5 }, "SE", 2027);
    expect(surplus).toBeLessThan(flat);
    expect(deficit).toBeGreaterThan(flat);
    expect(flat - surplus).toBeCloseTo(10 * 0.5 * TRADE_BALANCE_SENSITIVITY, 9);
  });

  it("moves a fully modelled currency (BR) by the same amount", () => {
    const inputs = { primeRate: 10, inflationRate: 4, gdpGrowth: 2, tradeGrowth: 2 };
    const flat = computeMacroTarget(5, inputs, "BR", 2027);
    const surplus = computeMacroTarget(5, { ...inputs, tradeBalancePressure: 0.25 }, "BR", 2027);
    expect(flat - surplus).toBeCloseTo(5 * 0.25 * TRADE_BALANCE_SENSITIVITY, 9);
  });

  it("is read off the central bank only where the kernel wrote it", () => {
    const bank = { primeRate: 3, tradeGrowth: 1 } as unknown as CentralBank;
    expect(extractMacroInputs(bank)).not.toHaveProperty("tradeBalancePressure");
    expect(
      extractMacroInputs({ ...bank, backgroundTradePressure: -0.2 } as CentralBank)
        .tradeBalancePressure
    ).toBe(-0.2);
  });
});
