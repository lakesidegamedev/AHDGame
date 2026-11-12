import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { splitCompensationBySector } from "./compensationSplit";

describe("splitCompensationBySector", () => {
  it("shares the buyout by revenue and the parts add up to the total", () => {
    const a = { _id: new ObjectId(), revenue: 100 };
    const b = { _id: new ObjectId(), revenue: 300 };
    const shares = splitCompensationBySector([a, b], 1_000.01);
    expect(shares.get(a._id.toHexString())).toBe(250);
    expect(shares.get(b._id.toHexString())).toBeCloseTo(750.01, 6);
    expect([...shares.values()].reduce((x, y) => x + y, 0)).toBeCloseTo(1_000.01, 6);
  });

  it("splits evenly when no sector reports revenue", () => {
    const rows = [new ObjectId(), new ObjectId(), new ObjectId()].map((_id) => ({
      _id,
      revenue: 0,
    }));
    const shares = splitCompensationBySector(rows, 300);
    expect([...shares.values()].reduce((x, y) => x + y, 0)).toBeCloseTo(300, 6);
    expect(shares.get(rows[0]!._id.toHexString())).toBe(100);
  });

  it("returns nothing for a seizure or no sectors", () => {
    expect(splitCompensationBySector([{ _id: new ObjectId(), revenue: 5 }], 0).size).toBe(0);
    expect(splitCompensationBySector([], 500).size).toBe(0);
  });
});
