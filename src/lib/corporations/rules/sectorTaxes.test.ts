import { describe, it, expect } from "vitest";
import { consolidatedTaxScale, recordedSectorTax } from "./sectorTaxes";
describe("shared tax basis", () => {
  it.each([
    [[100, -100], 0],
    [[100, -50], 0.5],
    [[100, 100], 1],
    [[-10, -20], 0],
    [[], 0],
  ] as const)("offsets consolidated results %s", (net, scale) =>
    expect(consolidatedTaxScale(net)).toBe(scale)
  );
  it("reads a recorded assessment without consulting current rates or profit", () => {
    expect(
      recordedSectorTax(
        {
          turn: 10,
          national: 2,
          regional: 1,
          taxableProfit: 10,
          overheadShare: 4,
          nationalRate: 20,
          regionalRate: 10,
        },
        24 * 150
      )
    ).toMatchObject({ turn: 10, federalTax: 7200, stateTax: 3600 });
    expect(recordedSectorTax(undefined, 24)).toBeNull();
  });
});
