import { describe, expect, it } from "vitest";
import { producerStageEnv } from "./producerStageEnv";

describe("producer stage env", () => {
  it("keeps the procurement spill off unless its stage is on", () => {
    expect(producerStageEnv(null).procurementSpillShare).toBe(0);
    expect(producerStageEnv({ producerProcurementSpillShare: 1 }).procurementSpillShare).toBe(0);
    expect(producerStageEnv({ producerProcurementSpillStage: 0 }).procurementSpillShare).toBe(0);
  });

  it("uses the default share when the stage is on and honours an explicit share", () => {
    expect(producerStageEnv({ producerProcurementSpillStage: 1 }).procurementSpillShare).toBe(1);
    expect(
      producerStageEnv({ producerProcurementSpillStage: 1, producerProcurementSpillShare: 0.4 })
        .procurementSpillShare
    ).toBe(0.4);
  });
});

describe("producer stage env shortage growth", () => {
  it("passes the shortage growth stage through and leaves it off by default", () => {
    expect(producerStageEnv(null).shortageGrowthStage).toBeUndefined();
    expect(producerStageEnv({ producerShortageGrowthStage: 1 }).shortageGrowthStage).toBe(1);
  });
});
