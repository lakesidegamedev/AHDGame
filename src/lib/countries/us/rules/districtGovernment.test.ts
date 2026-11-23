import { describe, expect, it } from "vitest";
import { regionHasNoLocalGovernment } from "./districtGovernment";

describe("regions without local government", () => {
  it("covers DC only", () => {
    expect(regionHasNoLocalGovernment("US", "DC")).toBe(true);
    expect(regionHasNoLocalGovernment("US", "OH")).toBe(false);
    expect(regionHasNoLocalGovernment("CA", "DC")).toBe(false);
  });
});
