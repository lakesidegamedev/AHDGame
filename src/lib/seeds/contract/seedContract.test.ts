import { describe, expect, it } from "vitest";
import { SEED_PRESET_IDS } from "@/lib/constants/turnTime";
import { selectPresetBundle, selectPresetBundleOptional } from "@/lib/seeds/presetSelector";
import { assertSeedContractForReset } from "@/lib/admin/resetPreflight";
import { checkSeedContract } from "./checkSeedContract";
import { ERA_INVARIANT_DATASETS, PRESET_DATASETS } from "./registry";
import { REGION_TABLES } from "./regionTables";
import { SeedContractError, type SeedContractGap } from "./seedContractError";
import { backgroundCountriesFor } from "@/lib/world/eraRoster";

function gapKey(gap: SeedContractGap): string {
  if (gap.detail.startsWith("no authored")) return `${gap.dataset} missing`;
  if (gap.detail.includes("identical to")) return `${gap.dataset} duplicate`;
  return `${gap.dataset} ${gap.detail.split(":")[0]}`;
}

describe("seed contract registry", () => {
  it("names every dataset once", () => {
    const ids = [...PRESET_DATASETS, ...ERA_INVARIANT_DATASETS].map((dataset) => dataset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every era-invariant dataset a reason", () => {
    for (const dataset of ERA_INVARIANT_DATASETS) {
      expect(dataset.reason.length, dataset.id).toBeGreaterThan(20);
    }
  });

  it("registers a region table for every region seeder", () => {
    expect(Object.keys(REGION_TABLES).sort()).toEqual(
      [
        "AT",
        "BG",
        "BR",
        "CN",
        "DD",
        "DE",
        "ES",
        "FI",
        "FR",
        "GR",
        "HU",
        "IE",
        "IT",
        "JP",
        "NG",
        "PL",
        "RO",
        "RU",
        "SE",
        "TR",
        "UK",
        "US",
      ].sort()
    );
  });
});

describe("tier-aware requirements", () => {
  const dataset = (id: string) => PRESET_DATASETS.find((entry) => entry.id === id);

  it("requires regional overlays only where the country runs the full simulation", () => {
    expect(dataset("census:BR")?.requiredIn).not.toContain("2027-default");
    expect(dataset("metricPresets:NG")?.requiredIn).not.toContain("2027-default");
    expect(dataset("metricPresets:NG")?.requiredIn).toContain("2019-default");
    for (const countryId of ["US", "UK", "DE", "JP", "CN"]) {
      expect(dataset(`metricPresets:${countryId}`)?.requiredIn, countryId).toContain(
        "2027-default"
      );
    }
  });

  it("requires national figures for every 2027 background country", () => {
    for (const countryId of backgroundCountriesFor("2027-default")) {
      const national = dataset(`national:${countryId}`);
      expect(national?.requiredIn, countryId).toContain("2027-default");
      expect(national?.provide("2027-default"), countryId).toBeDefined();
    }
  });
});

describe("seed contract per preset", () => {
  // The pinned list is the current set of presets that may not seed and why.
  // A new gap fails here; authoring data that closes one means updating it.
  it.each(SEED_PRESET_IDS)("%s matches the recorded gap list", (preset) => {
    const keys = [...new Set(checkSeedContract(preset).map(gapKey))].sort();
    expect(keys).toMatchSnapshot();
  });

  it("checks the 2019 variants as the 2019 world", () => {
    expect(checkSeedContract("empty")).toEqual(checkSeedContract("2019-default"));
    expect(checkSeedContract("2019-no-parties")).toEqual(checkSeedContract("2019-default"));
  });

  it("rejects an unknown preset", () => {
    expect(checkSeedContract("2031-default")).toEqual([
      { dataset: "preset", detail: '"2031-default" is not a shipping preset' },
    ]);
  });
});

describe("reset preflight", () => {
  it("throws one error listing every gap before anything is written", () => {
    let caught: unknown;
    try {
      assertSeedContractForReset("1999-default");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SeedContractError);
    const error = caught as SeedContractError;
    expect(error.preset).toBe("1999-default");
    expect(error.gaps.length).toBe(checkSeedContract("1999-default").length);
    expect(error.message).toContain("electionAnchors");
    expect(error.message).toContain("alignment");
  });
});

describe("preset bundle selection never borrows", () => {
  const bundles = { "2019-default": "modern", "1991-default": "authored" };

  it("returns the preset's own bundle", () => {
    expect(selectPresetBundle("1991-default", bundles, "test:lane")).toBe("authored");
  });

  it("throws a SeedContractError naming the lane when the preset has none", () => {
    expect(() => selectPresetBundle("1999-default", bundles, "test:lane")).toThrow(
      SeedContractError
    );
    expect(() => selectPresetBundle("1999-default", bundles, "test:lane")).toThrow(/test:lane/);
  });

  it("reads the 2019 bundle only for the 2019 world's variants", () => {
    expect(selectPresetBundle("empty", bundles, "test:lane")).toBe("modern");
    expect(selectPresetBundle("2019-no-parties", bundles, "test:lane")).toBe("modern");
  });

  it("returns undefined from the optional variant instead of another preset's bundle", () => {
    expect(selectPresetBundleOptional("1953-default", bundles)).toBeUndefined();
  });
});
