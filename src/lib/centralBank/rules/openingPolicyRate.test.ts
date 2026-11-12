import { describe, expect, it } from "vitest";
import {
  getOpeningPolicyRate,
  HISTORICAL_POLICY_RATES_1991,
  OPENING_POLICY_RATES_2027,
} from "./openingPolicyRate";

describe("Balanced 1991 opening policy rates", () => {
  it.each([
    ["US", 4],
    ["UK", 4.5],
    ["JP", 3],
    ["DE", 4],
    ["IE", 4.5],
  ] as const)("%s starts with affordable new borrowing", (country, expected) => {
    expect(getOpeningPolicyRate(country, 1991, 3)).toBe(expected);
  });
  it.each([1953, 1979, 1999, 2019, undefined])("leaves year %s unchanged", (year) => {
    expect(getOpeningPolicyRate("JP", year, 1)).toBe(1);
  });
  it("bounds every other opening rate and retains low defaults", () => {
    expect(getOpeningPolicyRate("FR", 1991, 9.5)).toBe(5);
    expect(getOpeningPolicyRate("CN", 1991, 2.75)).toBe(2.75);
  });
  it("preserves the historical benchmarks as provenance", () => {
    expect(HISTORICAL_POLICY_RATES_1991).toMatchObject({ US: 7, UK: 13.88, JP: 6 });
  });
});

describe("January 2027 opening policy rates", () => {
  it.each([
    ["US", 3.6],
    ["UK", 3.75],
    ["DE", 2],
    ["JP", 0.75],
    ["CN", 3],
  ] as const)("%s opens on its authored 2027 rate", (country, expected) => {
    expect(getOpeningPolicyRate(country, 2027, 9)).toBe(expected);
  });
  it("covers the fully simulated economies", () => {
    expect(Object.keys(OPENING_POLICY_RATES_2027)).toEqual(
      expect.arrayContaining(["CN", "DE", "JP", "UK", "US"])
    );
  });
  it("puts every euro member on the ECB rate, whatever its configured default", () => {
    for (const member of ["FR", "IT", "ES", "GR", "AT", "FI", "IE"] as const) {
      expect(getOpeningPolicyRate(member, 2027, 14)).toBe(OPENING_POLICY_RATES_2027.DE);
    }
  });
  it("leaves countries without an authored rate on their default", () => {
    expect(getOpeningPolicyRate("BR", 2027, 8)).toBe(8);
    expect(getOpeningPolicyRate("TR", 2027, 20)).toBe(20);
  });
  it("applies only to a 2027 start", () => {
    expect(getOpeningPolicyRate("US", 2028, 3)).toBe(3);
  });
});
