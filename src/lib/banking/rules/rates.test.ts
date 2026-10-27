import { describe, expect, it } from "vitest";
import {
  playerDepositRatePercent,
  privateHolderSavingsApyPercent,
  startingBankOffsets,
} from "./rates";

describe("startingBankOffsets", () => {
  it("uses the midpoint of the world's actual legal corridors", () => {
    expect(
      startingBankOffsets({
        deposit: { minOffset: -4, maxOffset: 0.5 },
        lending: { minOffset: 0.25, maxOffset: 8 },
      })
    ).toEqual({ depositOffset: -1.75, lendingOffset: 4.125 });
    expect(
      startingBankOffsets({
        deposit: { minOffset: -4, maxOffset: -0.5 },
        lending: { minOffset: 0.5, maxOffset: 6 },
      })
    ).toEqual({ depositOffset: -2.25, lendingOffset: 3.25 });
  });
});

describe("playerDepositRatePercent", () => {
  // Prime 4, inflation 0: base APY = max(0.5, 4) / 2 = 2.
  it("pays only the over-CB premium for pointer balances", () => {
    expect(playerDepositRatePercent(4, false, 4, 0)).toBe(2);
  });

  it("pays the full posted rate once player balances are cash-backed", () => {
    expect(playerDepositRatePercent(4, true, 4, 0)).toBe(4);
  });

  it("floors at zero when the posted rate sits below base", () => {
    expect(playerDepositRatePercent(0.05, false, 4, 0)).toBe(0);
  });

  it("treats a missing prime as zero prime, keeping the floor", () => {
    // Base = max(0.5, 0 - 0) / 2 = 0.25; 4 - 0.25 = 3.75.
    expect(playerDepositRatePercent(4, false, Number.NaN, 0)).toBeCloseTo(3.75, 10);
  });
});

describe("privateHolderSavingsApyPercent", () => {
  // Prime 20.75, inflation 19.8: base = 0.95 / 2 = 0.475; CB APY with a 0.25 bonus = 0.725.
  it("adds the CB APY to the bank premium for pointer balances", () => {
    expect(privateHolderSavingsApyPercent(19.75, false, 20.75, 19.8, 0.725)).toBeCloseTo(
      19.75 - 0.475 + 0.725,
      10
    );
  });

  it("still earns the CB APY when the posted rate sits below base", () => {
    expect(privateHolderSavingsApyPercent(0.05, false, 4, 0, 2.25)).toBe(2.25);
  });

  it("pays only the posted rate once player balances are cash-backed", () => {
    expect(privateHolderSavingsApyPercent(4, true, 4, 0, 2.25)).toBe(4);
  });
});
