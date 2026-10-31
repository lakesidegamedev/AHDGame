import { describe, expect, it } from "vitest";
import { ownSiteDeliveries, ownSiteLabel } from "./ownSiteDeliveries";

const product = (over: Record<string, unknown> = {}) => ({
  commodity: "steel",
  producedUnits: 360,
  internalDeliveredUnits: 360,
  askingUnitPrice: 200,
  ...over,
});

describe("ownSiteDeliveries", () => {
  it("reports a fully captive plant at its asking value", () => {
    const r = ownSiteDeliveries({ turn: 10, products: [product()] }, 11);
    expect(r).toMatchObject({ share: 1, units: 360, valueAnchor: 72000 });
    expect(r?.products[0]).toMatchObject({ commodity: "steel", share: 1, units: 360 });
  });

  it("splits a mixed plant per output", () => {
    const r = ownSiteDeliveries(
      {
        turn: 10,
        products: [product(), product({ commodity: "coal", internalDeliveredUnits: 0 })],
      },
      10
    );
    expect(r?.share).toBeCloseTo(0.5);
    expect(r?.products).toHaveLength(1);
  });

  it("is null with no internal deliveries, a stale receipt, or no receipt", () => {
    expect(
      ownSiteDeliveries({ turn: 10, products: [product({ internalDeliveredUnits: 0 })] }, 10)
    ).toBeNull();
    expect(ownSiteDeliveries({ turn: 5, products: [product()] }, 10)).toBeNull();
    expect(ownSiteDeliveries(undefined, 10)).toBeNull();
  });

  it("ignores junk numbers", () => {
    const r = ownSiteDeliveries(
      { turn: 1, products: [product({ internalDeliveredUnits: Number.NaN })] },
      1
    );
    expect(r).toBeNull();
  });
});

describe("ownSiteLabel", () => {
  it("formats the share", () => {
    expect(ownSiteLabel(1)).toBe("100% to your sites");
    expect(ownSiteLabel(0.404)).toBe("40% to your sites");
    expect(ownSiteLabel(0.001)).toBe("<1% to your sites");
  });
  it("is null when nothing went to own sites", () => {
    expect(ownSiteLabel(0)).toBeNull();
    expect(ownSiteLabel(null)).toBeNull();
  });
});
