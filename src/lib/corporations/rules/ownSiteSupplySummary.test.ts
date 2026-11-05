import { describe, expect, it } from "vitest";
import { ownSiteSupplySummary } from "./ownSiteSupplySummary";

const steel = {
  commodity: "steel",
  producedUnits: 10,
  soldUnits: 2,
  internalDeliveredUnits: 8,
  askingUnitPrice: 5,
};

describe("ownSiteSupplySummary", () => {
  it("sums what each site sent own sites by good, per day, at the ask", () => {
    const s = ownSiteSupplySummary(
      [
        { turn: 10, products: [steel] },
        {
          turn: 10,
          products: [
            { ...steel, internalDeliveredUnits: 4, soldUnits: 6, captiveUnitValue: 7 },
            { commodity: "coal", producedUnits: 3, soldUnits: 3, internalDeliveredUnits: 0 },
          ],
        },
      ],
      11,
      24
    );
    expect(s?.turn).toBe(10);
    expect(s?.rows).toEqual([
      { commodity: "steel", madeUnits: 480, ownSiteUnits: 288, soldUnits: 192, valueAnchor: 1632 },
      { commodity: "coal", madeUnits: 72, ownSiteUnits: 0, soldUnits: 72, valueAnchor: 0 },
    ]);
  });

  it("reads only the latest fresh turn", () => {
    const s = ownSiteSupplySummary(
      [
        { turn: 10, products: [steel] },
        { turn: 9, products: [{ ...steel, internalDeliveredUnits: 999 }] },
        { turn: 3, products: [steel] },
      ],
      10,
      1
    );
    expect(s?.rows).toEqual([
      { commodity: "steel", madeUnits: 10, ownSiteUnits: 8, soldUnits: 2, valueAnchor: 40 },
    ]);
  });

  it("is null without a receipt from last turn", () => {
    expect(ownSiteSupplySummary([{ turn: 5, products: [steel] }, null, undefined], 10, 24)).toBe(
      null
    );
    expect(ownSiteSupplySummary([], 10, 24)).toBeNull();
  });
});
