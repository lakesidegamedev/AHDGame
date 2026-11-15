import { describe, expect, it } from "vitest";
import { NEUTRAL_TECH_EFFECTS } from "@/lib/constants/techTree";
import {
  foldTransitionPolicies,
  renewablesReliabilityEntry,
  sectorVintageYear,
  summarisePowerFleet,
  withEnergyTransition,
} from "./policies";
import { computeDisasterPenaltySplit } from "@/lib/crises/disasterMarginPenalty";
import { depositProspectCostMultiplier } from "./prospecting";
import { DEPOSIT_RESERVE_TURNS } from "@/lib/extraction/depletion";

describe("foldTransitionPolicies", () => {
  it("reads both law books into one policy per country", () => {
    const policies = foldTransitionPolicies([
      { legislationTypeId: "us.sec.carbonPrice", policyOptionIndex: 3, scope: "national" },
      { legislationTypeId: "uk.sec.coalPhaseOut", policyOptionIndex: 4, scope: "national" },
      { legislationTypeId: "uk.sec.criticalMineralsStockpile", policyOptionIndex: 4 },
      // Legacy ladder: index 0 is the strongest reform, index 3 no statute.
      { legislationTypeId: "ie_carbon_price", policyOptionIndex: 1, scope: "national" },
      { legislationTypeId: "ie_clean_power_standard", policyOptionIndex: 5, scope: "national" },
      { legislationTypeId: "ie_coal_phase_out", policyOptionIndex: 0, scope: "national" },
      { legislationTypeId: "de.sec.carbonPrice", policyOptionIndex: 2, scope: "national" },
      { legislationTypeId: "jp.sec.cleanPowerStandard", policyOptionIndex: 1, scope: "national" },
      { legislationTypeId: "cn.sec.coalPhaseOut", policyOptionIndex: 4, scope: "national" },
      { legislationTypeId: "us.sec.cleanPowerStandard", policyOptionIndex: 4, scope: "state" },
      { legislationTypeId: "us.sec.automationTax", policyOptionIndex: 4, scope: "national" },
    ]);
    expect(policies.get("US")).toEqual({
      carbonPrice: 3,
      coalPhaseOut: 0,
      cleanPowerStandard: 0,
      mineralsRecycling: 0,
    });
    expect(policies.get("UK")?.coalPhaseOut).toBe(4);
    expect(policies.get("UK")?.mineralsRecycling).toBe(4);
    expect(policies.get("IE")?.carbonPrice).toBe(3);
    expect(policies.get("IE")?.cleanPowerStandard).toBe(0);
    expect(policies.get("IE")?.coalPhaseOut).toBe(4);
    expect(policies.get("DE")?.carbonPrice).toBe(2);
    expect(policies.get("JP")?.cleanPowerStandard).toBe(1);
    expect(policies.get("CN")?.coalPhaseOut).toBe(4);
  });
});

describe("summarisePowerFleet", () => {
  const sectors = [
    {
      sectorType: "energy",
      strategyId: "renewables",
      stateId: "a",
      countryId: "US",
      capitalStock: 90,
    },
    {
      sectorType: "energy",
      strategyId: "standard",
      stateId: "b",
      countryId: "US",
      capitalStock: 110,
    },
    {
      sectorType: "energy",
      strategyId: "renewables",
      stateId: "c",
      countryId: "UK",
      capitalStock: 50,
    },
    {
      sectorType: "energy",
      strategyId: "grid_storage_utility",
      stateId: "c",
      countryId: "UK",
      capitalStock: 20,
    },
    { sectorType: "retail", strategyId: null, stateId: "a", countryId: "US", capitalStock: 999 },
  ];

  it("prices clean shares nationally and the renewables penalty by region", () => {
    const fleet = summarisePowerFleet(sectors);
    expect(fleet.cleanShareByCountry.get("US")).toBeCloseTo(0.45);
    expect(fleet.cleanShareByCountry.get("UK")).toBe(1);
    expect(fleet.renewablesPenaltyByState.get("a")).toBeGreaterThan(0);
    expect(fleet.renewablesPenaltyByState.has("b")).toBe(false);
    // Firmed at the target ratio.
    expect(fleet.renewablesPenaltyByState.has("c")).toBe(false);
  });

  it("lands the penalty on renewables output only, through the disaster channel", () => {
    const entry = renewablesReliabilityEntry(0.15);
    const hit = computeDisasterPenaltySplit(
      [entry],
      { sectorType: "energy", strategyId: "renewables" },
      10,
      true
    );
    expect(hit.productionPenalty).toBeCloseTo(-15);
    const miss = computeDisasterPenaltySplit(
      [entry],
      { sectorType: "energy", strategyId: "nuclear" },
      10,
      true
    );
    expect(miss.productionPenalty).toBe(0);
  });
});

describe("withEnergyTransition", () => {
  const context = {
    startingYear: 2027,
    policyByCountry: new Map([
      ["US", { carbonPrice: 4, coalPhaseOut: 0, cleanPowerStandard: 0, mineralsRecycling: 0 }],
    ]),
    cleanShareByCountry: new Map([["US", 0.4]]),
  };

  it("is neutral outside opted-in worlds", () => {
    expect(
      withEnergyTransition(NEUTRAL_TECH_EFFECTS, undefined, { countryId: "US" }, "energy", 2040)
    ).toBe(NEUTRAL_TECH_EFFECTS);
  });

  it("charges a coal plant under a carbon price and spares one abroad without laws", () => {
    const us = withEnergyTransition(
      NEUTRAL_TECH_EFFECTS,
      context,
      { countryId: "US", strategyId: "standard", capacityVintageYear: 2020 },
      "energy",
      2030
    );
    expect(us.inputRateMult.coal).toBeGreaterThan(1);
    const elsewhere = withEnergyTransition(
      NEUTRAL_TECH_EFFECTS,
      context,
      { countryId: "FR", strategyId: "standard", capacityVintageYear: 2020 },
      "energy",
      2030
    );
    expect(elsewhere).toBe(NEUTRAL_TECH_EFFECTS);
  });

  it("uses a stored vintage before the opening default", () => {
    expect(sectorVintageYear({ capacityVintageYear: 2031 }, "energy", 2027)).toBe(2031);
    expect(sectorVintageYear({ strategyId: "standard" }, "energy", 2027)).toBe(1999);
  });
});

describe("depositProspectCostMultiplier", () => {
  const cap = { resources: { iron: 10 }, extractedUnits: { iron: 5 * DEPOSIT_RESERVE_TURNS } };

  it("prices a half worked-out deposit at double from 2035 in the 2027 world only", () => {
    expect(depositProspectCostMultiplier(cap, "iron", { year: 2036, startingYear: 2027 })).toBe(2);
    expect(depositProspectCostMultiplier(cap, "iron", { year: 2030, startingYear: 2027 })).toBe(1);
    expect(depositProspectCostMultiplier(cap, "iron", { year: 2036, startingYear: 2007 })).toBe(1);
    expect(depositProspectCostMultiplier(null, "iron", { year: 2036, startingYear: 2027 })).toBe(1);
  });
});
