import { describe, expect, it } from "vitest";
import { producerInputBidLimit } from "./inputBidRules";

describe("producer input buying headroom", () => {
  it.each([undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 80])(
    "keeps reference headroom when the clearing price is absent or lower (%s)",
    (clearingUnitPrice) => {
      expect(
        producerInputBidLimit({ referenceUnitPrice: 100, headroom: 1.25, clearingUnitPrice })
      ).toBe(125);
    }
  );

  it("does not strand a buyer just above yesterday's clearing price", () => {
    const bid = producerInputBidLimit({
      referenceUnitPrice: 100,
      headroom: 1.25,
      clearingUnitPrice: 150,
    });
    expect(bid).toBe(187.5);
    expect(bid).toBeGreaterThan(151);
  });

  it("caps clearing-based bids against the independent reference", () => {
    expect(
      producerInputBidLimit({ referenceUnitPrice: 100, headroom: 1.25, clearingUnitPrice: 1000 })
    ).toBe(300);
  });

  it("keeps no extra markup when configured with no headroom", () => {
    expect(
      producerInputBidLimit({ referenceUnitPrice: 100, headroom: 1, clearingUnitPrice: 150 })
    ).toBe(150);
  });
});
