import { describe, expect, it } from "vitest";
import {
  estimateOneHopFreightTeu,
  estimateSectorFullCapacityOneHopFreightTeu,
  estimateStateFullCapacityOneHopFreightTeu,
  freightLoadStatus,
} from "./freightVisibility";

describe("freight visibility estimates", () => {
  it("uses canonical bulk and special TEU per hop and ignores local-only output", () => {
    expect(
      estimateOneHopFreightTeu({
        coal: 100,
        vehicles: 10,
        energy: 50,
        freight: 20,
      })
    ).toBeCloseTo(5.2);
  });

  it("scales the observed mix to installed capacity for one owned sector", () => {
    expect(
      estimateSectorFullCapacityOneHopFreightTeu({
        stateId: "CA",
        producedUnits: 40,
        capacityUnits: 100,
        outputByCommodity: { coal: 40, vehicles: 10 },
      })
    ).toBeCloseTo(7);
  });

  it("adds unowned state output to full-capacity corporate estimates without mixing states", () => {
    expect(
      estimateStateFullCapacityOneHopFreightTeu({
        sectors: [
          {
            stateId: "CA",
            producedUnits: 50,
            capacityUnits: 100,
            outputByCommodity: { coal: 50 },
          },
        ],
        corporateOutputByState: { CA: { coal: 50 } },
        stateOutputByCommodity: { CA: { coal: 100, vehicles: 10 }, NY: { steel: 25 } },
      })
    ).toEqual({ CA: 7.2, NY: 1 });
  });

  it("is exactly zero for grid-delivered output so the screen can say so", () => {
    expect(
      estimateSectorFullCapacityOneHopFreightTeu({
        stateId: "NH",
        producedUnits: 40,
        capacityUnits: 100,
        outputByCommodity: { energy: 40 },
      })
    ).toBe(0);
  });

  it("returns no owned estimate before a plant has measured a positive run", () => {
    expect(
      estimateSectorFullCapacityOneHopFreightTeu({
        stateId: "CA",
        producedUnits: 0,
        capacityUnits: 100,
        outputByCommodity: {},
      })
    ).toBeNull();
  });
});

describe("freightLoadStatus", () => {
  it("is normal up to capacity", () => {
    expect(freightLoadStatus(81, 81).status).toBe("normal");
  });
  it("is congested past capacity and below the overflow limit", () => {
    const s = freightLoadStatus(100, 81);
    expect(s.status).toBe("congested");
    expect(s.limit).toBeCloseTo(121.5);
    expect(s.surcharge).toBe(0.35);
  });
  it("is blocked at the overflow limit (122 of 81 TEU)", () => {
    const s = freightLoadStatus(122, 81);
    expect(s.status).toBe("blocked");
    expect(Math.round((s.share ?? 0) * 100)).toBe(151);
  });
  it("treats any load on a zero-capacity state as blocked", () => {
    expect(freightLoadStatus(5, 0).status).toBe("blocked");
    expect(freightLoadStatus(0, 0).status).toBe("normal");
  });
});
