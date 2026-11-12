import { describe, it, expect } from "vitest";
import { SeedContractError } from "@/lib/seeds/contract/seedContractError";
import {
  assertKnownSeedPreset,
  eraForPreset,
  isKnownPreset,
  presetForEra,
  SEED_ERA_IDS,
  selectPresetBundle,
  selectPresetBundleOptional,
  strictEraForPreset,
  type EraId,
} from "./presetSelector";
import { SEED_PRESET_IDS } from "@/lib/constants/turnTime";

describe("eraForPreset", () => {
  it.each([
    ["1979-default", "1979"],
    ["1991-default", "1991"],
    ["1999-default", "1999"],
    ["2007-default", "2007"],
    ["2019-default", "2019"],
    ["2023-default", "2023"],
    ["2027-default", "2027"],
    ["empty", "2019"],
    ["2019-no-parties", "2019"],
    ["unknown-preset", "2019"],
  ])("maps %s to %s", (preset, expected) => {
    expect(eraForPreset(preset)).toBe(expected as EraId);
  });
});

describe("isKnownPreset", () => {
  it.each([
    "1979-default",
    "1991-default",
    "1999-default",
    "2007-default",
    "2019-default",
    "2023-default",
    "2027-default",
    "empty",
    "2019-no-parties",
  ])("returns true for %s", (preset) => {
    expect(isKnownPreset(preset)).toBe(true);
  });

  it.each(["custom", "2024-default", "", "random"])("returns false for %s", (preset) => {
    expect(isKnownPreset(preset)).toBe(false);
  });
});

describe("every shipping preset is wired", () => {
  it.each(SEED_PRESET_IDS)("%s is known and round-trips through its era", (preset) => {
    expect(isKnownPreset(preset)).toBe(true);
    expect(presetForEra(eraForPreset(preset))).toBe(preset);
  });

  it("lists one era per shipping preset, oldest first", () => {
    expect(SEED_ERA_IDS).toEqual(SEED_PRESET_IDS.map((preset) => preset.slice(0, 4)));
  });
});

describe("selectPresetBundle", () => {
  it("returns the requested bundle when present", () => {
    const bundles = {
      "2019-default": "a",
      "1991-default": "b",
    };
    expect(selectPresetBundle("1991-default", bundles, "test")).toBe("b");
  });

  it("throws a SeedContractError instead of falling back to 2019-default", () => {
    expect(() => selectPresetBundle("1999-default", { "2019-default": "x" }, "test")).toThrow(
      SeedContractError
    );
  });

  it("throws when no bundle exists at all", () => {
    expect(() => selectPresetBundle("x", {}, "test")).toThrow(SeedContractError);
  });

  it("reads the 2019 bundle for the 2019 world's variants", () => {
    for (const preset of ["2019-default", "empty", "2019-no-parties"]) {
      expect(selectPresetBundle(preset, { "2019-default": "modern" }, "test")).toBe("modern");
    }
  });
});

describe("selectPresetBundleOptional", () => {
  it("returns the requested bundle when present", () => {
    expect(selectPresetBundleOptional("1991-default", { "1991-default": "b" })).toBe("b");
  });

  it("returns undefined rather than another preset's bundle", () => {
    expect(selectPresetBundleOptional("unknown", { "2019-default": "fallback" })).toBeUndefined();
    expect(
      selectPresetBundleOptional("1991-default", { "1953-default": "x", "1979-default": "y" })
    ).toBeUndefined();
  });
});

describe("strictEraForPreset", () => {
  it.each(["1953-default", "2027-default", "empty", "2019-no-parties"])(
    "maps known preset %s like eraForPreset",
    (preset) => {
      expect(strictEraForPreset(preset)).toBe(eraForPreset(preset));
    }
  );

  it.each([undefined, null, "", "unknown-preset"])("refuses %j with a SeedContractError", (bad) => {
    expect(() => strictEraForPreset(bad)).toThrow(SeedContractError);
    expect(() => assertKnownSeedPreset(bad)).toThrow(SeedContractError);
  });

  it("names the preset in the error", () => {
    expect(() => strictEraForPreset("1850-default")).toThrow(/1850-default/);
    expect(() => strictEraForPreset(undefined)).toThrow(/no preset given/);
  });

  it("leaves the runtime lookup fail-safe for the same inputs", () => {
    expect(eraForPreset("unknown-preset")).toBe("2019");
    expect(eraForPreset("")).toBe("2019");
  });
});
