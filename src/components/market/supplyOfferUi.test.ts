import { describe, expect, it } from "vitest";
import {
  offerPremiumDescription,
  offerPremiumLabel,
  offerUnitPrice,
  takerSideText,
} from "./supplyOfferUi";

describe("offer premium wording", () => {
  it("reads a positive premium as above market, not a fraction of it", () => {
    expect(offerPremiumLabel(0.2)).toBe("+20%");
    expect(offerPremiumDescription(0.2)).toBe("20% above the market price");
    expect(offerPremiumDescription(-0.15)).toBe("15% below the market price");
    expect(offerPremiumDescription(0)).toBe("At the market price");
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
