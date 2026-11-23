import { describe, expect, it } from "vitest";
import { perShareFigure } from "./keyStatisticsModel";

describe("perShareFigure", () => {
  it("states the quote for a listed corporation", () => {
    const f = perShareFigure({
      isPrivate: false,
      sharePrice: 4.2,
      bookValue: 100,
      totalShares: 10,
    });
    expect(f).toMatchObject({ label: "Share price", amount: 4.2 });
  });

  it("states book value per share for a private corporation", () => {
    const f = perShareFigure({
      isPrivate: true,
      sharePrice: 0.21,
      bookValue: 150,
      totalShares: 1000,
    });
    expect(f.label).toBe("Book value / share");
    expect(f.amount).toBeCloseTo(0.15, 10);
  });

  it("has no amount for a private corporation without a book value", () => {
    expect(
      perShareFigure({ isPrivate: true, sharePrice: 0.21, bookValue: null, totalShares: 1000 })
        .amount
    ).toBeNull();
  });
});
