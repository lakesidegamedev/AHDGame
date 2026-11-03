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

describe("producer stage env national public demand", () => {
  it("passes the national public demand stage through and leaves it off by default", () => {
    expect(producerStageEnv(null).nationalPublicDemandStage).toBeUndefined();
    expect(
      producerStageEnv({ producerNationalPublicDemandStage: 1 }).nationalPublicDemandStage
    ).toBe(1);
  });
});

describe("producer stage env wage share", () => {
  it("keeps the wage share off unless its stage is on", () => {
    expect(producerStageEnv(null).wageShareTarget).toBe(0);
    expect(producerStageEnv({ producerWageShareTarget: 0.5 }).wageShareTarget).toBe(0);
  });

  it("uses the default target when the stage is on and honours explicit settings", () => {
    expect(producerStageEnv({ producerWageShareStage: 1 }).wageShareTarget).toBe(0.6);
    expect(producerStageEnv({ producerWageShareStage: 1 }).wageShareSurplusCap).toBe(0.75);
    const set = producerStageEnv({
      producerWageShareStage: 1,
      producerWageShareTarget: 0.5,
      producerWageShareSurplusCap: 0.4,
    });
    expect(set.wageShareTarget).toBe(0.5);
    expect(set.wageShareSurplusCap).toBe(0.4);
  });
});
