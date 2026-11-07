import { describe, expect, it } from "vitest";
import { ownTruckHaulLabel, ownTruckTeuByStateFor } from "./ownTruckHaul";

describe("ownTruckTeuByStateFor", () => {
  const covered = { A: { c1: 12.5, "group:r": 4 }, B: { c2: 9 }, C: { c1: 0 } };

  it("sums the company and group routes per state and drops other owners and zeros", () => {
    expect(ownTruckTeuByStateFor(covered, ["c1", "group:r"])).toEqual({ A: 16.5 });
  });

  it("is empty without a record", () => {
    expect(ownTruckTeuByStateFor(undefined, ["c1"])).toEqual({});
  });
});

describe("ownTruckHaulLabel", () => {
  it("formats TEU with separators", () => {
    expect(ownTruckHaulLabel(1234.4)).toBe("Own trucks hauled 1,234 TEU");
    expect(ownTruckHaulLabel(2.46)).toBe("Own trucks hauled 2.5 TEU");
  });

  it("omits the figure when missing or zero", () => {
    expect(ownTruckHaulLabel(0)).toBeNull();
    expect(ownTruckHaulLabel(null)).toBeNull();
    expect(ownTruckHaulLabel(Number.NaN)).toBeNull();
  });
});
