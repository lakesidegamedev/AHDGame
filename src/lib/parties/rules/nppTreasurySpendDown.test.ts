import { describe, expect, it } from "vitest";
import {
  NPP_TREASURY_SPEND_SHARE,
  effectivePsInvestmentBudget,
  isNppRunParty,
  nppTreasuryReserve,
} from "./nppTreasurySpendDown";

const rate = 1_000;
const maxPs = 20;
const reserve = nppTreasuryReserve(rate, maxPs);

describe("NPP party treasury spend-down", () => {
  it("treats only unled, AI-founded, live parties as NPP-run", () => {
    expect(isNppRunParty({ createdBy: null, chairId: null, viceChairId: null })).toBe(true);
    expect(isNppRunParty({})).toBe(true);
    expect(isNppRunParty({ createdBy: "player" })).toBe(false);
    expect(isNppRunParty({ chairId: "chair" })).toBe(false);
    expect(isNppRunParty({ viceChairId: "vice" })).toBe(false);
    expect(isNppRunParty({ isDefunct: true })).toBe(false);
  });

  it("keeps the reserve and spends a share of the surplus", () => {
    const base = { party: {}, chairBudget: 0, ratePerPs: rate, maxPsPerTurn: maxPs };
    expect(reserve).toBe(200_000);
    expect(effectivePsInvestmentBudget({ ...base, treasury: reserve })).toBe(0);
    expect(effectivePsInvestmentBudget({ ...base, treasury: reserve + 50_000 })).toBe(
      50_000 * NPP_TREASURY_SPEND_SHARE
    );
  });

  it("leaves a player-led party's budget to its chair", () => {
    expect(
      effectivePsInvestmentBudget({
        party: { chairId: "chair" },
        chairBudget: 3_000,
        treasury: 10_000_000,
        ratePerPs: rate,
        maxPsPerTurn: maxPs,
      })
    ).toBe(3_000);
  });
});
