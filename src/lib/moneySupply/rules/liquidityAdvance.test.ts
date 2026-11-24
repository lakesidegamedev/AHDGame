import { describe, expect, it } from "vitest";
import {
  LIQUIDITY_ADVANCE_MAX_DEPOSIT_FRACTION,
  allocateLiquidityAdvance,
  liquidityAdvanceHeadroom,
} from "./liquidityAdvance";

describe("liquidity advance allocation", () => {
  it("keeps the deposit-weighted split when no cap binds", () => {
    expect(allocateLiquidityAdvance(400, [{ deposits: 9_000 }, { deposits: 3_000 }])).toEqual([
      300, 100,
    ]);
  });

  it("caps each bank at a fraction of its own deposits", () => {
    // The live case: a GDP-sized 9.03B advance over three banks with about
    // 573M of deposits between them. One bank's share was 6.36B, about fifteen
    // times its 403.5M of deposits.
    const deposits = [85_870_350, 71_285_569, 403_462_516];
    const shares = allocateLiquidityAdvance(
      9_028_915_309,
      deposits.map((d) => ({ deposits: d }))
    );
    shares.forEach((share, index) => {
      expect(share).toBeLessThanOrEqual(deposits[index] * LIQUIDITY_ADVANCE_MAX_DEPOSIT_FRACTION);
      expect(share).toBe(Math.floor(deposits[index] * LIQUIDITY_ADVANCE_MAX_DEPOSIT_FRACTION));
    });
  });

  it("counts advances already carried against the cap, so repeats do not stack", () => {
    expect(liquidityAdvanceHeadroom({ deposits: 1_000, outstandingAdvance: 60 })).toBe(40);
    expect(liquidityAdvanceHeadroom({ deposits: 1_000, outstandingAdvance: 5_000 })).toBe(0);
    expect(
      allocateLiquidityAdvance(10_000, [
        { deposits: 1_000, outstandingAdvance: 100 },
        { deposits: 1_000, outstandingAdvance: 30 },
      ])
    ).toEqual([0, 70]);
  });

  it("gives nothing to banks without deposits instead of splitting the amount evenly", () => {
    expect(allocateLiquidityAdvance(9_000, [{ deposits: 0 }, { deposits: 0 }])).toEqual([0, 0]);
  });
});
