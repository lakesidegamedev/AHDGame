import { describe, expect, it } from "vitest";
import { states2027 } from "@/lib/seeds/reference/states2027";
import { SeedContractError } from "@/lib/seeds/contract/seedContractError";
import { selectStatesBundleForPreset } from "./seedStates";

describe("selectStatesBundleForPreset", () => {
  it("selects the authored 2027 bundle", () => {
    expect(selectStatesBundleForPreset("2027-default")).toBe(states2027);
  });

  it("refuses a preset with no authored states", () => {
    expect(() => selectStatesBundleForPreset("2031-default")).toThrow(SeedContractError);
  });
});
