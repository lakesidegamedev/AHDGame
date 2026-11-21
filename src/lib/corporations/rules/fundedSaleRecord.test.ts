import { describe, expect, it } from "vitest";
import { fundedSaleRecord } from "./fundedSaleRecord";

describe("fundedSaleRecord", () => {
  const settlement = { turn: 108 };

  it("reads the settlement when the legacy fill is from the same turn or older", () => {
    expect(fundedSaleRecord(settlement, 108)).toBe(settlement);
    expect(fundedSaleRecord(settlement, 100)).toBe(settlement);
    expect(fundedSaleRecord(settlement, null)).toBe(settlement);
  });

  it("does not read a settlement older than the legacy fill", () => {
    expect(fundedSaleRecord(settlement, 109)).toBeNull();
  });

  it("reads the latest settlement even when the world has moved on since", () => {
    // No staleness window against the world's turn: the settlement is the
    // latest paid record as long as no newer reading exists.
    expect(fundedSaleRecord({ turn: 108 }, 108)?.turn).toBe(108);
  });

  it("has nothing to read without a settlement", () => {
    expect(fundedSaleRecord(null, 108)).toBeNull();
    expect(fundedSaleRecord(undefined, null)).toBeNull();
    expect(fundedSaleRecord({ turn: Number.NaN }, null)).toBeNull();
  });
});
