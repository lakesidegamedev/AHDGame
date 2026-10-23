import { describe, expect, it } from "vitest";
import {
  estimateOneHopFreightTeu,
  estimateSectorFullCapacityOneHopFreightTeu,
  estimateStateFullCapacityOneHopFreightTeu,
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
