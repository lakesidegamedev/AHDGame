import { describe, expect, it } from "vitest";
import { isLegislationTypeActive } from "@/lib/era/legislationCatalog";
import { isMarketLiberalLegislationType } from "./billSponsorship";

describe("NPP sponsorship era filter", () => {
  it("excludes a windowed type before its window, includes it after, includes all when null", () => {
    const types = ["ie_ai_liability_act", "ie_agricultural_subsidies"]; // windowed 2027, always
    const at1995 = types.filter((id) => isLegislationTypeActive(id, 1995));
    const at2030 = types.filter((id) => isLegislationTypeActive(id, 2030));
    const legacy = types.filter((id) => isLegislationTypeActive(id, null));
    expect(at1995).toEqual(["ie_agricultural_subsidies"]);
    expect(at2030).toEqual(["ie_ai_liability_act", "ie_agricultural_subsidies"]);
    expect(legacy).toEqual(["ie_ai_liability_act", "ie_agricultural_subsidies"]);
  });
});

describe("isMarketLiberalLegislationType", () => {
  it("flags economic-system / price-control / SOE / farm-organization levers", () => {
    expect(isMarketLiberalLegislationType({ _id: "su_economic_system" })).toBe(true);
    expect(isMarketLiberalLegislationType({ _id: "pl_price_controls" })).toBe(true);
    expect(isMarketLiberalLegislationType({ _id: "br_state_enterprises" })).toBe(true);
    expect(
      isMarketLiberalLegislationType({ _id: "su_agriculture", subCategory: "Farm organization" })
    ).toBe(true);
  });

  it("leaves ordinary fiscal/healthcare types alone", () => {
    expect(isMarketLiberalLegislationType({ _id: "su_enterprise_levy" })).toBe(false);
    expect(isMarketLiberalLegislationType({ _id: "br_public_health" })).toBe(false);
    expect(isMarketLiberalLegislationType({ _id: "us_medicaid" })).toBe(false);
  });
});
