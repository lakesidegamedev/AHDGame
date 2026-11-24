import { describe, expect, it } from "vitest";
import {
  offerPremiumDescription,
  offerPremiumLabel,
  offerUnitPrice,
  takerSideText,
} from "./supplyOfferUi";

describe("offer premium wording", () => {
  it("reads a positive premium as above market, not a fraction of it", () => {
    expect(offerPremiumLabel(0.2)).toBe("Market +20%");
    expect(offerPremiumDescription(0.2)).toBe("Market price plus 20%");
    expect(offerPremiumDescription(-0.15)).toBe("Market price minus 15%");
    expect(offerPremiumDescription(0)).toBe("Market price");
  });

  it("prices one unit from the market price and premium", () => {
    expect(offerUnitPrice(0.2, 5000)).toBe(6000);
    expect(offerUnitPrice(0.2, undefined)).toBeNull();
  });
});

describe("offer side wording", () => {
  it("names the side the taker ends up on, not the poster's", () => {
    expect(takerSideText("sell")).toBe("You buy");
    expect(takerSideText("buy")).toBe("You sell");
  });
});
