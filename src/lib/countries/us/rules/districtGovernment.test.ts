import { describe, expect, it } from "vitest";
import { regionCountLabel, regionHasNoLocalGovernment } from "./districtGovernment";

describe("regions without local government", () => {
  it("covers DC only", () => {
    expect(regionHasNoLocalGovernment("US", "DC")).toBe(true);
    expect(regionHasNoLocalGovernment("US", "OH")).toBe(false);
    expect(regionHasNoLocalGovernment("CA", "DC")).toBe(false);
  });
});

describe("region count label", () => {
  it("names DC apart from the states", () => {
    expect(regionCountLabel("US", 51, "States")).toBe("50 states and DC");
    expect(regionCountLabel("CA", 13, "Provinces")).toBe("13 provinces");
  });
});
