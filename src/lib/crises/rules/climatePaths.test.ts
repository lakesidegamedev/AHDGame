import { describe, expect, it } from "vitest";
import {
  computeDisasterPenaltySplit,
  disasterProductionFactor,
} from "@/lib/crises/disasterMarginPenalty";
import {
  CLIMATE_REFERENCE_PATHS_2027,
  replayClimatePath,
  WORLD_2027_CLIMATE_PROFILE,
} from "./climateFeedback";
import {
  agricultureYieldLoss,
  climateEffectEntries,
  climateExposureFromTags,
  energyDemandMultiplier,
  uninsuredLossMultiplier,
} from "./climateEffects";

const exposed = climateExposureFromTags(["arid", "hot", "coastal", "flood"]);

function outcomes(path: keyof typeof CLIMATE_REFERENCE_PATHS_2027) {
  const pressure = replayClimatePath(
    CLIMATE_REFERENCE_PATHS_2027[path],
    WORLD_2027_CLIMATE_PROFILE
  );
  const split = computeDisasterPenaltySplit(
    climateEffectEntries(pressure, exposed),
    { sectorType: "agriculture", strategyId: null },
    500,
    true
  );
  return {
    pressure,
    farmOutput: disasterProductionFactor(split.productionPenalty),
    farmYieldLoss: agricultureYieldLoss(pressure, exposed),
    // Household energy demand drives the energy price.
    energyDemand: energyDemandMultiplier(pressure, exposed),
    // Share of a weather disaster's damage that lands on the budget.
    budgetDisasterBurden: uninsuredLossMultiplier(pressure, exposed),
  };
}

describe("fast, central and delayed climate paths reach different outcomes by 2050", () => {
  const fast = outcomes("fast");
  const central = outcomes("central");
  const delayed = outcomes("delayed");

  it("orders pressure fast < central < delayed", () => {
    expect(fast.pressure).toBeLessThan(central.pressure);
    expect(central.pressure).toBeLessThan(delayed.pressure);
  });

  it("orders agriculture: a slower transition leaves farms producing less", () => {
    expect(fast.farmOutput).toBeGreaterThan(central.farmOutput);
    expect(central.farmOutput).toBeGreaterThan(delayed.farmOutput);
    expect(central.farmYieldLoss - fast.farmYieldLoss).toBeGreaterThan(0.01);
    expect(delayed.farmYieldLoss - central.farmYieldLoss).toBeGreaterThan(0.01);
  });

  it("orders energy demand, and so energy price pressure", () => {
    expect(fast.energyDemand).toBeLessThan(central.energyDemand);
    expect(central.energyDemand).toBeLessThan(delayed.energyDemand);
    expect(delayed.energyDemand - fast.energyDemand).toBeGreaterThan(0.02);
  });

  it("orders the budget burden of weather disasters", () => {
    expect(fast.budgetDisasterBurden).toBeLessThan(central.budgetDisasterBurden);
    expect(central.budgetDisasterBurden).toBeLessThan(delayed.budgetDisasterBurden);
    expect(delayed.budgetDisasterBurden - fast.budgetDisasterBurden).toBeGreaterThan(0.1);
  });
});
