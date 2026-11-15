import { describe, expect, it } from "vitest";
import { addDemandClaim, isStateServiceSupplyMix, netUnmetDemandUnits } from "./demandClaims";

describe("isStateServiceSupplyMix", () => {
  it("accepts a mix of state-scoped services only", () => {
    expect(isStateServiceSupplyMix({ healthcare_services: 0.5 })).toBe(true);
    expect(isStateServiceSupplyMix({ construction_services: 0.45 })).toBe(true);
  });
  it("rejects a mix with a reachable leg", () => {
    expect(isStateServiceSupplyMix({ freight: 0.45, consulting_services: 0.25 })).toBe(false);
    expect(isStateServiceSupplyMix({ steel: 0.3 })).toBe(false);
  });
  it("rejects an empty mix", () => {
    expect(isStateServiceSupplyMix({})).toBe(false);
    expect(isStateServiceSupplyMix({ healthcare_services: 0 })).toBe(false);
  });
});

describe("netUnmetDemandUnits", () => {
  it("subtracts claimed units and floors at zero", () => {
    expect(netUnmetDemandUnits(100, 30)).toBe(70);
    expect(netUnmetDemandUnits(100, 500)).toBe(0);
    expect(netUnmetDemandUnits(100, undefined)).toBe(100);
  });
  it("keeps an unreadable gap unreadable", () => {
    expect(netUnmetDemandUnits(null, 30)).toBeNull();
    expect(netUnmetDemandUnits(Number.NaN, 30)).toBeNull();
  });
});

describe("addDemandClaim", () => {
  it("accumulates positive amounts and ignores the rest", () => {
    const claims = new Map<string, number>();
    addDemandClaim(claims, "a", 5);
    addDemandClaim(claims, "a", 7);
    addDemandClaim(claims, "a", -3);
    addDemandClaim(claims, "b", Number.NaN);
    expect(claims.get("a")).toBe(12);
    expect(claims.has("b")).toBe(false);
  });
});
