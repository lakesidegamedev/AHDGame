import { describe, expect, it } from "vitest";
import {
  buyerCommodityUse,
  sectorUsesCommodity,
  supplyAgreementReachProblem,
  supplyReachMessage,
} from "./deliveryReach";
import { agreementDeliveryStatus } from "./deliveryStatus";

const healthcare = (stateId: string, over: Record<string, unknown> = {}) => ({
  sectorType: "healthcare",
  strategyId: "standard",
  stateId,
  ...over,
});

describe("sectorUsesCommodity", () => {
  it("reads the plant's input recipe", () => {
    expect(sectorUsesCommodity(healthcare("TX"), "real_estate_services", 1)).toBe(true);
    expect(sectorUsesCommodity(healthcare("TX"), "steel", 1)).toBe(false);
  });

  it("ignores mothballed plants", () => {
    expect(
      sectorUsesCommodity(healthcare("TX", { mothballed: true }), "real_estate_services", 1)
    ).toBe(false);
  });
});

describe("supplyAgreementReachProblem", () => {
  const use = buyerCommodityUse(
    [healthcare("TX"), healthcare("OH"), healthcare("TX")],
    "real_estate_services",
    1
  );

  it("lists the states where the buyer's plants use the commodity", () => {
    expect(use).toEqual({ usesAnywhere: true, states: ["OH", "TX"] });
  });

  it("allows a local service contract in a state where the buyer has a using plant", () => {
    expect(
      supplyAgreementReachProblem({
        commodity: "real_estate_services",
        stateId: "TX",
        buyerUse: use,
      })
    ).toBeNull();
  });

  it("refuses a local service contract in a state where the buyer has no plant", () => {
    const problem = supplyAgreementReachProblem({
      commodity: "real_estate_services",
      stateId: "DC",
      buyerUse: use,
    });
    expect(problem).toEqual({ code: "buyerNotInState", stateId: "DC", buyerStates: ["OH", "TX"] });
    const message = supplyReachMessage(problem!, {
      commodityLabel: "Real estate services",
      readerIsBuyer: true,
    });
    expect(message).toContain("same state");
    expect(message).toContain("DC");
    expect(message).toContain("OH, TX");
  });

  it("does not tie a shippable good to the buyer's state", () => {
    const steelUse = buyerCommodityUse(
      [{ sectorType: "construction", strategyId: "standard", stateId: "TX" }],
      "steel",
      1
    );
    expect(
      supplyAgreementReachProblem({ commodity: "steel", stateId: "NY", buyerUse: steelUse })
    ).toBeNull();
  });

  it("refuses any commodity the buyer's plants never consume", () => {
    const problem = supplyAgreementReachProblem({
      commodity: "steel",
      buyerUse: buyerCommodityUse([healthcare("TX")], "steel", 1),
    });
    expect(problem).toEqual({ code: "buyerDoesNotUse" });
    expect(
      supplyReachMessage(problem!, { commodityLabel: "Steel", readerIsBuyer: false })
    ).toContain("The buyer has no active plant that uses Steel");
  });
});

describe("agreementDeliveryStatus", () => {
  const base = {
    commodity: "real_estate_services" as const,
    volumeCap: 70,
    lastDeliveryTurn: 600,
  };

  it("is silent before the first settlement and on a full delivery", () => {
    expect(agreementDeliveryStatus({ ...base, lastDeliveryTurn: undefined })).toBeNull();
    expect(
      agreementDeliveryStatus({ ...base, lastDeliveredUnits: 70, lastBuyerConsumptionUnits: 90 })
    ).toBeNull();
  });

  it("says the buyer cannot receive when its plants used none", () => {
    expect(
      agreementDeliveryStatus({
        ...base,
        lastDeliveredUnits: 0,
        lastAchievableUnits: 0,
        lastBuyerConsumptionUnits: 0,
      })
    ).toEqual({ code: "buyerCannotReceive", stateScoped: true });
  });

  it("blames the supplier when the buyer had demand but nothing was produced", () => {
    expect(
      agreementDeliveryStatus({
        ...base,
        lastDeliveredUnits: 0,
        lastAchievableUnits: 0,
        lastBuyerConsumptionUnits: 80,
      })
    ).toEqual({ code: "supplierProducedNone" });
  });

  it("reports a supplier that made only part of the cap", () => {
    expect(
      agreementDeliveryStatus({
        ...base,
        lastDeliveredUnits: 12,
        lastAchievableUnits: 12,
        lastBuyerConsumptionUnits: 80,
      })
    ).toEqual({ code: "supplierProducedLess", achievable: 12, cap: 70 });
  });

  it("reports a buyer that used less than the cap", () => {
    expect(
      agreementDeliveryStatus({
        ...base,
        lastDeliveredUnits: 20,
        lastAchievableUnits: 20,
        lastBuyerConsumptionUnits: 20,
      })
    ).toEqual({ code: "buyerUsedLess", used: 20, cap: 70 });
  });

  it("does not read a rounded zero as no output when units were delivered", () => {
    expect(
      agreementDeliveryStatus({
        commodity: "steel",
        volumeCap: 1.3,
        lastDeliveryTurn: 600,
        lastDeliveredUnits: 0.4,
        lastAchievableUnits: 0,
        lastBuyerConsumptionUnits: 0.4,
      })
    ).toEqual({ code: "buyerUsedLess", used: 0.4, cap: 1.3 });
  });
});
