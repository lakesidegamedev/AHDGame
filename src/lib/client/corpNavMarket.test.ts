import { describe, expect, it } from "vitest";
import { corpNavMarketFields, withoutSharePrice } from "./corpNavMarket";
import { buildTurnBriefing } from "./turnBriefing";
import { buildWidgetPerTurn } from "./widgetFigures";

const history = [
  { turn: 1, sharePrice: 0.2, marketingStrength: 1, liquidCapital: 10 },
  { turn: 2, sharePrice: 0.21, marketingStrength: 1, liquidCapital: 12 },
];

describe("corpNavMarketFields", () => {
  it("sends a quote and change for a listed corporation", () => {
    const fields = corpNavMarketFields({ sharePrice: 0.21 }, history, true);
    expect(fields).toEqual({ sharePrice: 0.21, priceChange1h: expect.any(Number) });
  });

  it("sends no price field at all for a private corporation", () => {
    const fields = corpNavMarketFields({ sharePrice: 0.21, isPrivate: true }, history, true);
    expect(fields).toEqual({ isPrivate: true });
    expect("sharePrice" in fields).toBe(false);
    expect("priceChange1h" in fields).toBe(false);
  });

  it("strips the price from history rows", () => {
    expect(withoutSharePrice(history[1])).not.toHaveProperty("sharePrice");
  });
});

describe("private corporation briefings", () => {
  it("skips the share price line for a private corporation", () => {
    const rows = [
      { turn: 1, marketingStrength: 1, liquidCapital: 10 },
      { turn: 2, marketingStrength: 1, liquidCapital: 12 },
    ];
    const items = buildTurnBriefing({ sequentialId: 7, isPrivate: true, history: rows }, null);
    expect(items.map((i) => i.label)).toEqual(["Liquid capital"]);
  });

  it("reports no share price change when history carries no price", () => {
    const perTurn = buildWidgetPerTurn({
      corporationHistory: [{ liquidCapital: 1 }, { liquidCapital: 2 }],
    });
    expect(perTurn.sharePrice).toBeNull();
    expect(perTurn.liquidCapital).toBe(1);
  });
});
