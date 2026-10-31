import { describe, expect, it } from "vitest";
import { depositTakerFails } from "./solvency";
describe("deposit-taker insolvency", () => {
  it("resolves exhausted equity even when loan write-off improves the confidence denominator", () => {
    expect(
      depositTakerFails({
        priorBand: "green",
        cashReserves: 9_000_000,
        requiredLiquidity: 1_500_000,
        netAssets: -1_000_000,
      })
    ).toBe(true);
  });
  it("does not confuse illiquid but solvent securities with an exhausted estate", () => {
    expect(
      depositTakerFails({
        priorBand: "green",
        cashReserves: 1_000_000,
        requiredLiquidity: 1_500_000,
        netAssets: 5_000_000,
      })
    ).toBe(false);
    expect(
      depositTakerFails({
        priorBand: "green",
        cashReserves: 1,
        requiredLiquidity: 1,
        netAssets: -0.000001,
      })
    ).toBe(false);
    expect(
      depositTakerFails({
        priorBand: "red",
        cashReserves: 0,
        requiredLiquidity: 1_500_000,
        netAssets: 5_000_000,
      })
    ).toBe(true);
  });
  it("meets a run from sovereign treasuries when the vault is empty (incident 1694)", () => {
    // Greenbaum Group, turn 438: flight emptied a $1.3B vault while the bank
    // held $15.8B of marked treasuries and positive equity.
    const greenbaum = {
      priorBand: "red" as const,
      cashReserves: 0,
      requiredLiquidity: 3_000_000_000,
      netAssets: 3_000_000_000,
    };
    expect(depositTakerFails(greenbaum)).toBe(true);
    expect(depositTakerFails({ ...greenbaum, liquidSecurities: 15_800_000_000 })).toBe(false);
    expect(depositTakerFails({ ...greenbaum, liquidSecurities: 1_000_000_000 })).toBe(true);
  });
});
