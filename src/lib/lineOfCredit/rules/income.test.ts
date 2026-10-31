import { describe, expect, it } from "vitest";
import { incomeWindow, lastEconomyResetTurn } from "./income";

describe("lastEconomyResetTurn", () => {
  it("is null for a world that never had an economy reset", () => {
    expect(lastEconomyResetTurn({ currentTurn: 50, stockHoldingTaxStartTurn: 1 })).toBeNull();
  });

  it("prefers the turn on the marker", () => {
    expect(lastEconomyResetTurn({ economyReset: { turn: 506 }, stockHoldingTaxStartTurn: 1 })).toBe(
      506
    );
  });

  it("falls back to the stock holding tax anchor only once the reset completed", () => {
    expect(
      lastEconomyResetTurn({
        economyReset: { completedAt: new Date() },
        stockHoldingTaxStartTurn: 506,
      })
    ).toBe(506);
    expect(lastEconomyResetTurn({ economyReset: {}, stockHoldingTaxStartTurn: 506 })).toBeNull();
  });
});

describe("incomeWindow", () => {
  it("reads the full window when the reset is older than it", () => {
    expect(incomeWindow({ currentTurn: 600, economyReset: { turn: 506 } }, 48)).toEqual({
      startTurn: 553,
      endTurn: 600,
      observationTurns: 48,
    });
  });

  it("starts the turn after the reset and counts only turns since", () => {
    expect(incomeWindow({ currentTurn: 553, economyReset: { turn: 506 } }, 48)).toEqual({
      startTurn: 507,
      endTurn: 553,
      observationTurns: 47,
    });
  });

  it("observes nothing on the reset turn itself", () => {
    expect(
      incomeWindow({ currentTurn: 506, economyReset: { turn: 506 } }, 48).observationTurns
    ).toBe(0);
  });

  it("keeps the young-world window when there was no reset", () => {
    expect(incomeWindow({ currentTurn: 10 }, 48)).toEqual({
      startTurn: 1,
      endTurn: 10,
      observationTurns: 10,
    });
  });
});
