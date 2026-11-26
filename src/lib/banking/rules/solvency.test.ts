import { describe, expect, it } from "vitest";
import { INSOLVENCY_CURE_TURNS, depositTakerVerdict, type DepositTakerVerdict } from "./solvency";

type VerdictInput = Omit<Parameters<typeof depositTakerVerdict>[0], "turn"> & { turn?: number };
const depositTakerFails = (input: VerdictInput): boolean =>
  depositTakerVerdict({ turn: 1, ...input }).outcome === "fail";
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

describe("balance-sheet insolvency cure window (ticket 1910)", () => {
  // Greenbaum Group, turn 229: green, capital ratio 1.58, CA$155M cash and
  // CA$505M of marked bills against CA$880M of deposits and a CA$45M central
  // bank advance. Marked assets fell CA$27M short of what it owed.
  const greenbaum = {
    priorBand: "green" as const,
    cashReserves: 155_152_127,
    liquidSecurities: 505_071_478,
    requiredLiquidity: 88_005_635,
    netAssets: -26_986_876,
    owed: 925_191_401,
  };

  it("warns a liquid bank with a shallow hole instead of closing it", () => {
    const verdict = depositTakerVerdict({ ...greenbaum, turn: 229 });
    expect(verdict).toEqual<DepositTakerVerdict>({
      outcome: "cure",
      insolventSinceTurn: 229,
      deadlineTurn: 229 + INSOLVENCY_CURE_TURNS,
      deficit: 26_986_876,
    });
  });

  it("keeps the original clock and resolves the bank at the deadline", () => {
    const opened = { ...greenbaum, insolventSinceTurn: 229 };
    expect(depositTakerVerdict({ ...opened, turn: 231 }).outcome).toBe("cure");
    expect(depositTakerVerdict({ ...opened, turn: 229 + INSOLVENCY_CURE_TURNS })).toEqual({
      outcome: "fail",
      reason: "insolvent",
    });
  });

  it("clears once equity is back", () => {
    expect(
      depositTakerVerdict({ ...greenbaum, netAssets: 1, insolventSinceTurn: 229, turn: 230 })
    ).toEqual({ outcome: "sound" });
  });

  it("still resolves a deep hole, an illiquid bank, or a caller that does not say what is owed", () => {
    expect(depositTakerFails({ ...greenbaum, netAssets: -0.06 * greenbaum.owed })).toBe(true);
    expect(depositTakerFails({ ...greenbaum, cashReserves: 0, liquidSecurities: 80_000_000 })).toBe(
      true
    );
    expect(depositTakerFails({ ...greenbaum, owed: undefined })).toBe(true);
  });

  it("a red bank below the run line fails at once even inside a cure window", () => {
    expect(
      depositTakerVerdict({
        ...greenbaum,
        priorBand: "red",
        cashReserves: 0,
        liquidSecurities: 0,
        insolventSinceTurn: 229,
        turn: 230,
      })
    ).toEqual({ outcome: "fail", reason: "run" });
  });
});
