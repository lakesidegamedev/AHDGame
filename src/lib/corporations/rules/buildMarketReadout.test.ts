import { describe, expect, it } from "vitest";
import { buildMarketReadout } from "./buildMarketReadout";

describe("buildMarketReadout", () => {
  it("keeps a product with waiting buyers visible when another product is covered", () => {
    const r = buildMarketReadout(
      [
        {
          commodity: "electronics",
          scope: "national",
          funded: 12_000,
          delivered: 2_000,
          unmet: 10_000,
          capacityUnits: 340,
        },
        {
          commodity: "software",
          scope: "national",
          funded: 6_000,
          delivered: 6_000,
          unmet: 0,
          capacityUnits: 0,
        },
      ],
      10
    );
    expect(r.summary).toBe("some-waiting");
    expect(r.fullMixFacilities).toBe(0);
    expect(r.products.map((p) => [p.commodity, p.verdict, p.facilities])).toEqual([
      ["electronics", "waiting", 34],
      ["software", "covered", 0],
    ]);
  });

  it("reads the full national market, not its regional subset", () => {
    const r = buildMarketReadout(
      [
        {
          commodity: "software",
          scope: "regional",
          funded: 0,
          delivered: 0,
          unmet: 0,
          capacityUnits: 0,
        },
        {
          commodity: "software",
          scope: "national",
          funded: 50,
          delivered: 20,
          unmet: 30,
          capacityUnits: 30,
        },
      ],
      10
    );
    expect(r.products).toHaveLength(1);
    expect(r.products[0]).toMatchObject({
      ordered: 50,
      filled: 20,
      verdict: "waiting",
      facilities: 3,
    });
    expect(r.summary).toBe("all-waiting");
    expect(r.fullMixFacilities).toBe(3);
  });

  it("separates unfilled orders that spare capacity already covers", () => {
    const r = buildMarketReadout(
      [
        {
          commodity: "energy",
          scope: "regional",
          funded: 100,
          delivered: 90,
          unmet: 10,
          capacityUnits: 4,
        },
      ],
      10
    );
    expect(r.products[0].verdict).toBe("idle-covers");
    expect(r.summary).toBe("none-waiting");
  });

  it("never reports a glut from missing measurements", () => {
    const r = buildMarketReadout(
      [
        { commodity: "software", scope: "national", funded: null, delivered: null, unmet: null },
        {
          commodity: "electronics",
          scope: "national",
          funded: 0,
          delivered: 0,
          unmet: 0,
          capacityUnits: 0,
        },
      ],
      10
    );
    expect(r.products.map((p) => p.verdict)).toEqual(["unknown", "no-orders"]);
    expect(r.summary).toBe("none-waiting");
  });

  it("is unknown when nothing is measured", () => {
    const r = buildMarketReadout(
      [{ commodity: "software", scope: "national", funded: null, delivered: null, unmet: null }],
      10
    );
    expect(r.summary).toBe("unknown");
  });

  it("carries the order book scope so the screen can say when figures are national", () => {
    const r = buildMarketReadout(
      [
        {
          commodity: "electronics",
          scope: "national",
          funded: 100,
          delivered: 50,
          unmet: 50,
          capacityUnits: 50,
        },
      ],
      10
    );
    expect(r.products[0].scope).toBe("national");
  });
});
